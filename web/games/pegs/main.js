// Pegs UI: drawing, the tap, the game loop. Physics and rules live in core/.
import { GAME_ID, ASSIST_MARK, dailyField, practiceField, resultOf, resultLabel, shareText } from "./core/puzzle.js";
import { WORLD, TICKS_PER_SEC, BALLS, TARGETS, BALL_R, PEG_R, LAUNCH_Y, launcherX, dropBall, stepBall, createGame, applyBall } from "./core/sim.js";
import { dayKey, puzzleNumber } from "../../shared/daily.js";
import { gameStore, clientId } from "../../shared/storage.js";
import { submitPlay } from "../../shared/api.js";
import { confetti } from "../../shared/confetti.js";
import { modal, wireCopy, startCountdown, showRank } from "../../shared/ui.js";
import { GAMES } from "../../shared/registry.js";

const META = GAMES.find((g) => g.id === GAME_ID);
const TODAY = dayKey();
const PUZZLE_NO = puzzleNumber(META.launchDay, TODAY);
const store = gameStore(GAME_ID);

const TICK_MS = 1000 / TICKS_PER_SEC;
const SLOW = 0.5;   // slow motion runs everything at half speed
const TRAIL = 14;   // ticks of fading trail behind the ball
const PING = 26;    // ticks a struck peg takes to ping and fade
const REST = 24;    // ticks between one ball leaving and the launcher being live again

const $ = (s) => document.querySelector(s);
const view = $("#view");
$("#stamp").textContent = `No. ${PUZZLE_NO}`;

// Canvas colors come from the page's theme so the field always matches the rest of the UI.
const css = getComputedStyle(document.documentElement);
const hex = (name) => css.getPropertyValue(name).trim();
const rgba = (h, a) => `rgba(${parseInt(h.slice(1, 3), 16)}, ${parseInt(h.slice(3, 5), 16)}, ${parseInt(h.slice(5, 7), 16)}, ${a})`;
const C = { accent: hex("--accent"), text: hex("--text"), peg: hex("--dim") };

// The game in progress: { mode, field, game, i, ball, drops, pings, trail, prev, rest, ... }.
// `i` is the launcher's tick; `ball` is the ball in play, or null while the launcher waits.
let S = null;
let raf = 0, last = 0, acc = 0;
let paused = false;
let assist = !!store.flag("assist");

const targetsLeft = () => S.field.pegs.filter((p, n) => p.target && S.game.alive[n]).length;

/* ---------------- Drawing ---------------- */

function draw(canvas, a) {
  const dpr = Math.min(devicePixelRatio || 1, 3);
  const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
  if (!w) return;
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  const k = w / WORLD.w;
  const px = (n) => (n * dpr) / k; // n screen pixels, in world units
  const ctx = canvas.getContext("2d");
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.clearRect(0, 0, WORLD.w, WORLD.h);
  ctx.lineCap = "round";

  // Pegs: grey dots, with the ones to clear in the accent color.
  S.field.pegs.forEach((p, n) => {
    if (!S.game.alive[n]) return;
    ctx.fillStyle = p.target ? C.accent : C.peg;
    ctx.beginPath(); ctx.arc(p.x, p.y, PEG_R, 0, 7); ctx.fill();
  });
  // Struck pegs ping: a ring that spreads as the dot fades.
  for (const ping of S.pings) {
    const p = S.field.pegs[ping.n], f = Math.min(1, (S.clock + a - ping.at) / PING);
    const color = p.target ? C.accent : C.text;
    ctx.fillStyle = rgba(color, (1 - f) * 0.9);
    ctx.beginPath(); ctx.arc(p.x, p.y, PEG_R, 0, 7); ctx.fill();
    ctx.strokeStyle = rgba(color, (1 - f) * 0.8);
    ctx.lineWidth = px(1.5);
    ctx.beginPath(); ctx.arc(p.x, p.y, PEG_R + f * 16, 0, 7); ctx.stroke();
  }

  if (S.ball) {
    const ball = [S.prev[0] + (S.ball.x - S.prev[0]) * a, S.prev[1] + (S.ball.y - S.prev[1]) * a];
    const trail = [...S.trail, ball];
    for (let n = 1; n < trail.length; n++) {
      const f = n / trail.length;
      ctx.strokeStyle = rgba(C.text, f * 0.35);
      ctx.lineWidth = px(1 + f * 5);
      ctx.beginPath(); ctx.moveTo(trail[n - 1][0], trail[n - 1][1]); ctx.lineTo(trail[n][0], trail[n][1]); ctx.stroke();
    }
    ctx.fillStyle = C.text;
    ctx.beginPath(); ctx.arc(ball[0], ball[1], BALL_R, 0, 7); ctx.fill();
  } else if (!S.over && S.rest <= 0) {
    // The launcher: the next ball sliding along the top, with a short line showing where it will fall.
    const x = launcherX(S.field, S.i) + (launcherX(S.field, (S.i + 1) % S.field.period) - launcherX(S.field, S.i)) * a;
    ctx.strokeStyle = C.accent;
    ctx.lineWidth = px(2);
    ctx.setLineDash([px(4), px(7)]);
    ctx.beginPath(); ctx.moveTo(x, LAUNCH_Y + 18); ctx.lineTo(x, LAUNCH_Y + 52); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = C.text;
    ctx.beginPath(); ctx.arc(x, LAUNCH_Y, BALL_R, 0, 7); ctx.fill();
  }
}

