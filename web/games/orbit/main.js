// Orbit UI: drawing, the tap, the game loop. Physics and rules live in core/.
import { GAME_ID, dailyLevel, practiceLevel, scoreRun, resultLabel, shareText, ASSIST_MARK } from "./core/puzzle.js";
import { WORLD, MAX_JUMPS, TICKS_PER_SEC, createRun, step, replay } from "./core/sim.js";
import { puzzleNumber } from "../../shared/daily.js";
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
const SLOW = 0.5;   // slow motion runs the same physics at half speed
const TRAIL = 42;   // ticks of fading trail behind the ship
const AIM = 55;     // length of the dashed aim line, in world units

const $ = (s) => document.querySelector(s);
const view = $("#view");
$("#stamp").textContent = `No. ${PUZZLE_NO}`;

// Canvas colors come from the page's theme so the map always matches the rest of the UI.
const css = getComputedStyle(document.documentElement);
const hex = (name) => css.getPropertyValue(name).trim();
const rgba = (h, a) => `rgba(${parseInt(h.slice(1, 3), 16)}, ${parseInt(h.slice(3, 5), 16)}, ${parseInt(h.slice(5, 7), 16)}, ${a})`;
const C = { accent: hex("--accent"), text: hex("--text"), ring: hex("--dim"), bad: hex("--bad") };

let S = null;        // the game in progress: { mode, level, run, taps, paths, trail, prev, fx, ... }
let raf = 0, last = 0, acc = 0;
let paused = false;
let assist = !!store.flag("assist");

/* ---------------- Drawing ---------------- */

function fit(canvas) {
  const dpr = Math.min(devicePixelRatio || 1, 3);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  return (w * dpr) / WORLD.w; // canvas pixels per world unit
}

/**
 * Draw the star map. `scene` is { level, paths, at, ship, aim, trail, fx, now, still }:
 * `ship` is [x, y] or null, `aim` a unit vector or null, `still` true for the result picture.
 */
