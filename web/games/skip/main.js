// Skip UI: drawing, the tap, the game loop. Rules live in core/sim.js.
import {
  GAME_ID, TICKS_PER_SEC, STONES, MAX_SKIPS, FIRST_TOUCH, ASSIST_MARK,
  dailyWater, makeWater, touches, windowAt, catches, bestOf, resultLabel, shareText,
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
const SLOW = 0.5;                       // slow motion runs everything at half speed
const WORLD = { w: 800, h: 520 };
const HORIZON = 150;                    // y of the horizon line
const NEAR = 455;                       // y of the water at the thrower's feet
const DEPTH = 260;                      // how quickly things shrink toward the horizon
const REST = 80;                        // ticks the last ripples spread before the next stone

const $ = (s) => document.querySelector(s);
const view = $("#view");
$("#stamp").textContent = `No. ${PUZZLE_NO}`;

// Canvas colors come from the page's theme so the scene always matches the rest of the UI.
const css = getComputedStyle(document.documentElement);
const hex = (name) => css.getPropertyValue(name).trim();
const rgba = (h, a) => `rgba(${parseInt(h.slice(1, 3), 16)}, ${parseInt(h.slice(3, 5), 16)}, ${parseInt(h.slice(5, 7), 16)}, ${a})`;
const C = { accent: hex("--accent"), text: hex("--text"), line: hex("--dim") };

// The day in progress: { mode, water, ticks, counts, throws, stone, phase, t, n, taps, ... }.
// `phase` is "ready" (tap throws), "fly" (stone in the air) or "rest" (ripples fading).
let S = null;
let raf = 0, last = 0, acc = 0;
let paused = false;
let assist = !!store.flag("assist");

const skipsText = (n) => `${n} ${n === 1 ? "skip" : "skips"}`;

/* ---------------- Drawing ---------------- */

/** Where a point on the water `z` ticks of travel away sits on screen, and how big things are there. */
function project(z) {
  const s = 1 / (1 + z / DEPTH);
  return { x: WORLD.w / 2 + S.water.side * (1 - s) * 150, y: HORIZON + (NEAR - HORIZON) * s, s };
}

/** The stone `t` ticks after the throw: the water under it and its height above that. */
function stoneAt(t) {
  const { ticks, lifts } = S;
  let i = 0;
  while (i < ticks.length - 1 && ticks[i] <= t) i++;
  // The throw is the second half of a hop: it starts at the top of its arc.
  const from = i ? ticks[i - 1] : -FIRST_TOUCH, to = ticks[i];
  const p = Math.min(1, (t - from) / (to - from));
  // Heavy gravity: the stone hangs near the top of its hop, then drops onto the water fast.
  const q = 2 * p - 1;
  return { ...project(t), lift: (to - from) * 1.6 * lifts[i] * (1 - q * q * q * q) };
}

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

  // One horizon line.
  ctx.strokeStyle = rgba(C.line, 0.8);
  ctx.lineWidth = px(1.5);
  ctx.beginPath(); ctx.moveTo(0, HORIZON); ctx.lineTo(WORLD.w, HORIZON); ctx.stroke();

  const t = S.phase === "ready" ? 0 : S.t + a;

  // Ripples: two rings spreading from every touch so far, flattened by the low viewpoint.
  const ring = (at, born, color) => {
    for (const delay of [0, 16]) {
      const age = t - born - delay;
      if (age <= 0 || age >= 170) continue;
      const r = (8 + age * 0.75) * at.s;
      ctx.strokeStyle = rgba(color, 0.9 * (1 - age / 170));
      ctx.lineWidth = px(1.5);
      ctx.beginPath(); ctx.ellipse(at.x, at.y, r, r * 0.3, 0, 0, 7); ctx.stroke();
    }
  };
  for (let i = 0; i < S.n; i++) ring(project(S.ticks[i]), Math.max(S.ticks[i], S.taps[i]), C.accent);
  if (S.sunkAt !== null) ring(project(S.sunkAt), S.sunkAt, C.text);

  if (S.phase === "rest" && S.sunkAt !== null) return; // the stone is under
  // The stone can't pass a touch that hasn't been caught: it waits on the water for the tap.
  const st = stoneAt(S.n < MAX_SKIPS ? Math.min(t, S.ticks[S.n]) : t);
  const fade = S.n === MAX_SKIPS ? Math.max(0, 1 - (t - S.ticks[MAX_SKIPS - 1]) / 50) : 1;
  // A faint mark on the water under the stone, so its height reads at a glance.
  ctx.fillStyle = rgba(C.text, 0.16 * fade);
  ctx.beginPath(); ctx.ellipse(st.x, st.y, 13 * st.s, 4 * st.s, 0, 0, 7); ctx.fill();
  ctx.fillStyle = rgba(C.text, fade);
  ctx.beginPath(); ctx.arc(st.x, st.y - st.lift * st.s - 9 * st.s, Math.max(px(2), 10 * st.s), 0, 7); ctx.fill();
}

