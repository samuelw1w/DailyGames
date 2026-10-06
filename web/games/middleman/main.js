// Middleman UI: rendering, input, animation. Game rules live in core/puzzle.js.
import {
  GAME_ID, ROUNDS_PER_DAY, SCALES, fmt, posOf, midValue, grade, SQUARES,
  dailyRounds, practiceRounds, scoreAnswer, closest, search,
} from "./core/puzzle.js";
import { puzzleNumber } from "../../shared/daily.js";
import { gameStore, clientId } from "../../shared/storage.js";
import { activeDay } from "../../shared/account.js";
import { submitPlay, getStats } from "../../shared/api.js";
import { modal, wireShare, startCountdown, showRank, seriesButton, pointsLine, lockScreen } from "../../shared/ui.js";
import { confetti } from "../../shared/confetti.js";
import { GAMES } from "../../shared/registry.js";

const META = GAMES.find((g) => g.id === GAME_ID);

// Middleman's own icon set: one line drawing per measure, drawn in the game's accent color.
const ICON_PATHS = {
  weight: '<path d="M9.2 8a2.8 2.8 0 1 1 5.6 0"/><path d="M7.5 8h9l2.5 11.5h-14z"/>',
  speed: '<path d="M4 17a8 8 0 1 1 16 0"/><path d="M12 17l4.2-5.2"/>',
  size: '<rect x="3" y="8" width="18" height="8" rx="1.5"/><path d="M7.5 8v3M12 8v4.5M16.5 8v3"/>',
  year: '<path d="M7 4h10M7 20h10"/><path d="M8 4c0 4.2 8 4.6 8 8s-8 3.8-8 8"/><path d="M16 4c0 4.2-8 4.6-8 8s8 3.8 8 8"/>',
  price: '<path d="M4 12.2V5a1 1 0 0 1 1-1h7.2L20 11.8 11.8 20z"/><circle cx="8.6" cy="8.6" r="1.1"/>',
};
const icon = (scale) => `<svg class="mm-icon" viewBox="0 0 24 24" aria-hidden="true">${ICON_PATHS[scale]}</svg>`;
const ROUND_SECS = 45;
const TODAY = activeDay(); // today, or an earlier day a Plus member has opened
const PUZZLE_NO = puzzleNumber(META.launchDay, TODAY);
const store = gameStore(GAME_ID);
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const view = $("#view");
const tracker = $("#tracker");
$("#stamp").textContent = `No. ${PUZZLE_NO}`;

let S = null; // { mode, rounds, idx, results, over }
let timer = null;
let crowd = null; // cached promise of today's crowd stats

const crowdStats = () => (crowd ??= getStats(GAME_ID, TODAY));

/* ---------------- Game flow ---------------- */
function startGame(mode, saved = null) {
  S = { mode, rounds: mode === "daily" ? dailyRounds(TODAY) : practiceRounds(), idx: saved?.idx ?? 0, results: saved?.results ?? [], over: false };
  // Left after answering a round: carry on from the next one.
  if (S.results[S.idx]) return next();
  renderRound(saved?.deadline);
}

/**
 * Keep the day's answers and when the current round's clock runs out, so leaving the page
 * carries on from the same round. The clock keeps running while the page is closed.
 */
const save = () => S.mode === "daily" && store.saveProgress(TODAY, { idx: S.idx, results: S.results, deadline: S.deadline });

/** Bar color for a round's score: accent for a good one, yellow for middling, red for a miss. */
const segClass = (score) => (grade(score) >= 3 ? "on" : grade(score) === 2 ? "mid" : "bad");

function renderTracker() {
  tracker.innerHTML = S.rounds.map((r, i) => `<i class="${S.results[i] ? segClass(S.results[i].score) : i === S.idx && !S.over ? "now" : ""}"></i>`).join("");
}

