// Hub: the day as one series (two acts, then Risk), plus an Episodes tab with every game on
// its own. Everything shown here comes from results saved in this browser.
import { GAMES, CATEGORIES } from "../shared/registry.js";
import { dayKey, parseDayKey, puzzleNumber, msUntilMidnight, formatCountdown } from "../shared/daily.js";
import { gameStore } from "../shared/storage.js";
import { ACTS, ORDER, FINALE, PICKS, seriesState, chooseLineup, lockIn, seriesShare, times, wallet, dayStreak, reportDay } from "../shared/series.js";
import { LOCKED, FIRST_DAY, isPlus, isUnlocked, activeDay, dayQuery } from "../shared/account.js";
import { wireShare, adSlot } from "../shared/ui.js";
import { getStats } from "../shared/api.js";
import { RollingNumber } from "../shared/rolling-number.js";
import { bellCurve } from "../shared/bell-curve.js";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const $ = (id) => document.getElementById(id);
const TODAY = dayKey();
const day = activeDay();            // today, or an earlier day a Plus member has opened
const past = day !== TODAY;
const NUMBER = puzzleNumber(FIRST_DAY, day);
const game = (id) => GAMES.find((g) => g.id === id);
const fmt = (n) => n.toLocaleString("en-US");
const link = (g) => `${esc(g.path)}${dayQuery(day)}`;

/* ---------------- The top of the page ---------------- */

// Streak: days in a row with at least one game played on the day itself. Today only counts once played.
const streak = dayStreak(TODAY);

const dateText = parseDayKey(day).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
$("title").textContent = past ? dateText : "Today";
$("today").textContent = `${past ? "An earlier day" : dateText} · No. ${NUMBER}${streak ? ` · ${streak}-day streak` : ""}`;

// The day's score and the points to spend roll from what this browser last showed to what they
// are now, so coming back from a game (or Risk) shows the new points landing.
const hub = gameStore("hub");
const seen = hub.flag("seen") ?? {};
let shownScore = seen.day === day ? seen.score : 0;
const remember = () => hub.setFlag("seen", { day, score: shownScore, balance: wallet().balance });
const roll = (el, from, to) => {
  const n = new RollingNumber(el, { value: from, locale: "en-US" });
  if (from !== to) setTimeout(() => n.set(to), 350);
  return n;
};
const balance = roll($("balance"), seen.balance ?? 0, wallet().balance);
const updateBalance = () => { balance.set(wallet().balance); remember(); };
if (isPlus()) $("plusBtn").classList.add("on"); // members get a quieter button
$("ad").innerHTML = adSlot("");

// Plus members can step back through earlier days and play them.
if (isPlus()) {
  const shift = (key, n) => { const x = parseDayKey(key); x.setDate(x.getDate() + n); return dayKey(x); };
  const go = (key) => { location.href = `${location.pathname}${dayQuery(key)}${location.hash}`; };
  $("days").hidden = false;
  $("dayLabel").textContent = past ? dateText : "Today";
  $("prev").disabled = day <= FIRST_DAY;
  $("next").disabled = !past;
  $("prev").addEventListener("click", () => go(shift(day, -1)));
  $("next").addEventListener("click", () => go(shift(day, 1)));
}

/* ---------------- The Series ---------------- */

/**
 * Choose an act's games: a sheet over the hub listing all five. Up to three can be in; locked
 * ones are shown with what they cost. Every tap is saved, so closing is all there is to do.
 */
function openPicker(actId) {
  const a = ACTS.find((x) => x.id === actId);
  const o = document.createElement("div");
  o.className = "dg-overlay sheet";
  document.body.appendChild(o);
  const close = () => { o.remove(); document.removeEventListener("keydown", onKey); renderSeries(); renderEpisodes(); };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  o.addEventListener("click", (e) => { if (e.target === o) close(); });

  const draw = () => {
    const mine = seriesState(day).lineup[a.id];
    const row = (id) => {
      const g = game(id), on = mine.includes(id);
      if (!isUnlocked(id)) return `<a class="pick locked" href="${esc(g.path)}" style="--c:${esc(g.accent)}"><i></i><b>${esc(g.name)}</b><span>${fmt(LOCKED[id])} points to unlock</span></a>`;
      return `<button class="pick" type="button" data-id="${id}" aria-pressed="${on}" style="--c:${esc(g.accent)}" ${!on && mine.length >= PICKS ? "disabled" : ""}><i></i><b>${esc(g.name)}</b><span>${on ? "Playing" : ""}</span></button>`;
    };
    o.innerHTML = `<div class="dg-card dg-modal" role="dialog" aria-modal="true" aria-labelledby="pickTitle">
      <h3 id="pickTitle">${a.name}: pick ${PICKS}</h3>
      <div class="picks">${a.games.map(row).join("")}</div>
      <button class="dg-btn" type="button" id="pickDone">Done</button>
    </div>`;
    o.querySelectorAll("[data-id]").forEach((b) => b.addEventListener("click", () => {
      const id = b.dataset.id, lineup = seriesState(day).lineup;
      chooseLineup(day, { ...lineup, [a.id]: mine.includes(id) ? mine.filter((x) => x !== id) : [...mine, id] });
      draw();
    }));
    o.querySelector("#pickDone").addEventListener("click", close);
  };
  draw();
}

