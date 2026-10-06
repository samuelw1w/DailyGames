// Spot UI: drawing, the tap, the game loop. Rules live in core/sim.js.
import {
  GAME_ID, WORLD, GOAL, SPOT, TICKS_PER_SEC, KICKS, CLOCK, ASSIST_MARK,
  dailyGame, makeDay, reticleAt, keeperAt, shoot, scoreOf, shareText,
} from "./core/sim.js";
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
const SLOW = 0.5;                  // slow motion runs everything at half speed
const VIEW = { y: 55, h: 520 };    // the slice of the world that is drawn: goal at the top, ball at the bottom
const FLIGHT = 20;                 // ticks the ball takes to reach the goal
const REST = 60;                   // ticks the result stays on screen before the next kick
const CALLS = { goal: "Goal", saved: "Saved", wide: "Wide", over: "Over the bar" };

const $ = (s) => document.querySelector(s);
const view = $("#view");
$("#stamp").textContent = `No. ${PUZZLE_NO}`;

// Canvas colors come from the page's theme so the scene always matches the rest of the UI.
const css = getComputedStyle(document.documentElement);
const hex = (name) => css.getPropertyValue(name).trim();
const rgba = (h, a) => `rgba(${parseInt(h.slice(1, 3), 16)}, ${parseInt(h.slice(3, 5), 16)}, ${parseInt(h.slice(5, 7), 16)}, ${a})`;
const C = { accent: hex("--accent"), text: hex("--text"), frame: hex("--dim") };

// The shootout in progress: { mode, game, k, t, phase, shot, f, outcomes, ticks, ... }.
// `phase` is "aim" (tap pending), "fly" (ball in the air) or "rest" (result showing).
let S = null;
let raf = 0, last = 0, acc = 0;
let paused = false;
let assist = !!store.flag("assist");

/* ---------------- Drawing ---------------- */

const ease = (p) => 1 - (1 - p) ** 3;
const mix = (a, b, p) => [a[0] + (b[0] - a[0]) * p, a[1] + (b[1] - a[1]) * p];

function draw(canvas, a) {
  const dpr = Math.min(devicePixelRatio || 1, 3);
  const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
  if (!w) return;
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  const k = w / WORLD.w;
  const px = (n) => (n * dpr) / k; // n screen pixels, in world units
  const ctx = canvas.getContext("2d");
  ctx.setTransform(k, 0, 0, k, 0, -VIEW.y * k);
  ctx.clearRect(0, VIEW.y, WORLD.w, VIEW.h);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // The goal: two posts and a bar, standing on a faint line.
  ctx.strokeStyle = rgba(C.frame, 0.5);
  ctx.lineWidth = px(1.5);
  ctx.beginPath(); ctx.moveTo(20, GOAL.ground); ctx.lineTo(WORLD.w - 20, GOAL.ground); ctx.stroke();
  ctx.strokeStyle = C.frame;
  ctx.lineWidth = px(3);
  ctx.beginPath(); ctx.moveTo(GOAL.left, GOAL.ground); ctx.lineTo(GOAL.left, GOAL.top); ctx.lineTo(GOAL.right, GOAL.top); ctx.lineTo(GOAL.right, GOAL.ground); ctx.stroke();

  const { shot, phase } = S;
  const t = phase === "aim" ? S.t + a : S.t;
  // How far through the ball's flight we are (stays at 1 while the result shows).
  const p = phase === "fly" ? Math.min(1, (S.f + a) / FLIGHT) : phase === "rest" ? 1 : 0;

  // The keeper: one thick white stroke from feet to hands. On a shot he throws his hands at the
  // ball, as far as his reach goes.
  const kp = shot ? shot.keeper : keeperAt(S.game, Math.floor(t));
  let feet = [kp.x, GOAL.ground - 22], hands = [kp.x, GOAL.ground - 118];
  if (shot) {
    const far = shot.stretch > 1 ? 1 / Math.sqrt(shot.stretch) : 1;
    const reach = [shot.cover[0] + (shot.target[0] - shot.cover[0]) * far, shot.cover[1] + (shot.target[1] - shot.cover[1]) * far];
    const d = ease(p);
    hands = mix(hands, reach, d);
    feet = mix(feet, [kp.x + (reach[0] - kp.x) * 0.45, Math.min(GOAL.ground - 22, reach[1] + 70)], d);
  }
  ctx.strokeStyle = C.text;
  ctx.lineWidth = 44;
  ctx.beginPath(); ctx.moveTo(...feet); ctx.lineTo(...hands); ctx.stroke();

  // The reticle: an accent ring that keeps sweeping until the tap.
  const aim = shot ? shot.target : reticleAt(S.game, S.k, Math.floor(t));
  const next = shot ? aim : reticleAt(S.game, S.k, Math.floor(t) + 1);
  const r = mix(aim, next, t - Math.floor(t));
  ctx.strokeStyle = rgba(C.accent, shot ? 0.45 : 1);
  ctx.lineWidth = px(2.5);
  ctx.beginPath(); ctx.arc(r[0], r[1], 22, 0, 7); ctx.stroke();
  ctx.fillStyle = ctx.strokeStyle;
  ctx.beginPath(); ctx.arc(r[0], r[1], 3.5, 0, 7); ctx.fill();

  // The ball: flies from the spot to where the reticle was, shrinking with distance.
  let ball = SPOT, size = 17, alpha = 1;
  if (shot) {
    ball = mix(SPOT, shot.target, p);
    size = 17 - 8 * p;
    const rest = phase === "rest" ? 1 - S.rest / REST : 0;
    if (shot.outcome === "saved") ball = [ball[0], ball[1] + rest * 26];          // parried: drops
    else if (shot.outcome === "goal") alpha = 1 - rest * 0.55;                     // in the net
    else { ball = mix(SPOT, shot.target, 1 + rest * 0.35); alpha = 1 - rest; }     // keeps going
  }
  ctx.fillStyle = rgba(C.text, alpha);
  ctx.beginPath(); ctx.arc(ball[0], ball[1], size, 0, 7); ctx.fill();
}