function renderRound(deadline) {
  const r = S.rounds[S.idx], sc = SCALES[r.scale];
  renderTracker();
  view.innerHTML = `
  <section class="play dg-enter">
    <div class="prompt">
      <span class="dg-chip">${S.mode === "practice" ? "Practice · " : ""}Round ${S.idx + 1} of ${ROUNDS_PER_DAY} · ${icon(r.scale)} ${sc.label}</span>
      <h2>Halfway between ${esc(r.a.name)} and ${esc(r.b.name)}?</h2>
      <p>${sc.q}</p>
    </div>
    <div class="bench" id="bench">
      <div class="bench-top">
        ${endHtml("a", r.a, sc.loC)}
        <div class="slot" id="slot" aria-label="Time left">
          <svg viewBox="0 0 76 76" aria-hidden="true"><circle class="t-bg" cx="38" cy="38" r="33"/><circle class="t-fg" id="arc" cx="38" cy="38" r="33"/></svg>
          <span class="q">?</span><span class="t-num" id="tnum">${ROUND_SECS}s</span>
        </div>
        ${endHtml("b", r.b, sc.hiC)}
      </div>
      <div class="rail" id="rail">
        <span class="stem l"></span><span class="stem r"></span>
        <div class="track"><div class="band"></div><div class="target"></div></div>
        <div class="tlabel" id="tlabel"></div>
      </div>
    </div>
    <div class="answer" id="answer">
      <div class="field">
        <span class="lead" id="lead">🔎</span>
        <input id="guess" type="text" autocomplete="off" spellcheck="false" placeholder="Type an animal, object, place…" aria-label="Your answer" role="combobox" aria-expanded="false" aria-controls="sugg">
        <ul class="sugg" id="sugg" role="listbox" hidden></ul>
      </div>
      <button class="dg-btn accent lock" id="lock" type="button" disabled>Lock it in</button>
    </div>
    <p class="hint" id="hint">Pick from the list as you type. ${sc.items.length} things to choose from.</p>
    <div id="result"></div>
  </section>`;
  wireInput(r);
  startTimer(deadline);
  setTimeout(() => $("#guess")?.focus({ preventScroll: true }), 60);
}

const endHtml = (side, item, word) => `
  <figure class="end ${side}"><div class="disc"><span class="emo">${item.emoji}</span></div>
  <figcaption><b class="end-name">${esc(item.name)}</b><span class="end-val" id="val-${side}">${word}</span></figcaption></figure>`;

/* ---------------- Autocomplete ---------------- */
function wireInput(round) {
  const inp = $("#guess"), list = $("#sugg"), lock = $("#lock"), lead = $("#lead");
  let matches = [], act = 0, chosen = null;
  const close = () => { list.hidden = true; inp.setAttribute("aria-expanded", "false"); };
  const choose = (item) => { chosen = item; inp.value = item.name; lead.textContent = item.emoji; lock.disabled = false; close(); };
  const draw = () => {
    if (!inp.value.trim()) return close();
    list.hidden = false;
    inp.setAttribute("aria-expanded", "true");
    list.innerHTML = matches.length
      ? matches.map((m, i) => `<li role="option" data-i="${i}" class="${i === act ? "act" : ""}"><span class="e">${m.emoji}</span>${esc(m.name)}</li>`).join("")
      : `<li class="none">Not in the catalog yet. Try something similar.</li>`;
  };
  inp.addEventListener("input", () => {
    chosen = null; lock.disabled = true; lead.textContent = "🔎"; act = 0;
    matches = search(round, inp.value);
    draw();
  });
  inp.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" && matches.length) { e.preventDefault(); act = (act + 1) % matches.length; draw(); }
    else if (e.key === "ArrowUp" && matches.length) { e.preventDefault(); act = (act - 1 + matches.length) % matches.length; draw(); }
    else if (e.key === "Enter") { e.preventDefault(); if (chosen) submit(chosen); else if (matches[act]) choose(matches[act]); }
    else if (e.key === "Escape") close();
  });
  list.addEventListener("mousedown", (e) => {
    const li = e.target.closest("li[data-i]");
    if (li) { e.preventDefault(); choose(matches[+li.dataset.i]); inp.focus(); }
  });
  inp.addEventListener("blur", () => setTimeout(close, 120));
  lock.addEventListener("click", () => chosen && submit(chosen));
}

/* ---------------- Timer ---------------- */
/** Run the round's clock until `deadline` (a Date.now() time), or for a full round. */
function startTimer(deadline = Date.now() + ROUND_SECS * 1000) {
  stopTimer();
  const arc = $("#arc"), num = $("#tnum"), slot = $("#slot");
  const C = 2 * Math.PI * 33;
  arc.style.strokeDasharray = C;
  S.deadline = deadline;
  save();
  const tick = () => {
    const left = Math.max(0, (deadline - Date.now()) / 1000);
    arc.style.strokeDashoffset = C * (1 - left / ROUND_SECS);
    num.textContent = Math.ceil(left) + "s";
    slot.classList.toggle("urgent", left <= 10);
    if (left <= 0) { timer = null; submit(null); return; }
    timer = requestAnimationFrame(tick);
  };
  timer = requestAnimationFrame(tick);
}
function stopTimer() { if (timer) cancelAnimationFrame(timer); timer = null; }