function drawScene(canvas, scene) {
  const k = fit(canvas);
  if (!k) return;
  const ctx = canvas.getContext("2d");
  const px = (n) => (n * Math.min(devicePixelRatio || 1, 3)) / k; // n screen pixels, in world units
  const { level, now = 0, still = false } = scene;
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.clearRect(0, 0, WORLD.w, WORLD.h);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Where earlier jumps went.
  for (const path of scene.paths) {
    if (path.pts.length < 2) continue;
    const miss = path.outcome === "miss";
    ctx.strokeStyle = miss ? rgba(C.bad, still ? 0.7 : 0.45) : still ? rgba(C.accent, 0.9) : rgba(C.text, 0.25);
    ctx.lineWidth = px(still && !miss ? 2 : 1.5);
    ctx.setLineDash(still && !miss ? [] : [px(1.5), px(6)]);
    ctx.beginPath();
    path.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
  }
  ctx.setLineDash([]);

  level.planets.forEach((p, i) => {
    const here = i === scene.at;
    const color = p.goal ? C.accent : here ? C.text : C.ring;
    if (p.goal) {
      ctx.fillStyle = rgba(C.accent, 0.16);
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = px(p.goal || here ? 2.5 : 2);
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.stroke();
  });

  if (scene.aim && scene.ship) {
    const [x, y] = scene.ship, [dx, dy] = scene.aim;
    ctx.strokeStyle = C.accent;
    ctx.lineWidth = px(2);
    ctx.setLineDash([px(5), px(7)]);
    ctx.beginPath(); ctx.moveTo(x + dx * 16, y + dy * 16); ctx.lineTo(x + dx * AIM, y + dy * AIM); ctx.stroke();
    ctx.setLineDash([]);
  }

  const trail = scene.trail ?? [];
  for (let i = 1; i < trail.length; i++) {
    const f = i / trail.length;
    ctx.strokeStyle = rgba(C.accent, f * 0.85);
    ctx.lineWidth = px(1 + f * 3.5);
    ctx.beginPath(); ctx.moveTo(trail[i - 1][0], trail[i - 1][1]); ctx.lineTo(trail[i][0], trail[i][1]); ctx.stroke();
  }

  for (const f of scene.fx ?? []) {
    const t = Math.min(1, (now - f.t0) / f.dur);
    ctx.strokeStyle = rgba(f.color, 0.8 * (1 - t));
    ctx.lineWidth = px(2);
    ctx.beginPath(); ctx.arc(f.x, f.y, f.r0 + (f.r1 - f.r0) * (1 - (1 - t) ** 2), 0, 7); ctx.stroke();
  }

  if (scene.ship) {
    ctx.fillStyle = C.text;
    ctx.shadowColor = C.accent;
    ctx.shadowBlur = px(14) * k;
    ctx.beginPath(); ctx.arc(scene.ship[0], scene.ship[1], Math.max(px(5), 9), 0, 7); ctx.fill();
    ctx.shadowBlur = 0;
  }
}

/* ---------------- Game flow ---------------- */

function startGame(mode, saved = null) {
  stopLoop();
  const level = mode === "daily" ? dailyLevel(TODAY) : practiceLevel(TODAY);
  const { run, taps, paths } = resumeRun(level, saved?.taps ?? []);
  S = {
    mode, level, run,
    taps, paths, live: null, trail: [], prev: [run.x, run.y], fx: [],
    tapQueued: false, assistUsed: !!saved?.assistUsed, over: false, note: "Space bar on desktop",
  };
  if (taps.length) { const left = MAX_JUMPS - run.jumps; S.note = `${left} ${left === 1 ? "jump" : "jumps"} left`; }
  if (run.done) return finish();
  $("#sub").textContent = mode === "daily" ? "Reach the goal in five jumps" : "Practice level";
  view.innerHTML = `
    <div class="dg-zone" id="zone" role="button" tabindex="0" aria-label="Launch the ship">
      <canvas class="dg-stage" id="space"></canvas>
      <div class="dg-segs" id="segs" aria-hidden="true">${"<i></i>".repeat(MAX_JUMPS)}</div>
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

/** The one input. Taps only count while the ship is in orbit. */
function tap() {
  if (!S || S.over || paused || S.run.at < 0) return;
  S.tapQueued = true;
}

document.addEventListener("keydown", (e) => {
  if (e.code !== "Space" || e.repeat || !S || S.over || paused) return;
  if (e.target.closest?.("button, a, input, textarea, select")) return;
  e.preventDefault();
  tap();
});

function renderHud() {
  const { run } = S;
  const flying = run.at < 0;
  [...$("#segs").children].forEach((el, i) => {
    const o = run.outcomes[i];
    el.className = o === "miss" ? "bad" : o || (i < run.jumps) ? "on" : "";
  });
  const title = run.done === "win" ? "Goal reached" : run.done ? "Out of jumps" : flying ? "In flight" : "Tap to launch";
  $("#tapTitle").textContent = title;
  $("#tapSub").textContent = S.note;
}

function frame(now) {
  raf = requestAnimationFrame(frame);
  const dt = Math.min(100, now - last);
  last = now;
  if (!paused && !S.run.done) {
    acc += dt * (assist ? SLOW : 1);
    while (acc >= TICK_MS && !S.run.done) { acc -= TICK_MS; tick(now); }
  }
  S.fx = S.fx.filter((f) => now - f.t0 < f.dur);

  // Draw between the last two ticks so motion stays smooth at any frame rate.
  const { run } = S;
  const a = run.done ? 1 : acc / TICK_MS;
  const ship = [S.prev[0] + (run.x - S.prev[0]) * a, S.prev[1] + (run.y - S.prev[1]) * a];
  let aim = null;
  if (run.at >= 0 && !run.done) {
    const p = S.level.planets[run.at];
    const rx = ship[0] - p.x, ry = ship[1] - p.y, len = Math.hypot(rx, ry) || 1;
    aim = [(-ry / len) * run.dir, (rx / len) * run.dir];
  }
  drawScene($("#space"), { ...S, at: run.at, ship, aim, trail: [...S.trail, ship], now });
}

function tick(now) {
  const { run, level } = S;
  const before = [run.x, run.y];
  const event = step(level, run, S.tapQueued);
  S.tapQueued = false;
  S.prev = before;

  if (event === "launch") {
    S.taps.push(run.tick);
    if (assist) S.assistUsed = true;
    if (S.mode === "daily") store.saveProgress(TODAY, { taps: S.taps, assistUsed: S.assistUsed });
    S.live = { pts: [before], outcome: null };
    S.paths.push(S.live);
    S.note = "";
  } else if (run.at < 0) {
    S.live.pts.push([run.x, run.y]);
  }

  if (event === "hop" || event === "goal") {
    const p = level.planets[run.at];
    S.live.pts.push([run.x, run.y]);
    S.live.outcome = event;
    S.live = null;
    S.fx.push({ x: p.x, y: p.y, r0: p.r, r1: p.r + 46, color: event === "goal" ? C.accent : C.text, t0: now, dur: 700 });
    const left = MAX_JUMPS - run.jumps;
    S.note = event === "goal" ? resultLabel({ won: true, jumps: run.jumps }) : `${left} ${left === 1 ? "jump" : "jumps"} left`;
  } else if (event === "miss") {
    S.live.outcome = "miss";
    S.live = null;
    // The ship is back where it launched from: don't draw a streak across the map.
    S.fx.push({ x: clamp(before[0], 0, WORLD.w), y: clamp(before[1], 0, WORLD.h), r0: 4, r1: 60, color: C.bad, t0: now, dur: 700 });
    S.fx.push({ x: run.x, y: run.y, r0: 34, r1: 8, color: C.text, t0: now, dur: 500 });
    S.trail = [];
    S.prev = [run.x, run.y];
    const left = MAX_JUMPS - run.jumps;
    S.note = `Missed. ${left} ${left === 1 ? "jump" : "jumps"} left`;
  } else if (event === "timeout") {
    S.note = "Out of time";
  }
  if (run.done && run.done !== "win" && event !== "timeout") S.note = "Lost in space";

  S.trail.push([run.x, run.y]);
  if (S.trail.length > TRAIL) S.trail.shift();
  if (event) renderHud();
  if (run.done) finish();
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function finish() {
  const { run, mode, level } = S;
  S.over = true;
  const won = run.done === "win";
  const result = { total: scoreRun(run), won, jumps: run.jumps, outcomes: run.outcomes, taps: S.taps, assist: S.assistUsed };
  result.label = resultLabel(result);
  let sent = null;
  if (mode === "daily") {
    store.saveDay(TODAY, result, result.total);
    sent = submitPlay(GAME_ID, TODAY, clientId(), { taps: result.taps, assist: result.assist });
  }
  if (won) confetti(result.jumps <= 3 ? 160 : 90);
  // Let the landing (or the last miss) play out before the result replaces the map.
  const paths = S.paths;
  setTimeout(() => showSummary(mode, level, result, paths, sent), won ? 1300 : 1000);
}

/**
 * Fly the saved launches again, instantly, to pick up a run left part way. A jump still in
 * flight when the page closed is flown to the end. Returns the run back in orbit (or over),
 * the launches that were used, and the paths flown.
 */
function resumeRun(level, saved) {
  const run = createRun(level), taps = [], paths = [];
  let live = null;
  while (!run.done && (taps.length < saved.length || run.at < 0)) {
    const next = saved[taps.length];
    if (run.at >= 0 && !(next > run.tick)) break; // a launch that can't be replayed: stop here
    const tap = run.at >= 0 && next === run.tick + 1;
    if (tap) taps.push(next);
    const before = [run.x, run.y];
    const event = step(level, run, tap);
    if (event === "launch") { live = { pts: [before], outcome: null }; paths.push(live); }
    else if (live && event !== "miss") live.pts.push([run.x, run.y]);
    if (live && event && event !== "launch") { live.outcome = event; live = null; }
  }
  return { run, taps, paths };
}

/* ---------------- Result ---------------- */

/** Rebuild the flown paths from saved taps, for the result picture on a return visit. */
function tracePaths(level, taps) {
  const paths = [];
  let live = null;
  const run = replay(level, taps, (s, event) => {
    if (event === "launch") { live = { pts: [[s.lx, s.ly]], outcome: null }; paths.push(live); return; }
    if (!live) return;
    if (event !== "miss") live.pts.push([s.x, s.y]);
    if (event) { live.outcome = event; live = null; }
  });
  return run ? paths : [];
}

/** Fewest jumps on any day, preferring a result earned without slow motion. */
function bestResult() {
  let best = null;
  for (const day of Object.keys(store.history())) {
    const r = store.getDay(day);
    if (!r?.won) continue;
    if (!best || r.jumps < best.jumps || (r.jumps === best.jumps && best.assist && !r.assist)) best = r;
  }
  return best;
}

function showSummary(mode, level, result, paths, sent = null) {
  stopLoop();
  S = null;
  const daily = mode === "daily";
  const { won, jumps } = result;
  const title = !won ? "Out of jumps." : ["Hole in one.", "Slingshot ace.", "Clean flying.", "Made it.", "Just in time."][jumps - 1];
  const share = shareText(daily ? `Orbit #${PUZZLE_NO}` : "Orbit practice", result);
  const st = store.stats(), best = bestResult();
  $("#sub").textContent = daily ? "Today's flight" : "Practice level";

  view.innerHTML = `
  <section class="dg-summary dg-enter">
    <div class="dg-verdict">
      ${won ? `<span class="big">${jumps}</span><span>${jumps === 1 ? "jump" : "jumps"} of ${MAX_JUMPS}</span>` : `<span class="big lost">Lost in space</span>`}
      <h2>${title}</h2>
      ${daily ? pointsLine(GAME_ID, result) : ""}
      ${result.assist ? `<p>${ASSIST_MARK} Played in slow motion.</p>` : ""}
    </div>
    <canvas class="dg-stage map" id="map" role="img" aria-label="Your flight path"></canvas>
    <div class="dg-segs" aria-hidden="true">${Array.from({ length: MAX_JUMPS }, (_, i) => `<i class="${result.outcomes[i] === "miss" ? "bad" : result.outcomes[i] ? "on" : ""}"></i>`).join("")}</div>
    <p class="dg-rank" id="rank" hidden></p>
    ${daily ? `<div class="dg-stats">
      <div class="dg-stat"><b>${st.streak}</b><span>Day streak</span></div>
      <div class="dg-stat"><b>${st.played}</b><span>Played</span></div>
      <div class="dg-stat"><b>${best ? `${best.jumps}${best.assist ? ` ${ASSIST_MARK}` : ""}` : "–"}</b><span>Fewest jumps</span></div>
      <div class="dg-stat"><b id="cd">--:--:--</b><span>Next puzzle</span></div></div>` : ""}
    <div class="dg-actions">
      ${daily ? seriesButton(TODAY) : ""}
      <button class="dg-btn plain" id="copyBtn" type="button">Share</button>
      <button class="dg-btn plain" id="practiceBtn" type="button">${daily ? "Play a practice level" : "Another practice level"}</button>
      ${!daily ? (store.getDay(TODAY) ? `<button class="dg-btn plain" id="backBtn" type="button">Back to today's result</button>` : `<button class="dg-btn plain" id="dailyBtn" type="button">Play today's puzzle</button>`) : ""}
    </div>
  </section>`;

  const end = paths.at(-1)?.pts.at(-1);
  const scene = { level, paths, at: won ? level.goal : -1, ship: won && end ? end : null, still: true };
  const map = $("#map");
  const paint = () => map.isConnected && drawScene(map, scene);
  paint();
  document.fonts?.ready.then(paint);
  addEventListener("resize", paint);

  wireShare($("#copyBtn"), share);
  $("#practiceBtn").addEventListener("click", () => { startGame("practice"); window.scrollTo({ top: 0 }); });
  $("#backBtn")?.addEventListener("click", showSaved);
  $("#dailyBtn")?.addEventListener("click", () => startGame("daily"));

  startCountdown($("#cd"));
  if (daily) showRank($("#rank"), sent, GAME_ID, TODAY, result.total);
}

function showSaved() {
  const saved = store.getDay(TODAY);
  const level = dailyLevel(TODAY);
  showSummary("daily", level, saved, tracePaths(level, saved.taps));
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
      <li><b>Your ship circles a planet.</b> Tap anywhere, or press Space, to let go. It leaves in a straight line, the way the dashed line points.</li>
      <li><b>Planets pull you in.</b> Pass close to a planet and your path bends toward it. Cross its ring and you're caught in a new orbit.</li>
      <li><b>Reach the purple ring in ${MAX_JUMPS} jumps.</b> Fewer is better. Miss everything and you're put back where you jumped from, one jump down.</li>
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
    startGame("daily", store.progress(TODAY));
    if (!store.flag("seenHelp")) {
      store.setFlag("seenHelp");
      howTo();
    }
  }
}