/* ---------------- Game flow ---------------- */

function startGame(mode) {
  stopLoop();
  const water = mode === "daily" ? dailyWater(TODAY) : makeWater(Math.random);
  S = { mode, water, counts: [], throws: [], assistUsed: false, over: false };
  $("#sub").textContent = mode === "daily" ? "Three stones. Best one counts" : "Practice water";
  view.innerHTML = `
    <div class="dg-zone" id="zone" role="button" tabindex="0" aria-label="Throw, then tap each time the stone touches the water">
      <canvas class="dg-stage" id="water"></canvas>
      <div class="dg-segs" id="segs" aria-hidden="true">${"<i></i>".repeat(STONES)}</div>
      <div class="dg-card dg-tap"><b id="tapTitle" aria-live="polite"></b><span id="tapSub"></span></div>
    </div>`;
  $("#zone").addEventListener("pointerdown", (e) => {
    if (!e.isPrimary || e.button > 0) return;
    e.preventDefault();
    tap();
  });
  nextStone();
  acc = 0;
  last = performance.now();
  raf = requestAnimationFrame(frame);
}

function stopLoop() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
}

function nextStone() {
  Object.assign(S, touches(S.water, S.counts.length), { phase: "ready", t: 0, n: 0, taps: [], failed: false, sunkAt: null, tapQueued: false });
  renderHud();
}

/** The one input: throw the stone, then catch each touch. */
function tap() {
  if (!S || S.over || paused || S.phase === "rest") return;
  S.tapQueued = true;
}

document.addEventListener("keydown", (e) => {
  if (e.code !== "Space" || e.repeat || !S || S.over || paused) return;
  if (e.target.closest?.("button, a, input, textarea, select")) return;
  e.preventDefault();
  tap();
});

function renderHud() {
  const stone = S.counts.length + (S.phase === "rest" ? 0 : 1);
  [...$("#segs").children].forEach((el, i) => { el.className = i < stone ? "on" : ""; });
  const best = bestOf(S.counts);
  $("#tapTitle").textContent = S.phase === "ready" ? "Tap to throw"
    : S.phase === "rest" ? (S.n === MAX_SKIPS ? "Out of sight" : S.n ? skipsText(S.n) : "Sank")
    : S.n ? String(S.n) : "Tap when it touches";
  $("#tapSub").textContent = S.phase === "ready" ? (S.counts.length ? `Stone ${stone} of ${STONES} · best ${best}` : "Space bar on desktop")
    : S.phase === "rest" ? `Best ${best}` : "";
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
  draw($("#water"), acc / TICK_MS);
}

function tick() {
  const tapped = S.tapQueued;
  S.tapQueued = false;
  if (S.phase === "ready") {
    if (tapped) { S.phase = "fly"; if (assist) S.assistUsed = true; renderHud(); }
    return;
  }
  S.t++;
  if (S.phase === "rest") {
    if (--S.rest > 0) return;
    if (S.counts.length === STONES) finish();
    else nextStone();
    return;
  }

  const { ticks } = S;
  if (S.n === MAX_SKIPS) { // every touch caught: the stone sails on
    if (S.t > ticks[MAX_SKIPS - 1] + 50) land();
    return;
  }
  if (tapped && !S.failed) {
    S.taps.push(S.t);
    if (catches(ticks, S.n, S.t)) { S.n++; renderHud(); }
    else S.failed = true; // tapped at the wrong moment: it goes under at the next touch
  }
  if (!S.failed && S.t > ticks[S.n] + windowAt(S.n)) S.failed = true; // no tap in time
  if (S.failed && S.t >= ticks[S.n]) { S.sunkAt = ticks[S.n]; land(); }
}