/* ---------------- Reveal ---------------- */
function submit(item) {
  if (S.results[S.idx]) return;
  stopTimer();
  const r = S.rounds[S.idx];
  const { pos, score } = scoreAnswer(r, item ? item.id : null);
  S.results[S.idx] = { itemId: item?.id ?? null, name: item?.name ?? null, emoji: item?.emoji ?? null, score, pos, timedOut: !item };
  save();
  reveal(r, item, pos, score);
}

function reveal(r, item, pos, score) {
  const sc = SCALES[r.scale], show = fmt[r.scale];
  const fa = show(r.a.v), fb = show(r.b.v), fm = show(midValue(sc, r.a, r.b));
  $("#answer").hidden = true;
  $("#hint").hidden = true;
  $("#slot").classList.add("gone");
  for (const [side, f] of [["a", fa], ["b", fb]]) {
    const el = $(`#val-${side}`);
    el.innerHTML = esc(f.main) + (f.sub ? `<small>${esc(f.sub)}</small>` : "");
    el.classList.add("shown");
  }
  const bench = $("#bench"), rail = $("#rail");
  $("#tlabel").textContent = "Middle ≈ " + fm.main;
  requestAnimationFrame(() => bench.classList.add("revealed"));

  if (item) dropPin(rail, item, pos, show);

  const best = closest(r, 3, item);
  best.forEach((b, i) => {
    const g = document.createElement("span");
    g.className = "ghost";
    g.textContent = b.item.emoji;
    g.title = `${b.item.name} · ${show(b.item.v).main}`;
    g.style.left = b.pos * 100 + "%";
    g.style.top = 58 + (i % 2) * 12 + "px";
    rail.appendChild(g);
    setTimeout(() => g.classList.add("on"), (reduce ? 0 : 1150) + i * 140);
  });

  const last = S.idx === S.rounds.length - 1;
  $("#result").innerHTML = `<div class="result c${grade(score)} dg-enter" style="animation-delay:${reduce ? 0 : 0.9}s">
    <div class="score"><b id="scoreNum">0</b><span>/100</span></div>
    <p class="verdict">${verdictFor(score, item)}</p>
    <p class="detail">${detailFor(r, item, pos, fm)}</p>
    <div class="best"><span class="lab">Closest</span>${best.map((b) => pill(b.item, show(b.item.v).main)).join("")}</div>
    <div class="best" id="crowdRow" hidden></div>
    <button class="dg-btn next" id="nextBtn" type="button">${last ? "See today's score →" : "Next round →"}</button>
  </div>`;
  countUp($("#scoreNum"), score, reduce ? 0 : 900, reduce ? 0 : 1000);
  if (score >= 90) setTimeout(() => confetti(score >= 95 ? 160 : 90), reduce ? 0 : 1050);
  renderTracker();
  const nb = $("#nextBtn");
  nb.addEventListener("click", next);
  setTimeout(() => nb.focus({ preventScroll: true }), reduce ? 0 : 1200);
  if (S.mode === "daily") showCrowd(r, S.idx, rail);
}