/* ---------------- Game flow ---------------- */

function startGame(mode) {
  stopLoop();
  const game = mode === "daily" ? dailyGame(TODAY) : makeDay(Math.random);
  S = { mode, game, outcomes: [], ticks: [], assistUsed: false, over: false };
  $("#sub").textContent = mode === "daily" ? "Five kicks. Read the keeper" : "Practice shootout";
  view.innerHTML = `
    <div class="dg-zone" id="zone" role="button" tabindex="0" aria-label="Shoot">
      <canvas class="dg-stage" id="pitch"></canvas>
      <div class="dg-segs" id="segs" aria-hidden="true">${"<i></i>".repeat(KICKS)}</div>
      <div class="dg-card dg-tap"><b id="tapTitle" aria-live="polite"></b><span id="tapSub"></span></div>
    </div>`;
  $("#zone").addEventListener("pointerdown", (e) => {
    if (!e.isPrimary || e.button > 0) return;
    e.preventDefault();
    tap();
  });
  nextKick(0);
  acc = 0;
  last = performance.now();
  raf = requestAnimationFrame(frame);
}

function stopLoop() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
}

function nextKick(k) {
  Object.assign(S, { k, t: 0, phase: "aim", shot: null, tapQueued: false, secs: -1 });
  renderHud();
}

/** The one input: strike the ball at wherever the reticle is right now. */
function tap() {
  if (!S || S.over || paused || S.phase !== "aim") return;
  S.tapQueued = true;
}

document.addEventListener("keydown", (e) => {
  if (e.code !== "Space" || e.repeat || !S || S.over || paused) return;
  if (e.target.closest?.("button, a, input, textarea, select")) return;
  e.preventDefault();
  tap();
});

function renderHud() {
  [...$("#segs").children].forEach((el, i) => { el.className = S.outcomes[i] ? (S.outcomes[i] === "goal" ? "on" : "bad") : ""; });
  $("#tapTitle").textContent = S.phase === "aim" ? "Tap to shoot" : S.phase === "fly" ? " " : CALLS[S.shot.outcome];
  renderClock();
}

/** Second line of the prompt: which kick this is and the seconds left to take it. */
function renderClock() {
  const secs = Math.ceil((CLOCK - S.t) / TICKS_PER_SEC);
  if (S.phase === "aim" && secs === S.secs) return;
  S.secs = secs;
  $("#tapSub").textContent = S.phase === "aim" ? `Kick ${S.k + 1} of ${KICKS} · ${secs}s` : S.phase === "rest" ? `${scoreOf(S.outcomes)} of ${S.outcomes.length} scored` : "";
}

function frame(now) {
  raf = requestAnimationFrame(frame);
  const dt = Math.min(100, now - last);
  last = now;
  if (!paused && !S.over) {
    acc += dt * (assist ? SLOW : 1);
    while (S && acc >= TICK_MS && !S.over) { acc -= TICK_MS; tick(); }
  }
  if (!S) return; // the shootout just ended and the result screen took over
  draw($("#pitch"), acc / TICK_MS);
}

function tick() {
  if (S.phase === "aim") {
    S.t++;
    // Out of time: the kick is taken wherever the reticle happens to be.
    if (S.tapQueued || S.t >= CLOCK) {
      S.shot = shoot(S.game, S.k, S.t);
      S.ticks.push(S.t);
      if (assist) S.assistUsed = true;
      S.phase = "fly";
      S.f = 0;
      renderHud();
    } else renderClock();
    S.tapQueued = false;
  } else if (S.phase === "fly") {
    if (++S.f >= FLIGHT) {
      S.outcomes.push(S.shot.outcome);
      S.phase = "rest";
      S.rest = REST;
      renderHud();
    }
  } else if (--S.rest <= 0) {
    if (S.outcomes.length === KICKS) finish();
    else nextKick(S.k + 1);
  }
}

