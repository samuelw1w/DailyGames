// Hole UI: drawing, the two taps, the game loop. Rules and physics live in core/sim.js.
import {
  GAME_ID, TICKS_PER_SEC, ASSIST_MARK, GREEN, AIM_PERIOD, POWER_PERIOD, PUTT_AIM_PERIOD,
  dailyCourse, makeCourse, groundY, clubFor, aimAt, powerAt, puttLine, puttReach,
  createRound, startShot, stepShot, endShot, putt, scoreName, pointsFor, versusPar, shareText,
} from "./core/sim.js";
import { dayKey, parseDayKey, puzzleNumber } from "../../shared/daily.js";
import { gameStore, clientId } from "../../shared/storage.js";
import { activeDay } from "../../shared/account.js";
import { submitPlay } from "../../shared/api.js";
import { confetti } from "../../shared/confetti.js";
import { modal, wireShare, startCountdown, showRank, seriesButton, pointsLine, lockScreen } from "../../shared/ui.js";
import { GAMES } from "../../shared/registry.js";

const META = GAMES.find((g) => g.id === GAME_ID);
const TODAY = activeDay(); // today, or an earlier day a Plus member has opened
const PUZZLE_NO = puzzleNumber(META.launchDay, TODAY);
const store = gameStore(GAME_ID);

const TICK_MS = 1000 / TICKS_PER_SEC;
const SLOW = 0.5;        // slow motion runs everything at half speed
const PUTT_TICKS = 55;   // ticks a putt takes to run out
const REST = 40;         // ticks the ball sits before the next stroke

const $ = (s) => document.querySelector(s);
const view = $("#view");
$("#stamp").textContent = `No. ${PUZZLE_NO}`;

// Canvas colors come from the page's theme so the hole always matches the rest of the UI.
const css = getComputedStyle(document.documentElement);
const hex = (name) => css.getPropertyValue(name).trim();
const rgba = (h, a) => `rgba(${parseInt(h.slice(1, 3), 16)}, ${parseInt(h.slice(3, 5), 16)}, ${parseInt(h.slice(5, 7), 16)}, ${a})`;
const C = { accent: hex("--accent"), text: hex("--text"), ground: hex("--surface-2"), dim: hex("--dim") };

// The hole in progress: { mode, course, round, taps, marks, trails, phase, i, j, shot, roll, ... }.
// `phase` is "aim" (first tap pending), "power" (second tap pending), "fly" (a full shot in
// motion), "roll" (a putt running) or "rest". `trails` holds the path of every full shot.
let S = null;
let raf = 0, last = 0, acc = 0;
let paused = false;
let assist = !!store.flag("assist");

const windText = ({ wind }) => (wind ? `wind ${Math.abs(wind)} mph ${wind < 0 ? "left" : "right"}` : "no wind");
const breakText = ({ slope }) => (slope ? `breaks ${Math.abs(slope)} ${slope < 0 ? "left" : "right"}` : "a flat green");

/* ---------------- Drawing ---------------- */

function prep(canvas) {
  const dpr = Math.min(devicePixelRatio || 1, 3);
  const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
  if (!w) return null;
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  return { ctx, w, h, dpr };
}

/**
 * The hole from the side: a two-tone silhouette (ground, with the green picked out), the flag,
 * every shot so far as a dotted line, and the ball. `scene` is { course, trails, ball, aim }.
 */