function dropPin(rail, item, pos, show) {
  const off = pos < 0 || pos > 1;
  const pin = document.createElement("div");
  pin.className = "pin" + (off ? " off" : "") + (pos > 0.6 ? " flip" : "");
  pin.style.left = "50%";
  const v = show(item.v).main;
  pin.innerHTML = `<div class="pin-hop"><div class="pin-bubble">${item.emoji}</div><div class="pin-stem"></div></div><span class="pin-tag">${pos < 0 ? "◀ " : ""}${esc(v)}${pos > 1 ? " ▶" : ""}</span>`;
  rail.appendChild(pin);
  const hop = pin.querySelector(".pin-hop");
  if (!reduce && hop.animate) {
    hop.animate([{ transform: "translateY(-28px)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 500, easing: "ease-out" });
  }
  requestAnimationFrame(() => requestAnimationFrame(() => { pin.style.left = Math.min(1, Math.max(0, pos)) * 100 + "%"; }));
  setTimeout(() => pin.classList.add("landed"), reduce ? 0 : 950);
}

/** Other players' picks for this round: yellow dots on the rail + a "most picked" pill. */
async function showCrowd(r, roundIdx, rail) {
  const stats = await crowdStats();
  const round = stats?.rounds?.find((x) => x.round === roundIdx);
  if (!round || !round.total || !rail.isConnected) return;
  const sc = SCALES[r.scale];
  round.top.forEach((t, i) => {
    const it = sc.byId.get(t.answer);
    if (!it) return;
    const share = t.n / round.total;
    const dot = document.createElement("span");
    dot.className = "crowd";
    dot.style.left = Math.min(1, Math.max(0, posOf(sc, it.v, r.a, r.b))) * 100 + "%";
    dot.style.setProperty("--d", Math.round(8 + share * 22) + "px");
    dot.title = `${it.emoji} ${it.name} · ${Math.round(share * 100)}% of players`;
    rail.appendChild(dot);
    setTimeout(() => dot.classList.add("on"), (reduce ? 0 : 1500) + i * 90);
  });
  const top = round.top.map((t) => ({ t, it: sc.byId.get(t.answer) })).filter((x) => x.it).slice(0, 3);
  if (!top.length) return;
  const row = $("#crowdRow");
  row.innerHTML = `<span class="lab">Most picked · ${round.total} ${round.total === 1 ? "player" : "players"}</span>` +
    top.map(({ t, it }) => pill(it, Math.round((t.n / round.total) * 100) + "%", "crowdpill")).join("");
  row.hidden = false;
}

const pill = (item, value, extra = "") =>
  `<span class="pill ${extra}"><span class="e">${item.emoji}</span>${esc(item.name)} <span class="v">${esc(value)}</span></span>`;

function verdictFor(score, item) {
  if (!item) return "Out of time.";
  return score >= 95 ? "Dead center." : score >= 85 ? "So close." : score >= 70 ? "Nicely in the middle." : score >= 45 ? "Off-center." : score > 0 ? "Way off to one side." : "Off the scale.";
}

function detailFor(r, item, pos, fm) {
  const sc = SCALES[r.scale];
  const mid = `The exact middle is about <span class="m">${esc(fm.main)}</span>.`;
  if (!item) return mid;
  const e = Math.abs(pos - 0.5) * 2, dir = pos < 0.5 ? sc.lo : sc.hi;
  const how = e < 0.04 ? "Right on the mark."
    : pos < 0 ? `It's even ${sc.loC} than the ${esc(r.a.name.toLowerCase())}.`
    : pos > 1 ? `It's even ${sc.hiC} than the ${esc(r.b.name.toLowerCase())}.`
    : e < 0.15 ? `A touch ${dir}.` : e < 0.45 ? `A bit ${dir}.` : `Too ${dir}.`;
  return `<span class="e">${item.emoji}</span> <b>${esc(item.name)}</b> comes in at <span class="m">${esc(fmt[r.scale](item.v).main)}</span>. ${mid} ${how}`;
}

function countUp(el, to, delay, dur) {
  if (!dur) { el.textContent = to; return; }
  setTimeout(() => {
    const t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      el.textContent = Math.round(to * (1 - (1 - p) ** 3));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, delay);
}

function next() {
  if (S.idx < S.rounds.length - 1) {
    S.idx++;
    renderRound();
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    return;
  }
  S.over = true;
  const rows = S.rounds.map((r, i) => ({ scale: r.scale, a: [r.a.name, r.a.emoji], b: [r.b.name, r.b.emoji], ...S.results[i] }));
  const total = rows.reduce((sum, r) => sum + r.score, 0);
  let send = null;
  if (S.mode === "daily") {
    store.saveDay(TODAY, { total, rows }, total);
    send = submitPlay(GAME_ID, TODAY, clientId(), S.results.map((r) => r.itemId));
  }
  showSummary(S.mode, rows, total, send);
}

/* ---------------- Summary ---------------- */
function showSummary(mode, rows, total, sent = null) {
  stopTimer();
  tracker.innerHTML = rows.map((r) => `<i class="${segClass(r.score)}"></i>`).join("");
  const st = store.stats();
  const title = total >= 450 ? "Perfectly balanced." : total >= 380 ? "A true middleman." : total >= 300 ? "Solidly centered." : total >= 200 ? "Leaning a little." : "Tipped the scales.";
  const shareText = `Middleman ${mode === "daily" ? "#" + PUZZLE_NO : "practice"} · ${total}/500\n` +
    rows.map((r) => `${SCALES[r.scale].icon} ${SQUARES[grade(r.score)]} ${String(r.score).padStart(3, " ")}`).join("\n");
  const daily = mode === "daily";
  view.innerHTML = `
  <section class="dg-summary dg-enter">
    <div class="dg-verdict">
      <span class="big" id="tot">0</span><span>of 500</span>
      <h2>${title}</h2>
      ${pointsLine(GAME_ID, { total }, daily)}
      ${daily ? "" : "<p>Practice games don't count toward your streak.</p>"}
    </div>
    <p class="dg-rank" id="rank" hidden></p>
    <div class="rows">${rows.map((r) => `<div class="row"><span class="ic">${icon(r.scale)}</span>
        <span class="pair">${esc(r.a[0])} ↔ ${esc(r.b[0])}</span>
        <span class="pick">${r.timedOut ? "Out of time" : `<span class="e">${r.emoji}</span> ${esc(r.name)}`}</span>
        <span class="n">${r.score}</span></div>`).join("")}</div>
    ${daily ? `<div class="dg-stats">
      <div class="dg-stat"><b>${st.streak}</b><span>Day streak</span></div>
      <div class="dg-stat"><b>${st.played}</b><span>Played</span></div>
      <div class="dg-stat"><b>${st.best || total}</b><span>Best score</span></div>
      <div class="dg-stat"><b id="cd">--:--:--</b><span>Next puzzle</span></div></div>` : ""}
    <div class="dg-actions">
      ${daily ? seriesButton(TODAY) : ""}
      <button class="dg-btn plain" id="copyBtn" type="button">Share</button>
      <button class="dg-btn plain" id="practiceBtn" type="button">${daily ? "Play a practice round" : "Another practice round"}</button>
      ${!daily ? (store.getDay(TODAY) ? `<button class="dg-btn plain" id="backBtn" type="button">Back to today's result</button>` : `<button class="dg-btn plain" id="dailyBtn" type="button">Play today's puzzle</button>`) : ""}
    </div>
  </section>`;

  countUp($("#tot"), total, reduce ? 0 : 150, reduce ? 0 : 1100);
  wireShare($("#copyBtn"), shareText);
  $("#practiceBtn").addEventListener("click", () => { startGame("practice"); window.scrollTo({ top: 0 }); });
  $("#backBtn")?.addEventListener("click", () => { const d = store.getDay(TODAY); showSummary("daily", d.rows, d.total); });
  $("#dailyBtn")?.addEventListener("click", () => startGame("daily"));
  if (total >= 400) setTimeout(() => confetti(200), reduce ? 0 : 500);
  startCountdown($("#cd"));
  if (daily) showRank($("#rank"), sent, GAME_ID, TODAY, total);
}

/* ---------------- How to play ---------------- */
function howTo(onClose) {
  modal({
    title: "How to play",
    body: `<ol>
      <li><b>Two things and a measure.</b> Each round is about weight, speed, size, age or price.</li>
      <li><b>Name something right in the middle.</b> Pick it from the list as you type. You have ${ROUND_SECS} seconds.</li>
      <li><b>The middle is by ratio</b> for weight, speed, size and price, the way you'd eyeball it. Halfway between 1 kg and 100 kg is 10 kg, not 50. For age it is the plain average of the two years.</li>
      <li><b>Dead center scores 100.</b> Anything outside the two ends scores 0. Five rounds a day, up to 500 points.</li>
    </ol>`,
    onClose,
  });
}
$("#howBtn").addEventListener("click", () => howTo());

/* ---------------- Boot ---------------- */
// A game the player hasn't unlocked shows how to open it instead.
if (!lockScreen(GAME_ID, view)) {
  const saved = store.getDay(TODAY);
  if (saved?.rows) showSummary("daily", saved.rows, saved.total);
  else {
    startGame("daily", store.progress(TODAY));
    if (!store.flag("seenHelp")) {
      // First visit: explain the rules before the clock starts.
      store.setFlag("seenHelp");
      stopTimer();
      howTo(() => { startTimer(); $("#guess")?.focus(); });
    }
  }
}