/* ---------------- Game flow ---------------- */

function startGame(mode) {
  stopLoop();
  const field = mode === "daily" ? dailyField(TODAY) : practiceField(TODAY);
  S = { mode, field, game: createGame(field), i: 0, clock: 0, ball: null, drops: [], pings: [], trail: [], rest: 0, tapQueued: false, assistUsed: false, over: false };
  $("#sub").textContent = mode === "daily" ? "Clear the yellow pegs with five balls" : "Practice field";
  view.innerHTML = `
    <div class="dg-zone" id="zone" role="button" tabindex="0" aria-label="Drop the ball">
      <canvas class="dg-stage" id="field"></canvas>
      <div class="dg-segs" id="segs" aria-hidden="true">${"<i></i>".repeat(BALLS)}</div>
      <div class="dg-card dg-tap" aria-live="polite"><b id="tapTitle"></b><span id="tapSub"></span></div>
    </div>`;
  $("#zone").addEventListener("pointerdown", (e) => {
    if (!e.isPrimary || e.button > 0) return;
    e.preventDefault();
    tap();
  });
  renderHud();
  acc = 0;
  last = performance.now();
  raf = requestAnimationFrame(frame);
}

function stopLoop() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
}

/** The one input: let the ball go from wherever the launcher is. */
function tap() {
  if (!S || S.over || paused || S.ball || S.rest > 0) return;
  S.tapQueued = true;
}

document.addEventListener("keydown", (e) => {
  if (e.code !== "Space" || e.repeat || !S || S.over || paused) return;
  if (e.target.closest?.("button, a, input, textarea, select")) return;
  e.preventDefault();
  tap();
});

function renderHud() {
  const used = S.drops.length, left = targetsLeft();
  [...$("#segs").children].forEach((el, n) => { el.className = n < used ? "on" : ""; });
  $("#tapTitle").textContent = S.game.done ? (left ? "Out of balls" : "Cleared") : S.ball ? `${left} to go` : "Tap to drop";
  $("#tapSub").textContent = S.ball || S.game.done ? "" : used ? `${left} yellow ${left === 1 ? "peg" : "pegs"} left · ${BALLS - used} ${BALLS - used === 1 ? "ball" : "balls"}` : "Space bar on desktop";
}

function frame(now) {
  raf = requestAnimationFrame(frame);
  const dt = Math.min(100, now - last);
  last = now;
  if (!paused && !S.over) {
    acc += dt * (assist ? SLOW : 1);
    while (S && acc >= TICK_MS && !S.over) { acc -= TICK_MS; tick(); }
  }
  if (!S) return; // the game just ended and the result screen took over
  draw($("#field"), acc / TICK_MS);
}

function tick() {
  const { field, game } = S;
  S.clock++;
  S.pings = S.pings.filter((p) => S.clock - p.at < PING);
  const tapped = S.tapQueued;
  S.tapQueued = false;
  // The launcher keeps sliding while a ball is in play, so every drop is a fresh read.
  S.i = (S.i + 1) % field.period;

  if (S.ball) {
    const { ball } = S, before = ball.hits.length;
    S.prev = [ball.x, ball.y];
    S.trail.push(S.prev);
    if (S.trail.length > TRAIL) S.trail.shift();
    stepBall(field, game.alive, ball);
    for (const n of ball.hits.slice(before)) S.pings.push({ n, at: S.clock });
    if (ball.hits.length > before) renderHud();
    if (ball.done) {
      applyBall(field, game, ball);
      S.ball = null;
      S.rest = game.done ? REST * 2 : REST;
      renderHud();
    }
    return;
  }
  if (S.rest > 0) {
    if (--S.rest === 0 && game.done) finish();
    return;
  }
  if (tapped) {
    S.drops.push(S.i);
    if (assist) S.assistUsed = true;
    S.ball = dropBall(field, S.i);
    S.prev = [S.ball.x, S.ball.y];
    S.trail = [];
    renderHud();
  }
}