function drawHole(canvas, scene) {
  const p = prep(canvas);
  if (!p) return;
  const { ctx, w, h, dpr } = p;
  const { course } = scene;
  const span = (course.heights.length - 1) * 30, pad = 14;
  const k = w / (span + pad * 2);            // canvas pixels per yard
  const base = h * 0.8;                      // where height 0 sits
  const X = (x) => (x + pad) * k, Y = (y) => base - y * k;
  const px = (n) => n * dpr;

  // Ground
  ctx.fillStyle = C.ground;
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(0, Y(groundY(course, 0)));
  for (let x = 0; x <= span; x += 3) ctx.lineTo(X(x), Y(groundY(course, x)));
  ctx.lineTo(w, Y(groundY(course, span)));
  ctx.lineTo(w, h);
  ctx.fill();
  const along = (from, to, color, width) => {
    ctx.strokeStyle = color; ctx.lineWidth = px(width);
    ctx.beginPath();
    for (let x = from; x <= to; x += 2) ctx.lineTo(X(x), Y(groundY(course, x)) + px(width / 2));
    ctx.stroke();
  };
  if (course.pond) along(course.pond[0], course.pond[1], rgba(C.text, 0.3), 4);  // water
  along(course.length - GREEN, course.length + GREEN, C.accent, 3);               // the green

  // Flag
  const fx = X(course.length), fy = Y(groundY(course, course.length));
  ctx.strokeStyle = C.text; ctx.lineWidth = px(1.5);
  ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx, fy - px(30)); ctx.stroke();
  ctx.fillStyle = C.accent;
  ctx.beginPath(); ctx.moveTo(fx, fy - px(30)); ctx.lineTo(fx + px(13), fy - px(25)); ctx.lineTo(fx, fy - px(20)); ctx.fill();

  // Shots so far, dotted
  ctx.setLineDash([px(1.5), px(5)]);
  ctx.lineWidth = px(1.5);
  scene.trails.forEach((trail) => {
    ctx.strokeStyle = rgba(C.accent, trail === scene.live ? 1 : 0.55);
    ctx.beginPath();
    trail.forEach(([x, y]) => ctx.lineTo(X(x), Y(y) - px(4)));
    ctx.stroke();
  });
  ctx.setLineDash([]);

  if (scene.aim) {
    const [x, y] = scene.ball, [fwd, up] = scene.aim;
    ctx.strokeStyle = C.accent; ctx.lineWidth = px(2);
    ctx.setLineDash([px(5), px(6)]);
    ctx.beginPath(); ctx.moveTo(X(x) + fwd * px(10), Y(y) - px(4) - up * px(10)); ctx.lineTo(X(x) + fwd * px(52), Y(y) - px(4) - up * px(52)); ctx.stroke();
    ctx.setLineDash([]);
  }
  if (scene.ball) {
    ctx.fillStyle = C.text;
    ctx.beginPath(); ctx.arc(X(scene.ball[0]), Y(scene.ball[1]) - px(4), px(4), 0, 7); ctx.fill();
  }
}

/**
 * The green from above: the cup at the top, the ball below it. `scene` is { course, feet, i,
 * aiming, run, drift, holed } where `run` and `drift` place a ball that has been hit.
 */
function drawGreen(canvas, scene) {
  const p = prep(canvas);
  if (!p) return;
  const { ctx, w, h, dpr } = p;
  const px = (n) => n * dpr;
  const { course, feet } = scene;
  const k = (h - px(46)) / puttReach(feet);  // canvas pixels per foot: a full-power putt just fits
  const bx = w / 2, by = h - px(22);
  const at = (run, drift) => [bx + drift * k, by - run * k];

  // The cup
  const [cx, cy] = at(feet, 0);
  ctx.strokeStyle = C.accent; ctx.lineWidth = px(2.5);
  ctx.beginPath(); ctx.arc(cx, cy, Math.max(px(6), 0.55 * k), 0, 7); ctx.stroke();

  // The line the ball will take, as far as the cup: aim and break together
  if (scene.aiming || scene.run !== undefined) {
    const reach = Math.max(0.01, scene.run ?? feet);
    ctx.strokeStyle = rgba(C.accent, scene.aiming ? 1 : 0.55); ctx.lineWidth = px(1.5);
    ctx.setLineDash(scene.aiming ? [px(5), px(6)] : [px(1.5), px(5)]);
    ctx.beginPath();
    for (let r = scene.aiming ? feet * 0.08 : 0; r <= (scene.aiming ? feet * 0.55 : reach); r += reach / 40) ctx.lineTo(...at(r, puttLine(course, scene.i, r)));
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (scene.holed) return; // it dropped
  ctx.fillStyle = C.text;
  ctx.beginPath(); ctx.arc(...at(scene.run ?? 0, scene.drift ?? 0), px(5), 0, 7); ctx.fill();
}

function draw(a) {
  const canvas = $("#course");
  const { course, round, phase } = S;
  const putting = S.green !== null;
  if (!putting) {
    const ball = S.shot ? [S.prev[0] + (S.shot.x - S.prev[0]) * a, S.prev[1] + (S.shot.y - S.prev[1]) * a] : [round.x, groundY(course, round.x)];
    const live = S.trails.at(-1);
    drawHole(canvas, { course, trails: S.trails, live: phase === "fly" ? live : null, ball: S.shot?.wet && phase === "rest" ? null : ball, aim: phase === "aim" ? flip(aimAt(S.i)) : phase === "power" ? flip(aimAt(S.aimTick)) : null });
    return;
  }
  // On the green. A struck putt eases along its line and stops (or drops).
  const g = S.green;
  if (phase === "aim" || phase === "power") return drawGreen(canvas, { course, feet: g.feet, i: phase === "aim" ? S.i : S.aimTick, aiming: true });
  const t = phase === "roll" ? Math.min(1, (S.t + a) / PUTT_TICKS) : 1;
  const eased = 1 - (1 - t) * (1 - t);
  const stop = g.result.holed ? g.feet : g.result.run;
  drawGreen(canvas, { course, feet: g.feet, i: S.aimTick, run: stop * eased, drift: puttLine(course, S.aimTick, stop * eased), holed: g.result.holed && t === 1 });
}

/** Shots always play toward the pin: from past it, the aim line points back. */
const flip = ([fwd, up]) => [S.round.x <= S.course.length ? fwd : -fwd, up];

/* ---------------- Game flow ---------------- */

function startGame(mode) {
  stopLoop();
  const course = mode === "daily" ? dailyCourse(TODAY) : makeCourse(Math.random);
  S = { mode, course, round: createRound(), taps: [], marks: "", trails: [], green: null, assistUsed: false, over: false, note: "Space bar on desktop" };
  view.innerHTML = `
    <div class="dg-row"><span id="stroke"></span><span id="left"></span></div>
    <div class="dg-zone" id="zone" role="button" tabindex="0" aria-label="Lock aim, then lock power">
      <canvas class="dg-stage" id="course"></canvas>
      <div class="meter" aria-hidden="true"><i id="meter"></i></div>
      <div class="dg-card dg-tap" aria-live="polite"><b id="tapTitle"></b><span id="tapSub"></span></div>
    </div>`;
  $("#zone").addEventListener("pointerdown", (e) => {
    if (!e.isPrimary || e.button > 0) return;
    e.preventDefault();
    tap();
  });
  nextStroke();
  acc = 0;
  last = performance.now();
  raf = requestAnimationFrame(frame);
}

function stopLoop() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
}

