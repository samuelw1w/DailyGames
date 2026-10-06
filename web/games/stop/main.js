// Stop UI: drawing, the tap, the game loop. Rules live in core/sim.js.
import { GAME_ID, TICKS_PER_SEC, ROUNDS, CLOCK, ASSIST_MARK, dailyDial, makeDial, needleAt, errorAt, roundPoints, playGame, shareText } from "./core/sim.js";
import { puzzleNumber } from "../../shared/daily.js";
import { gameStore, clientId } from "../../shared/storage.js";
import { activeDay } from "../../shared/account.js";
import { submitPlay } from "../../shared/api.js";
import { confetti } from "../../shared/confetti.js";
import { modal, resultScreen, lockScreen } from "../../shared/ui.js";
import { GAMES } from "../../shared/registry.js";

const META = GAMES.find((g) => g.id === GAME_ID);
const TODAY = activeDay(); // today, or an earlier day a Plus member has opened
const PUZZLE_NO = puzzleNumber(META.launchDay, TODAY);
const store = gameStore(GAME_ID);

const TICK_MS = 1000 / TICKS_PER_SEC;
const SLOW = 0.5;  // slow motion runs everything at half speed
const REST = 55;   // ticks the stopped needle stays on screen before the next round

const $ = (s) => document.querySelector(s);
const view = $("#view");
$("#stamp").textContent = `No. ${PUZZLE_NO}`;

// Canvas colors come from the page's theme so the dial always matches the rest of the UI.
const css = getComputedStyle(document.documentElement);
const hex = (name) => css.getPropertyValue(name).trim();
const C = { accent: hex("--accent"), text: hex("--text"), rim: hex("--line-2"), muted: hex("--muted") };

// The day in progress: { mode, dial, n, t, phase, ticks, assistUsed }. `phase` is "spin" or "rest".
let S = null;
let raf = 0, last = 0, acc = 0;
let paused = false;
let assist = !!store.flag("assist");

/* ---------------- Drawing ---------------- */

