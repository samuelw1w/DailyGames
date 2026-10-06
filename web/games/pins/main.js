// Pins UI: drawing, the two taps, the game loop. Physics and rules live in core/.
import { GAME_ID, FRAMES, MAX_SCORE, ASSIST_MARK, createGame, applyRoll, scoreGame, shareText } from "./core/puzzle.js";
import {
  WORLD, LANE, TICKS_PER_SEC, BALL_R, PIN_R, SPOTS,
  dailyLane, ballLane, posAt, hookStart, aimPoint, createShot, stepShot, downed,
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
const SLOW = 0.5;      // slow motion runs everything at half speed
const AIM_TICKS = 34;  // how far ahead the dashed aim line shows the ball's path
const TRAIL = 26;      // ticks of fading trail behind the ball
const VIEW = { x: 75, w: 330 }; // the slice of the world that is drawn: the lane and its gutters
const REST = 55;       // ticks the fallen pins stay on screen before the next ball

const $ = (s) => document.querySelector(s);
const view = $("#view");
$("#stamp").textContent = `No. ${PUZZLE_NO}`;

// Canvas colors come from the page's theme so the lane always matches the rest of the UI.
const css = getComputedStyle(document.documentElement);
const hex = (name) => css.getPropertyValue(name).trim();
const rgba = (h, a) => `rgba(${parseInt(h.slice(1, 3), 16)}, ${parseInt(h.slice(3, 5), 16)}, ${parseInt(h.slice(5, 7), 16)}, ${a})`;
const C = { accent: hex("--accent"), text: hex("--text"), edge: hex("--dim") };

// The game in progress: { mode, lane, game, phase, i, j, pos, shot, trail, prev, balls, ... }.
// `phase` is "pos" (first tap pending), "hook" (second tap pending), "roll" or "rest".
let S = null;
let raf = 0, last = 0, acc = 0;
let paused = false;
let assist = !!store.flag("assist");

const driftText = ({ drift }) => (drift ? `Drift ${Math.abs(drift)} ${drift < 0 ? "left" : "right"}` : "No drift");

/* ---------------- Drawing ---------------- */

function draw(canvas, a) {
  const dpr = Math.min(devicePixelRatio || 1, 3);
  const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
  if (!w) return;
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  const k = w / VIEW.w;
  const px = (n) => (n * dpr) / k; // n screen pixels, in world units
  const ctx = canvas.getContext("2d");
  ctx.setTransform(k, 0, 0, k, -VIEW.x * k, 0);
  ctx.clearRect(VIEW.x, 0, VIEW.w, WORLD.h);
  ctx.lineCap = "round";

  // The lane is just its two edges.
  ctx.strokeStyle = rgba(C.edge, 0.7);
  ctx.lineWidth = px(1.5);
  for (const x of [LANE.left, LANE.right]) { ctx.beginPath(); ctx.moveTo(x, 8); ctx.lineTo(x, WORLD.h - 8); ctx.stroke(); }

  // Pins: white dots. During a roll they come from the shot; otherwise they stand on their spots.
  const { shot, game } = S;
  SPOTS.forEach(([x, y], i) => {
    const p = shot?.pins[i];
    if (p ? !p.up || p.gone : !game.standing[i]) return;
    const fallen = S.phase === "rest" && S.down[i];
    ctx.fillStyle = rgba(C.text, fallen ? 0.28 : 1);
    ctx.beginPath(); ctx.arc(p ? p.x : x, p ? p.y : y, PIN_R, 0, 7); ctx.fill();
  });

  if (S.phase === "rest") return;
  const ball = shot ? [S.prev[0] + (shot.ball.x - S.prev[0]) * a, S.prev[1] + (shot.ball.y - S.prev[1]) * a] : [posAt(S.lane, S.phase === "pos" ? S.i : S.pos), LANE.foul];
  if (shot && ball[1] < -BALL_R) return;

  if (S.phase === "hook") {
    ctx.strokeStyle = C.accent;
    ctx.lineWidth = px(2);
    ctx.setLineDash([px(5), px(7)]);
    ctx.beginPath();
    for (let t = 4; t <= AIM_TICKS; t += 2) ctx.lineTo(...aimPoint(S.lane, S.pos, S.j, t));
    ctx.stroke();
    ctx.setLineDash([]);
  }

  const trail = [...S.trail, ball];
  for (let n = 1; n < trail.length; n++) {
    const f = n / trail.length;
    ctx.strokeStyle = rgba(C.accent, f * 0.7);
    ctx.lineWidth = px(2 + f * 8);
    ctx.beginPath(); ctx.moveTo(trail[n - 1][0], trail[n - 1][1]); ctx.lineTo(trail[n][0], trail[n][1]); ctx.stroke();
  }
  ctx.fillStyle = C.accent;
  ctx.beginPath(); ctx.arc(ball[0], ball[1], BALL_R, 0, 7); ctx.fill();
}

/* ---------------- Game flow ---------------- */

function startGame(mode) {
  stopLoop();
  const day = mode === "daily" ? dailyLane(TODAY) : { seed: Math.floor(Math.random() * 2 ** 31) };
  S = { mode, day, game: createGame(), balls: [], assistUsed: false, over: false };
  $("#sub").textContent = mode === "daily" ? "Three frames. No two balls roll alike" : "Practice game";
  view.innerHTML = `
    <div class="dg-zone" id="zone" role="button" tabindex="0" aria-label="Bowl">
      <canvas class="dg-stage" id="lane"></canvas>
      <div class="frames" id="frames"></div>
      <div class="dg-card dg-tap" aria-live="polite"><b id="tapTitle"></b><span id="tapSub"></span></div>
    </div>`;
  $("#zone").addEventListener("pointerdown", (e) => {
    if (!e.isPrimary || e.button > 0) return;
    e.preventDefault();
    tap();
  });
  nextBall();
  acc = 0;
  last = performance.now();
  raf = requestAnimationFrame(frame);
}

function stopLoop() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
}