function finish() {
  const { mode, game, field } = S;
  S.over = true;
  const result = { ...resultOf(game), perBall: game.perBall, drops: S.drops, assist: S.assistUsed };
  result.label = resultLabel(result);
  let sent = null;
  if (mode === "daily") {
    store.saveDay(TODAY, result, result.total);
    sent = submitPlay(GAME_ID, TODAY, clientId(), { drops: result.drops, assist: result.assist });
  }
  if (result.cleared === TARGETS) confetti(result.used <= 3 ? 160 : 90);
  showSummary(mode, field, result, sent);
}

/* ---------------- Result ---------------- */

/** Highest score on any day, preferring a result earned without slow motion. */
function bestResult() {
  let best = null;
  for (const day of Object.keys(store.history())) {
    const r = store.getDay(day);
    if (!r) continue;
    if (!best || r.total > best.total || (r.total === best.total && best.assist && !r.assist)) best = r;
  }
  return best;
}

function showSummary(mode, field, result, sent = null) {
  stopLoop();
  S = null;
  const daily = mode === "daily";
  const { cleared, used } = result;
  const won = cleared === TARGETS;
  const title = won ? ["One ball. Unreal.", "Two balls. Superb.", "Clean sweep.", "All cleared.", "Down to the last ball."][used - 1]
    : cleared >= 8 ? "So nearly." : cleared >= 5 ? "Half the field." : "The pegs won.";
  const share = shareText(daily ? `Pegs #${PUZZLE_NO}` : "Pegs practice", result);
  const st = store.stats(), best = bestResult();
  $("#sub").textContent = daily ? "Today's field" : "Practice field";

  view.innerHTML = `
  <section class="dg-summary dg-enter">
    <div class="dg-verdict">
      <span class="big">${cleared}</span><span>of ${TARGETS} cleared${won ? ` in ${used} ${used === 1 ? "ball" : "balls"}` : ""}</span>
      <h2>${title}</h2>
      ${result.assist ? `<p>${ASSIST_MARK} Played in slow motion.</p>` : ""}
    </div>
    <div class="dg-segs" aria-hidden="true">${Array.from({ length: BALLS }, (_, n) => `<i class="${n < used ? "on" : ""}"></i>`).join("")}</div>
    <p class="dg-rank" id="rank" hidden></p>
    ${daily ? `<div class="dg-stats">
      <div class="dg-stat"><b>${st.streak}</b><span>Day streak</span></div>
      <div class="dg-stat"><b>${st.played}</b><span>Played</span></div>
      <div class="dg-stat"><b>${best ? resultLabel(best) : "–"}</b><span>Best day</span></div>
      <div class="dg-stat"><b id="cd">--:--:--</b><span>Next puzzle</span></div></div>` : ""}
    <div class="dg-actions">
      <button class="dg-btn" id="copyBtn" type="button">Copy result</button>
      <button class="dg-btn plain" id="practiceBtn" type="button">${daily ? "Play a practice field" : "Another practice field"}</button>
      ${!daily ? (store.getDay(TODAY) ? `<button class="dg-btn plain" id="backBtn" type="button">Back to today's result</button>` : `<button class="dg-btn plain" id="dailyBtn" type="button">Play today's field</button>`) : ""}
    </div>
  </section>`;

  wireCopy($("#copyBtn"), share);
  $("#practiceBtn").addEventListener("click", () => { startGame("practice"); window.scrollTo({ top: 0 }); });
  $("#backBtn")?.addEventListener("click", showSaved);
  $("#dailyBtn")?.addEventListener("click", () => startGame("daily"));
  startCountdown($("#cd"));
  if (daily) showRank($("#rank"), sent, GAME_ID, TODAY, result.total);
}

const showSaved = () => showSummary("daily", dailyField(TODAY), store.getDay(TODAY));

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
      <li><b>One tap per ball.</b> The ball slides across the top. Tap anywhere, or press Space, to let it fall.</li>
      <li><b>Every peg it strikes disappears.</b> Clear all ${TARGETS} yellow pegs with ${BALLS} balls. Fewer balls is better.</li>
      <li><b>Nothing is random.</b> A ball dropped from the same spot always takes the same path, so where you let go is everything.</li>
      <li><b>Slow motion</b> halves the speed if the timing is too quick. Results earned with it are marked ${ASSIST_MARK}.</li>
    </ol>`,
    onClose: () => { paused = false; last = performance.now(); },
  });
}
$("#howBtn").addEventListener("click", howTo);

/* ---------------- Boot ---------------- */
if (store.getDay(TODAY)?.drops) showSaved();
else {
  startGame("daily");
  if (!store.flag("seenHelp")) {
    store.setFlag("seenHelp");
    howTo();
  }
}