function draw(canvas, a) {
  const dpr = Math.min(devicePixelRatio || 1, 3);
  const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
  if (!w) return;
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.lineCap = "round";
  const px = (n) => n * dpr, cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2 - px(18);
  const round = S.dial[S.n];
  // Clockwise from the top.
  const at = (deg, radius) => { const rad = ((deg - 90) * Math.PI) / 180; return [cx + Math.cos(rad) * radius, cy + Math.sin(rad) * radius]; };

  ctx.strokeStyle = C.rim; ctx.lineWidth = px(2);
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.stroke();
  // The mark to stop on
  ctx.strokeStyle = C.accent; ctx.lineWidth = px(5);
  ctx.beginPath(); ctx.moveTo(...at(round.target, r - px(13))); ctx.lineTo(...at(round.target, r + px(13))); ctx.stroke();
  // The needle
  const angle = S.phase === "spin" ? round.start + round.dir * round.speed * (S.t + a) : needleAt(round, S.t);
  ctx.strokeStyle = C.text; ctx.lineWidth = px(2.5);
  ctx.beginPath(); ctx.moveTo(...at(angle, r * 0.52)); ctx.lineTo(...at(angle, r - px(4))); ctx.stroke();
  // One huge numeral: the round while it spins, the miss in degrees once stopped
  ctx.fillStyle = S.phase === "spin" ? C.muted : C.text;
  ctx.font = `600 ${Math.round(r * 0.5)}px Geist, sans-serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(S.phase === "spin" ? String(S.n + 1) : `${errorAt(round, S.t)}°`, cx, cy + px(2));
}

/* ---------------- Game flow ---------------- */

function startGame(mode, saved = null) {
  stopLoop();
  const ticks = saved?.ticks ?? [];
  S = { mode, dial: mode === "daily" ? dailyDial(TODAY) : makeDial(Math.random), n: ticks.length, t: 0, phase: "spin", ticks, tapQueued: false, assistUsed: !!saved?.assistUsed, over: false };
  if (ticks.length >= ROUNDS) return finish(); // every round was played before the page closed
  $("#sub").textContent = mode === "daily" ? "Stop the needle on the mark" : "Practice dial";
  view.innerHTML = `
    <div class="dg-zone" id="zone" role="button" tabindex="0" aria-label="Stop the needle">
      <canvas class="dg-stage" id="dial"></canvas>
      <div class="dg-segs" id="segs" aria-hidden="true">${"<i></i>".repeat(ROUNDS)}</div>
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

/** The one input: stop the needle where it is. */
function tap() {
  if (!S || S.over || paused || S.phase !== "spin") return;
  S.tapQueued = true;
}

document.addEventListener("keydown", (e) => {
  if (e.code !== "Space" || e.repeat || !S || S.over || paused) return;
  if (e.target.closest?.("button, a, input, textarea, select")) return;
  e.preventDefault();
  tap();
});

function renderHud() {
  const errors = S.ticks.map((t, n) => errorAt(S.dial[n], t));
  [...$("#segs").children].forEach((el, n) => { el.className = n >= errors.length ? "" : roundPoints(errors[n]) >= 14 ? "on" : roundPoints(errors[n]) > 0 ? "mid" : "bad"; });
  const e = errors.at(-1);
  $("#tapTitle").textContent = S.phase === "spin" ? "Tap to stop" : e === 0 ? "Dead on" : e <= 5 ? "So close" : e < 40 ? `${e}° off` : "Miles off";
  $("#tapSub").textContent = S.phase === "spin" ? (S.n ? `Round ${S.n + 1} of ${ROUNDS}` : "Space bar on desktop") : `+${roundPoints(e)} points`;
}

function frame(now) {
  raf = requestAnimationFrame(frame);
  const dt = Math.min(100, now - last);
  last = now;
  if (!paused && !S.over) {
    acc += dt * (assist ? SLOW : 1);
    while (S && acc >= TICK_MS && !S.over) { acc -= TICK_MS; tick(); }
  }
  if (!S) return; // the day just ended and the result screen took over
  draw($("#dial"), acc / TICK_MS);
}

function tick() {
  if (S.phase === "spin") {
    S.t++;
    // Out of time: the needle is stopped wherever it happens to be.
    if (S.tapQueued || S.t >= CLOCK) {
      S.ticks.push(S.t);
      if (assist) S.assistUsed = true;
      if (S.mode === "daily") store.saveProgress(TODAY, { ticks: S.ticks, assistUsed: S.assistUsed });
      S.phase = "rest"; S.rest = REST;
      renderHud();
    }
    S.tapQueued = false;
  } else if (--S.rest <= 0) {
    if (S.ticks.length === ROUNDS) return finish();
    S.n++; S.t = 0; S.phase = "spin";
    renderHud();
  }
}

function finish() {
  const { mode, dial } = S;
  S.over = true;
  const scored = playGame(dial, S.ticks);
  const result = { total: scored.total, points: scored.total, errors: scored.errors, ticks: S.ticks, assist: S.assistUsed, label: `${scored.total}/100${S.assistUsed ? ` ${ASSIST_MARK}` : ""}` };
  let sent = null;
  if (mode === "daily") {
    store.saveDay(TODAY, result, result.total);
    sent = submitPlay(GAME_ID, TODAY, clientId(), { ticks: result.ticks, assist: result.assist });
  }
  if (result.total >= 85) confetti(140);
  showSummary(mode, result, sent);
}

function showSummary(mode, result, sent = null) {
  stopLoop();
  S = null;
  const daily = mode === "daily", { total, errors } = result;
  $("#sub").textContent = daily ? "Today's dial" : "Practice dial";
  resultScreen(view, {
    gameId: GAME_ID, day: TODAY, daily, result, sent,
    big: total, unit: "of 100",
    title: total >= 90 ? "Clockwork." : total >= 70 ? "Sharp hands." : total >= 45 ? "Close enough." : total >= 20 ? "A beat behind." : "Wide of the mark.",
    body: `<div class="dg-segs" aria-hidden="true">${errors.map((e) => `<i class="${roundPoints(e) >= 14 ? "on" : roundPoints(e) > 0 ? "mid" : "bad"}"></i>`).join("")}</div>
      <p class="dg-rank">${errors.map((e) => `${e}°`).join(" · ")}${result.assist ? ` · ${ASSIST_MARK} slow motion` : ""}</p>`,
    share: shareText(daily ? `Stop #${PUZZLE_NO}` : "Stop practice", result, result.assist),
    practiceLabel: daily ? "Try a practice dial" : "Another practice dial",
    onPractice: () => startGame("practice"), onBack: showSaved, onDaily: () => startGame("daily"),
  });
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
      <li><b>One tap per round.</b> A needle sweeps round the dial. Tap anywhere, or press Space, to stop it on the red mark.</li>
      <li><b>Closer is better.</b> Each round is worth 20 points, and they fall away fast: 40 degrees off scores nothing.</li>
      <li><b>${ROUNDS} rounds, each faster.</b> The mark moves and the needle changes direction. Wait too long and it stops itself.</li>
      <li><b>Slow motion</b> halves the speed if the timing is too quick. Results earned with it are marked ${ASSIST_MARK}.</li>
    </ol>`,
    onClose: () => { paused = false; last = performance.now(); },
  });
}
$("#howBtn").addEventListener("click", howTo);

/* ---------------- Boot ---------------- */
// A game the player hasn't unlocked shows how to open it instead.
if (!lockScreen(GAME_ID, view)) {
  if (store.getDay(TODAY)?.ticks) showSaved();
  else {
    startGame("daily", store.progress(TODAY));
    if (!store.flag("seenHelp")) {
      store.setFlag("seenHelp");
      howTo();
    }
  }
}