function nextBall() {
  const lane = ballLane(S.day, S.balls.length);
  Object.assign(S, { lane, phase: "pos", i: 0, j: 0, pos: 0, shot: null, trail: [], down: null, tapQueued: false });
  S.note = `Frame ${S.game.frame + 1} · ${driftText(lane)}`;
  renderHud();
}

/** The one input: first tap fixes where the ball starts, second tap fixes its hook. */
function tap() {
  if (!S || S.over || paused || (S.phase !== "pos" && S.phase !== "hook")) return;
  S.tapQueued = true;
}

document.addEventListener("keydown", (e) => {
  if (e.code !== "Space" || e.repeat || !S || S.over || paused) return;
  if (e.target.closest?.("button, a, input, textarea, select")) return;
  e.preventDefault();
  tap();
});

const framesHtml = (rolls, now = -1) => scoreGame(rolls).frames
  .map((f, n) => `<div class="${n === now ? "now" : f.score !== null ? "done" : ""}"><b>${f.marks}</b><span>${f.score ?? ""}</span></div>`).join("");

function renderHud() {
  const { game, phase } = S;
  $("#frames").innerHTML = framesHtml(game.rolls, game.done ? -1 : game.frame);
  $("#tapTitle").textContent = phase === "pos" ? "Tap to set position" : phase === "hook" ? "Tap to set hook" : phase === "roll" ? "Rolling" : S.call;
  $("#tapSub").textContent = S.note;
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
  draw($("#lane"), S.over ? 1 : acc / TICK_MS);
}

function tick() {
  const { lane, game } = S;
  const tapped = S.tapQueued;
  S.tapQueued = false;

  if (S.phase === "pos") {
    if (tapped) { S.pos = S.i; S.j = hookStart(lane); S.phase = "hook"; renderHud(); }
    else S.i = (S.i + 1) % lane.posPeriod;
  } else if (S.phase === "hook") {
    if (tapped) {
      S.shot = createShot(lane, game.standing, S.pos, S.j);
      S.balls.push([S.pos, S.j]);
      if (assist) S.assistUsed = true;
      S.prev = [S.shot.ball.x, S.shot.ball.y];
      S.phase = "roll";
      S.note = "";
      renderHud();
    } else S.j = (S.j + 1) % lane.hookPeriod;
  } else if (S.phase === "roll") {
    const { shot } = S;
    S.prev = [shot.ball.x, shot.ball.y];
    S.trail.push(S.prev);
    if (S.trail.length > TRAIL) S.trail.shift();
    stepShot(shot);
    if (shot.done) land();
  } else if (--S.rest <= 0) {
    if (game.done) finish();
    else nextBall();
  }
}

/** The pins have settled: score the ball and show what happened. */
function land() {
  const { game, shot } = S;
  const before = game.standing.filter(Boolean).length;
  S.down = downed(shot);
  const count = applyRoll(game, S.down);
  const cleared = count === before;
  S.call = cleared && before === 10 ? "Strike" : cleared ? "Spare" : shot.gutter && !count ? "Gutter" : count ? `${count} down` : "Missed";
  S.note = cleared ? "" : `${before - count} left standing`;
  S.phase = "rest";
  S.rest = REST;
  if (cleared && before === 10) confetti(70);
  renderHud();
}