function nextStroke() {
  const { round } = S;
  S.green = round.feet === null ? null : { feet: round.feet, result: null };
  Object.assign(S, { phase: "aim", i: 0, j: 0, aimTick: 0, shot: null, tapQueued: false });
  renderHud();
}

/** The one input: first tap locks the aim, second tap locks the power. */
function tap() {
  if (!S || S.over || paused || (S.phase !== "aim" && S.phase !== "power")) return;
  S.tapQueued = true;
}

document.addEventListener("keydown", (e) => {
  if (e.code !== "Space" || e.repeat || !S || S.over || paused) return;
  if (e.target.closest?.("button, a, input, textarea, select")) return;
  e.preventDefault();
  tap();
});

function renderHud() {
  const { course, round, phase } = S;
  const putting = S.green !== null;
  const yards = Math.round(Math.abs(course.length - round.x));
  $("#sub").textContent = `${S.mode === "daily" ? "" : "Practice · "}Par ${course.par}, ${putting ? breakText(course) : windText(course)}`;
  $("#stroke").textContent = round.done ? `${round.strokes} ${round.strokes === 1 ? "stroke" : "strokes"}` : `Stroke ${round.strokes + 1}`;
  $("#left").textContent = round.done ? "" : putting ? `${Math.max(1, Math.round(round.feet))} ft to the cup` : `${yards} yd to pin`;
  $("#tapTitle").textContent = phase === "aim" ? "Tap to lock aim" : phase === "power" ? "Tap to lock power" : S.call;
  $("#tapSub").textContent = phase === "aim" || phase === "power" ? (S.note || (putting ? "Putter" : clubFor(yards).name)) : S.note;
  if (phase !== "power") $("#meter").style.width = "0";
}

function frame(now) {
  raf = requestAnimationFrame(frame);
  const dt = Math.min(100, now - last);
  last = now;
  if (!paused && !S.over) {
    acc += dt * (assist ? SLOW : 1);
    while (S && acc >= TICK_MS && !S.over) { acc -= TICK_MS; tick(); }
  }
  if (!S) return; // the hole just ended and the result screen took over
  if (S.phase === "power") $("#meter").style.width = `${powerAt(S.j) * 100}%`;
  draw(S.over ? 1 : acc / TICK_MS);
}