function renderSeries() {
  const s = seriesState(day);
  const started = s.played > 0;
  const nowAct = s.acts.find((a) => !a.done)?.id ?? FINALE;

  const dot = (id) => `<i class="${s.points[id] === null ? "" : "on"}" style="--c:${esc(game(id).accent)}" title="${esc(game(id).name)}${s.points[id] === null ? "" : `: ${s.points[id]}`}"></i>`;
  // Until one of its games is played, an act can be tapped to choose which of its games count.
  const act = (a) => {
    const canPick = !a.started && !s.final;
    const inner = `<b>${a.name}</b>
      <span class="pts">${a.open.some((id) => s.points[id] !== null) ? `<b>${a.points}</b> / ${a.max}` : canPick ? "Choose" : ""}</span>
      <span class="sub">${a.open.map((id) => esc(game(id).name)).join(", ") || "No games chosen"}</span>
      <span class="dots">${a.open.map(dot).join("")}</span>`;
    const cls = `dg-card step ${a.done && a.open.length ? "done" : a.id === nowAct ? "now" : "later"}`;
    return canPick ? `<button class="${cls} pickable" type="button" data-pick="${a.id}">${inner}</button>` : `<div class="${cls}">${inner}</div>`;
  };

  const final = s.final;
  // Risk is dealt by the server on the day itself; an earlier day can only bank its points.
  const canRisk = !past && !s.late;
  const riskLine = final ? (final.house ? (final.total === 0 ? "Bust" : times(final.total / final.base)) : "Banked") : "";
  const risk = `
    <div class="dg-card step ${final ? "done" : nowAct === FINALE ? "now" : "later"}" style="--c:${esc(game(FINALE).accent)}">
      <b>${canRisk || final?.house ? "Risk" : "Bank"}</b>
      <span class="pts">${final ? `<b>${esc(riskLine)}</b>` : ""}</span>
      <span class="sub">${final ? (final.house ? `${fmt(final.total)} points from the tables` : `${fmt(final.total)} points banked`) : canRisk ? "Bank your score as points, or risk the points for up to 2×" : "Earlier days bank their score as points"}</span>
      <span class="dots"><i class="${final?.house ? "on" : ""}"></i></span>
    </div>`;

  let action;
  if (final) {
    action = `<div class="choice"><button class="dg-btn" type="button" id="shareBtn">Share</button></div>
      <p class="note">${past ? `${fmt(final.total)} points banked from this day.` : `${fmt(final.total)} points banked. Next series in <span id="cd"></span>`}</p>`;
  } else if (s.complete) {
    action = `<div class="choice">
        ${canRisk ? `<a class="dg-btn" href="${link(game(FINALE))}" style="--accent:${esc(game(FINALE).accent)}">Risk it for up to ${fmt(s.total * 2)} points</a>` : ""}
        <button class="dg-btn ${canRisk ? "plain" : ""}" type="button" id="lockBtn">Bank ${fmt(s.total)} points</button>
      </div>
      <p class="note">${canRisk ? "Your score stays as it is either way. At the tables, up to five win-or-lose hands move the points it banks by 0.2× each: anywhere from nothing to double." : "Your score for this day stays as it is, and its points go toward unlocking games."}</p>`;
  } else {
    const next = game(s.next ?? ORDER[0]);
    action = `<div class="choice"><a class="dg-btn" href="${link(next)}" style="--accent:${esc(next.accent)}">${started ? `Continue: ${esc(next.name)}` : "Start the series"}</a></div>
      <p class="note">${started ? `${s.played} of ${s.open.length} played` : `Tap Play or Know to choose your three. Up to 100 a game.`}</p>`;
  }

  // The big number is always the day's score (0 to 600). Risk only changes the points it banks.
  const shown = s.total;
  const scoreLabel = s.late ? "archive score: played later, not ranked" : s.complete ? `${past ? "that day's score" : "today's score"} · out of ${fmt(s.max)}` : `of ${fmt(s.max)}`;
  $("panel-series").innerHTML = `
    <div class="score">
      <b class="${started ? "" : "dim"}" id="score"></b>
      <span>${scoreLabel}</span>
      ${final?.house ? `<span class="how">${final.total === 0 ? "Its points were lost at the tables" : `<b>${fmt(final.total)}</b> points banked at <b>${times(final.total / final.base)}</b>`}</span>` : ""}
    </div>
    <div id="curveSlot" hidden></div>
    <div class="dg-segs" aria-hidden="true">${s.open.map((id) => `<i class="${s.points[id] === null ? "" : "on"}" style="--c:${esc(game(id).accent)}"></i>`).join("")}</div>
    <div class="steps">${s.acts.map(act).join("")}${risk}</div>
    ${action}`;

  roll($("score"), shownScore, shown);
  shownScore = shown;
  remember();

  document.querySelectorAll("[data-pick]").forEach((b) => b.addEventListener("click", () => openPicker(b.dataset.pick)));
  $("lockBtn")?.addEventListener("click", () => { lockIn(day); updateBalance(); renderSeries(); });
  if ($("shareBtn")) wireShare($("shareBtn"), () => seriesShare(NUMBER, seriesState(day)));
  const cd = $("cd");
  if (cd) { const tick = () => (cd.textContent = formatCountdown(msUntilMidnight())); tick(); setInterval(tick, 1000); }
  if (s.complete && !s.late) showCurve(s.total);
}