function finish() {
  const { game, mode } = S;
  S.over = true;
  const { total } = scoreGame(game.rolls);
  const result = { total, rolls: game.rolls, balls: S.balls, assist: S.assistUsed };
  if (S.assistUsed) result.label = `${total}/${MAX_SCORE} ${ASSIST_MARK}`;
  let sent = null;
  if (mode === "daily") {
    store.saveDay(TODAY, result, total);
    sent = submitPlay(GAME_ID, TODAY, clientId(), { balls: result.balls, assist: result.assist });
  }
  showSummary(mode, result, sent);
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

function showSummary(mode, result, sent = null) {
  stopLoop();
  S = null;
  const daily = mode === "daily";
  const { total, rolls } = result;
  const strikes = rolls.filter((r) => r === 10).length;
  const title = total === MAX_SCORE ? "Perfect game." : total >= 70 ? "On a roll." : total >= 50 ? "Solid bowling." : total >= 30 ? "A few got away." : "Gutter trouble.";
  const share = shareText(daily ? `Pins #${PUZZLE_NO}` : "Pins practice", rolls, result.assist);
  const st = store.stats(), best = bestResult();
  $("#sub").textContent = daily ? "Today's game" : "Practice game";

  view.innerHTML = `
  <section class="dg-summary dg-enter">
    <div class="dg-verdict">
      <span class="big">${total}</span><span>of ${MAX_SCORE}</span>
      <h2>${title}</h2>
      ${result.assist ? `<p>${ASSIST_MARK} Played in slow motion.</p>` : ""}
    </div>
    <div class="frames">${framesHtml(rolls)}</div>
    <p class="dg-rank" id="rank" hidden></p>
    ${daily ? `<div class="dg-stats">
      <div class="dg-stat"><b>${st.streak}</b><span>Day streak</span></div>
      <div class="dg-stat"><b>${st.played}</b><span>Played</span></div>
      <div class="dg-stat"><b>${best ? `${best.total}${best.assist ? ` ${ASSIST_MARK}` : ""}` : "–"}</b><span>Best score</span></div>
      <div class="dg-stat"><b id="cd">--:--:--</b><span>Next puzzle</span></div></div>` : ""}
    <div class="dg-actions">
      <button class="dg-btn" id="copyBtn" type="button">Copy result</button>
      <button class="dg-btn plain" id="practiceBtn" type="button">${daily ? "Bowl a practice game" : "Another practice game"}</button>
      ${!daily ? (store.getDay(TODAY) ? `<button class="dg-btn plain" id="backBtn" type="button">Back to today's result</button>` : `<button class="dg-btn plain" id="dailyBtn" type="button">Play today's game</button>`) : ""}
    </div>
  </section>`;

  wireCopy($("#copyBtn"), share);
  $("#practiceBtn").addEventListener("click", () => { startGame("practice"); window.scrollTo({ top: 0 }); });
  $("#backBtn")?.addEventListener("click", showSaved);
  $("#dailyBtn")?.addEventListener("click", () => startGame("daily"));
  startCountdown($("#cd"));
  if (daily) showRank($("#rank"), sent, GAME_ID, TODAY, total);
  if (daily && sent && strikes >= FRAMES) confetti(160);
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
      <li><b>Two taps per ball.</b> The ball slides along the foul line: tap anywhere, or press Space, to stop it where you want to bowl from.</li>
      <li><b>Then set the hook.</b> The dashed line swings from a left curve to a right curve. Tap again to throw along it. A hooked ball swings wide and cuts back in.</li>
      <li><b>Three frames, real bowling scoring.</b> Two balls a frame; a strike or spare earns bonus pins from your next balls, and extra balls in the last frame. A perfect game is ${MAX_SCORE}.</li>
      <li><b>No two balls roll alike.</b> The drift changes with every ball, the marker starts somewhere new, and each release slips a little, so the same two taps never give the same roll twice.</li>
      <li><b>Slow motion</b> halves the speed if the timing is too quick. Results earned with it are marked ${ASSIST_MARK}.</li>
    </ol>`,
    onClose: () => { paused = false; last = performance.now(); },
  });
}
$("#howBtn").addEventListener("click", howTo);

/* ---------------- Boot ---------------- */
if (store.getDay(TODAY)?.balls) showSaved();
else {
  startGame("daily");
  if (!store.flag("seenHelp")) {
    store.setFlag("seenHelp");
    howTo();
  }
}