function tick() {
  const { course, round } = S;
  const tapped = S.tapQueued;
  S.tapQueued = false;
  const putting = S.green !== null;

  if (S.phase === "aim") {
    if (tapped) { S.aimTick = S.i; S.j = 0; S.phase = "power"; S.note = ""; renderHud(); }
    else S.i = (S.i + 1) % (putting ? PUTT_AIM_PERIOD : AIM_PERIOD);
  } else if (S.phase === "power") {
    if (!tapped) { S.j = (S.j + 1) % POWER_PERIOD; return; }
    S.taps.push([S.aimTick, S.j]);
    if (assist) S.assistUsed = true;
    if (putting) {
      S.green.result = putt(course, round, S.aimTick, S.j);
      S.marks += "○";
      S.phase = "roll"; S.t = 0; S.call = "Putter"; S.note = "";
    } else {
      S.shot = startShot(course, round, S.aimTick, S.j);
      S.prev = [S.shot.x, S.shot.y];
      S.trails.push([[S.shot.x, S.shot.y]]);
      S.phase = "fly"; S.call = S.shot.club; S.note = "";
    }
    renderHud();
  } else if (S.phase === "fly") {
    const { shot } = S;
    S.prev = [shot.x, shot.y];
    stepShot(course, shot);
    S.trails.at(-1).push([shot.x, shot.y]);
    if (!shot.done) return;
    endShot(course, round, shot);
    S.marks += shot.wet ? "●💧" : "●";
    const left = Math.abs(course.length - round.x);
    S.call = round.holed ? "In the hole" : shot.wet ? "In the water" : round.feet !== null ? "On the green" : `${Math.round(Math.abs(shot.x - shot.from))} yards`;
    S.note = shot.wet ? "One stroke penalty. Play it again" : round.holed ? "" : round.feet !== null ? `${Math.max(1, Math.round(round.feet))} ft to the cup` : `${Math.round(left)} to the pin`;
    rest();
  } else if (S.phase === "roll") {
    if (++S.t < PUTT_TICKS) return;
    const { result } = S.green;
    S.call = result.holed ? "In the hole" : result.run < result.from ? "Short" : "It slides by";
    S.note = result.holed ? "" : `${Math.max(1, Math.round(round.feet))} ft back`;
    rest();
  } else if (--S.restLeft <= 0) {
    if (round.done) finish();
    else { S.note = ""; nextStroke(); }
  }
}

function rest() {
  S.phase = "rest";
  S.restLeft = REST;
  if (S.round.done && !S.round.holed) { S.call = "Picked up"; S.note = "That's the stroke limit"; }
  renderHud();
}

function finish() {
  const { mode, course, round } = S;
  S.over = true;
  const result = { total: pointsFor(round.strokes, course.par), strokes: round.strokes, par: course.par, holed: round.holed, taps: S.taps, marks: S.marks, assist: S.assistUsed };
  result.label = scoreName(round.strokes, course.par) + (result.assist ? ` ${ASSIST_MARK}` : "");
  let sent = null;
  if (mode === "daily") {
    store.saveDay(TODAY, result, result.total);
    sent = submitPlay(GAME_ID, TODAY, clientId(), { taps: result.taps, assist: result.assist });
  }
  if (round.strokes < course.par) confetti(round.strokes <= course.par - 2 ? 180 : 100);
  showSummary(mode, course, result, S.trails, sent);
}

/* ---------------- Result ---------------- */

/** Rebuild the path of every full shot from saved taps, for the picture on a return visit. */
function traceHole(course, taps) {
  const round = createRound(), trails = [];
  for (const [i, j] of taps) {
    if (round.done) break;
    if (round.feet !== null) { putt(course, round, i, j); continue; }
    const shot = startShot(course, round, i, j), trail = [[shot.x, shot.y]];
    while (!shot.done) { stepShot(course, shot); trail.push([shot.x, shot.y]); }
    endShot(course, round, shot);
    trails.push(trail);
  }
  return trails;
}

/** This week's seven holes, Monday to Sunday: { key, letter, result } for each day. */
function week() {
  const monday = parseDayKey(TODAY);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, n) => {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + n), key = dayKey(d);
    return { key, letter: "MTWTFSS"[n], result: store.getDay(key) };
  });
}