/**
 * Once the day's series is played: send it to the server (which scores it from its own record
 * of each game), then draw where that score sits among everyone's. Hidden without the API, or
 * until a second player has finished. Drawn once; later renders move the same curve into place.
 */
let curve = null; // { score, el } once asked for
async function showCurve(score) {
  if (curve?.score === score) { if (curve.el) $("curveSlot")?.replaceWith(curve.el); return; }
  curve = { score, el: null };
  if (!past) await reportDay(day);
  const stats = await getStats("series", day, score);
  if (!stats?.rank || stats.players < 2 || curve.score !== score) return;
  const el = document.createElement("div");
  el.className = "dg-card";
  $("curveSlot")?.replaceWith(el);
  curve.el = el;
  bellCurve(el, { mean: stats.averageScore, spread: stats.spread, histogram: stats.histogram, max: stats.maxScore, score, betterThan: stats.rank.betterThan, players: stats.players });
  el.insertAdjacentHTML("beforeend", `<a class="dg-link bell-more" href="friends/">See the leaderboard</a>`);
}

/* ---------------- Episodes ---------------- */

function renderEpisodes() {
  const s = seriesState(day);
  const card = (g) => {
    if (!isUnlocked(g.id)) {
      return `<a class="dg-card game locked" href="${esc(g.path)}" style="--c:${esc(g.accent)}" title="${esc(g.tagline)}">
        <span class="dot"></span><b>${esc(g.name)}</b><span class="status">${fmt(LOCKED[g.id])} points</span></a>`;
    }
    const result = gameStore(g.id).getDay(day), points = s.points[g.id], counts = s.open.includes(g.id);
    return `<a class="dg-card game ${result ? "done" : ""}" href="${link(g)}" style="--c:${esc(g.accent)}" title="${esc(g.tagline)}">
      <span class="dot"></span><b>${esc(g.name)}</b><span class="status">${result ? `${points} points${counts ? "" : " · for fun"}` : counts ? "Play" : s.lineup ? "Play for fun" : "Play"}</span></a>`;
  };
  const anyLocked = ORDER.some((id) => !isUnlocked(id));
  $("panel-episodes").innerHTML = CATEGORIES.map((category) => {
    const act = ACTS.find((a) => a.name === category);
    return `<section class="section"><h2 class="dg-label">${esc(category)}</h2><div class="games">${act.games.map((id) => card(game(id))).join("")}</div></section>`;
  }).join("") + `<p class="note">The games in ${past ? "that day's" : "today's"} series count toward the day's score wherever you play them; the rest are just for fun.${anyLocked ? " Locked games open for good with points, or all at once with Plus." : ""}</p>`;
}

/* ---------------- Tabs ---------------- */

// The panels' ids differ from the "#episodes" in the address on purpose: a matching id would
// make the browser jump down to the panel whenever the page loads (switching days, say).
function show(tab) {
  for (const name of ["series", "episodes"]) {
    $(`panel-${name}`).hidden = name !== tab;
    $(`tab-${name}`).setAttribute("aria-selected", String(name === tab));
  }
  history.replaceState(null, "", `${location.pathname}${location.search}${tab === "episodes" ? "#episodes" : ""}`);
}
$("tab-series").addEventListener("click", () => show("series"));
$("tab-episodes").addEventListener("click", () => show("episodes"));

renderSeries();
renderEpisodes();
show(location.hash === "#episodes" ? "episodes" : "series");