/** This stone is done: record it and let the ripples fade. */
function land() {
  S.counts.push(S.n);
  S.throws.push(S.taps);
  S.phase = "rest";
  S.rest = REST;
  if (S.n === MAX_SKIPS) confetti(160);
  renderHud();
}

function finish() {
  const { mode, counts } = S;
  S.over = true;
  const total = bestOf(counts);
  const result = { total, counts, throws: S.throws, assist: S.assistUsed, label: resultLabel(total, S.assistUsed) };
  let sent = null;
  if (mode === "daily") {
    store.saveDay(TODAY, result, total);
    sent = submitPlay(GAME_ID, TODAY, clientId(), { throws: result.throws, assist: result.assist });
  }
  showSummary(mode, result, sent);
}

/* ---------------- Result ---------------- */

/** Most skips on any day, preferring a result earned without slow motion. */
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
  const { total, counts } = result;
  const title = total >= MAX_SKIPS ? "Out of sight." : total >= 18 ? "Glass-smooth." : total >= 12 ? "Lovely rhythm." : total >= 6 ? "A good few hops." : total ? "A short trip." : "Straight under.";
  const share = shareText(daily ? `Skip #${PUZZLE_NO}` : "Skip practice", counts, result.assist);
  const st = store.stats(), best = bestResult();
  $("#sub").textContent = daily ? "Today's water" : "Practice water";

  view.innerHTML = `
  <section class="dg-summary dg-enter">
    <div class="dg-verdict">
      <span class="big">${total}</span><span>${total === 1 ? "skip" : "skips"}</span>
      <h2>${title}</h2>
      <p>Your stones: ${counts.join(" · ")}</p>
      ${result.assist ? `<p>${ASSIST_MARK} Played in slow motion.</p>` : ""}
    </div>
    <p class="dg-rank" id="rank" hidden></p>
    ${daily ? `<div class="dg-stats">
      <div class="dg-stat"><b>${st.streak}</b><span>Day streak</span></div>
      <div class="dg-stat"><b>${st.played}</b><span>Played</span></div>
      <div class="dg-stat"><b>${best ? `${best.total}${best.assist ? ` ${ASSIST_MARK}` : ""}` : "–"}</b><span>Personal best</span></div>
      <div class="dg-stat"><b id="cd">--:--:--</b><span>Next puzzle</span></div></div>` : ""}
    <div class="dg-actions">
      <button class="dg-btn" id="copyBtn" type="button">Copy result</button>
      <button class="dg-btn plain" id="practiceBtn" type="button">${daily ? "Skip some practice stones" : "More practice stones"}</button>
      ${!daily ? (store.getDay(TODAY) ? `<button class="dg-btn plain" id="backBtn" type="button">Back to today's result</button>` : `<button class="dg-btn plain" id="dailyBtn" type="button">Play today's water</button>`) : ""}
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
      <li><b>Tap to throw.</b> Then tap anywhere, or press Space, each time the stone touches the water to send it on.</li>
      <li><b>Watch every hop.</b> Some are long and high, some short and flat, and the stone drops fast at the end. No two stones bounce alike.</li>
      <li><b>It gets tighter.</b> Each skip forgives a little less. Tap at the wrong moment, or not at all, and the stone sinks.</li>
      <li><b>${STONES} stones a day.</b> Your best one counts. ${MAX_SKIPS} skips and the stone sails out of sight.</li>
      <li><b>Slow motion</b> halves the speed if the timing is too quick. Results earned with it are marked ${ASSIST_MARK}.</li>
    </ol>`,
    onClose: () => { paused = false; last = performance.now(); },
  });
}
$("#howBtn").addEventListener("click", howTo);

/* ---------------- Boot ---------------- */
if (store.getDay(TODAY)?.throws) showSaved();
else {
  startGame("daily");
  if (!store.flag("seenHelp")) {
    store.setFlag("seenHelp");
    howTo();
  }
}