function showSummary(mode, course, result, trails, sent = null) {
  stopLoop();
  S = null;
  const daily = mode === "daily";
  const { strokes, par } = result;
  const diff = strokes - par;
  const share = shareText(PUZZLE_NO, result, result.marks);
  const st = store.stats();
  const days = week(), played = days.filter((d) => d.result);
  const weekDiff = played.reduce((sum, d) => sum + d.result.strokes - d.result.par, 0);
  $("#sub").textContent = `${daily ? "" : "Practice · "}Par ${par}, ${windText(course)}`;

  view.innerHTML = `
  <section class="dg-summary dg-enter">
    <div class="dg-verdict">
      <span class="big ${diff > 0 ? "lost" : ""}">${scoreName(strokes, par)}</span><span>${strokes} ${strokes === 1 ? "stroke" : "strokes"}, par ${par}${result.holed ? "" : " (picked up)"}</span>
      ${daily ? pointsLine(GAME_ID, result) : ""}
      ${result.assist ? `<p>${ASSIST_MARK} Played in slow motion.</p>` : ""}
    </div>
    <canvas class="dg-stage" id="card" role="img" aria-label="Your shots on the hole"></canvas>
    <p class="dg-rank" id="rank" hidden></p>
    ${daily ? `<div class="week" aria-label="This week's round">${days.map((d) => `<div class="${d.key === TODAY ? "today" : d.result ? "played" : ""}"><span>${d.letter}</span><b>${d.result ? versusPar(d.result.strokes - d.result.par) : ""}</b></div>`).join("")}</div>
    <p class="weekly">This week: ${versusPar(weekDiff)} through ${played.length} of 7</p>
    <div class="dg-stats">
      <div class="dg-stat"><b>${st.streak}</b><span>Day streak</span></div>
      <div class="dg-stat"><b>${st.played}</b><span>Played</span></div>
      <div class="dg-stat"><b>${versusPar(4 - (st.best ?? result.total))}</b><span>Best hole</span></div>
      <div class="dg-stat"><b id="cd">--:--:--</b><span>Next puzzle</span></div></div>` : "<p class=\"weekly\">Practice holes don't count toward your week.</p>"}
    <div class="dg-actions">
      ${daily ? seriesButton(TODAY) : ""}
      <button class="dg-btn plain" id="copyBtn" type="button">Share</button>
      <button class="dg-btn plain" id="practiceBtn" type="button">${daily ? "Play a practice hole" : "Another practice hole"}</button>
      ${!daily ? (store.getDay(TODAY) ? `<button class="dg-btn plain" id="backBtn" type="button">Back to today's result</button>` : `<button class="dg-btn plain" id="dailyBtn" type="button">Play today's hole</button>`) : ""}
    </div>
  </section>`;

  const end = trails.at(-1)?.at(-1);
  const scene = { course, trails, live: null, ball: result.holed ? null : end ?? null, aim: null };
  const card = $("#card");
  const paint = () => card.isConnected && drawHole(card, scene);
  paint();
  addEventListener("resize", paint);

  wireShare($("#copyBtn"), share);
  $("#practiceBtn").addEventListener("click", () => { startGame("practice"); window.scrollTo({ top: 0 }); });
  $("#backBtn")?.addEventListener("click", showSaved);
  $("#dailyBtn")?.addEventListener("click", () => startGame("daily"));
  startCountdown($("#cd"));
  if (daily) showRank($("#rank"), sent, GAME_ID, TODAY, result.total);
}

function showSaved() {
  const saved = store.getDay(TODAY), course = dailyCourse(TODAY);
  showSummary("daily", course, saved, traceHole(course, saved.taps));
}

/* ---------------- Slow motion and help ---------------- */

const assistBtn = $("#assistBtn");
function renderAssist() {
  assistBtn.textContent = `Slow motion: ${assist ? "on" : "off"}`;
  assistBtn.setAttribute("aria-pressed", String(assist));
}
assistBtn.addEventListener("click", () => {
  assist = !assist;
  store.setFlag("assist", assist);
  renderAssist();
});
renderAssist();

function howTo() {
  paused = true;
  modal({
    title: "How to play",
    body: `<ol>
      <li><b>Two taps per stroke.</b> The dashed line sweeps from a low shot to a high one: tap anywhere, or press Space, to lock it. Then the bar fills and empties: tap again to lock your power.</li>
      <li><b>The club picks itself.</b> You always get the club for the distance left, so a full bar goes a little past the pin. Half a bar is half as far.</li>
      <li><b>Mind the wind and the water.</b> Wind carries the ball all the way down. A ball in the water costs a stroke and is played again.</li>
      <li><b>On the green, you putt.</b> The view switches to above the cup. Lock the line, then the pace. Too hard and it runs by.</li>
      <li><b>One hole a day.</b> Seven days make a round: your scorecard runs Monday to Sunday.</li>
      <li><b>Slow motion</b> halves the speed if the timing is too quick. Results earned with it are marked ${ASSIST_MARK}.</li>
    </ol>`,
    onClose: () => { paused = false; last = performance.now(); },
  });
}
$("#howBtn").addEventListener("click", howTo);

/* ---------------- Boot ---------------- */
// A game the player hasn't unlocked shows how to open it instead.
if (!lockScreen(GAME_ID, view)) {
  if (store.getDay(TODAY)?.taps) showSaved();
  else {
    startGame("daily");
    if (!store.flag("seenHelp")) {
      store.setFlag("seenHelp");
      howTo();
    }
  }
}