function finish() {
  const { mode, outcomes } = S;
  S.over = true;
  const total = scoreOf(outcomes);
  const result = { total, outcomes, ticks: S.ticks, assist: S.assistUsed };
  if (S.assistUsed) result.label = `${total}/${KICKS} ${ASSIST_MARK}`;
  let sent = null;
  if (mode === "daily") {
    store.saveDay(TODAY, result, total);
    sent = submitPlay(GAME_ID, TODAY, clientId(), { ticks: result.ticks, assist: result.assist });
  }
  if (total === KICKS) confetti(160);
  showSummary(mode, result, sent);
}

/* ---------------- Result ---------------- */

/** Most goals on any day, preferring a result earned without slow motion. */
function bestResult() {
  let best = null;
  for (const day of Object.keys(store.history())) {
    const r = store.getDay(day);
    if (!r) continue;
    if (!best || r.total > best.total || (r.total === best.total && best.assist && !r.assist)) best = r;
  }
  return best;
}

function showSummary(mode, result, sent = null) {
  stopLoop();
  S = null;
  const daily = mode === "daily";
  const { total, outcomes } = result;
  const title = ["Not your day.", "One went in.", "Room to improve.", "Decent shootout.", "So close to perfect.", "Five from five."][total];
  const share = shareText(daily ? `Spot #${PUZZLE_NO}` : "Spot practice", outcomes, result.assist);
  const st = store.stats(), best = bestResult();
  $("#sub").textContent = daily ? "Today's shootout" : "Practice shootout";

  view.innerHTML = `
  <section class="dg-summary dg-enter">
    <div class="dg-verdict">
      <span class="big">${total}</span><span>of ${KICKS} scored</span>
      <h2>${title}</h2>
      ${result.assist ? `<p>${ASSIST_MARK} Played in slow motion.</p>` : ""}
    </div>
    <div class="dg-segs" aria-hidden="true">${outcomes.map((o) => `<i class="${o === "goal" ? "on" : "bad"}"></i>`).join("")}</div>
    <p class="dg-rank" id="rank" hidden></p>
    ${daily ? `<div class="dg-stats">
      <div class="dg-stat"><b>${st.streak}</b><span>Day streak</span></div>
      <div class="dg-stat"><b>${st.played}</b><span>Played</span></div>
      <div class="dg-stat"><b>${best ? `${best.total}${best.assist ? ` ${ASSIST_MARK}` : ""}` : "–"}</b><span>Most goals</span></div>
      <div class="dg-stat"><b id="cd">--:--:--</b><span>Next puzzle</span></div></div>` : ""}
    <div class="dg-actions">
      <button class="dg-btn" id="copyBtn" type="button">Copy result</button>
      <button class="dg-btn plain" id="practiceBtn" type="button">${daily ? "Play a practice shootout" : "Another practice shootout"}</button>
      ${!daily ? (store.getDay(TODAY) ? `<button class="dg-btn plain" id="backBtn" type="button">Back to today's result</button>` : `<button class="dg-btn plain" id="dailyBtn" type="button">Play today's shootout</button>`) : ""}
    </div>
  </section>`;

  wireCopy($("#copyBtn"), share);
  $("#practiceBtn").addEventListener("click", () => { startGame("practice"); window.scrollTo({ top: 0 }); });
  $("#backBtn")?.addEventListener("click", showSaved);
  $("#dailyBtn")?.addEventListener("click", () => startGame("daily"));
  startCountdown($("#cd"));
  if (daily) showRank($("#rank"), sent, GAME_ID, TODAY, total);
}

const showSaved = () => showSummary("daily", store.getDay(TODAY));

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
      <li><b>One tap per kick.</b> The green ring sweeps around the goal. Tap anywhere, or press Space, and the ball goes where the ring is.</li>
      <li><b>Read the keeper.</b> He repeats the same routine on every kick. He saves anything near him, and reaches further the way he's already moving.</li>
      <li><b>Mind the frame.</b> The ring strays past the posts and over the bar. Shoot then and you miss.</li>
      <li><b>${KICKS} kicks, ${CLOCK / TICKS_PER_SEC} seconds each.</b> The ring gets faster every kick. If the clock runs out, the ball is struck wherever the ring is.</li>
      <li><b>Slow motion</b> halves the speed if the timing is too quick. Results earned with it are marked ${ASSIST_MARK}.</li>
    </ol>`,
    onClose: () => { paused = false; last = performance.now(); },
  });
}
$("#howBtn").addEventListener("click", howTo);

/* ---------------- Boot ---------------- */
if (store.getDay(TODAY)?.ticks) showSaved();
else {
  startGame("daily");
  if (!store.flag("seenHelp")) {
    store.setFlag("seenHelp");
    howTo();
  }
}
