// Hub: the day as one series (two acts, then Risk), plus an Episodes tab with every game on
// its own. Everything shown here comes from results saved in this browser.
import { GAMES, CATEGORIES } from "../shared/registry.js";
import { dayKey, parseDayKey, puzzleNumber, msUntilMidnight, formatCountdown } from "../shared/daily.js";
import { gameStore } from "../shared/storage.js";
import { ACTS, ORDER, FINALE, seriesState, lockIn, seriesShare, times, wallet } from "../shared/series.js";
import { LOCKED, FIRST_DAY, isPlus, isUnlocked, activeDay, dayQuery } from "../shared/account.js";
import { wireShare, adSlot } from "../shared/ui.js";

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

// Streak: days in a row with at least one game played. Today only counts once played.
const played = new Set(ORDER.flatMap((id) => Object.keys(gameStore(id).history())));
const d = parseDayKey(TODAY);
if (!played.has(TODAY)) d.setDate(d.getDate() - 1);
let streak = 0;
while (played.has(dayKey(d))) { streak++; d.setDate(d.getDate() - 1); }

const dateText = parseDayKey(day).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
$("title").textContent = past ? dateText : "Today";
$("today").textContent = `${past ? "An earlier day" : dateText} · No. ${NUMBER}${streak ? ` · ${streak}-day streak` : ""}`;
$("balance").textContent = fmt(wallet().balance);
if (isPlus()) { $("plusBtn").textContent = "Plus"; $("plusBtn").classList.add("on"); }
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

function renderSeries() {
  const s = seriesState(day);
  const started = s.played > 0;
  const nowAct = s.acts.find((a) => !a.done)?.id ?? FINALE;

  // One dot per game: its color once played, an outline while it's still locked.
  const dot = (id) => (isUnlocked(id)
    ? `<i class="${s.points[id] === null ? "" : "on"}" style="--c:${esc(game(id).accent)}" title="${esc(game(id).name)}${s.points[id] === null ? "" : `: ${s.points[id]}`}"></i>`
    : `<i class="locked" title="${esc(game(id).name)}: locked"></i>`);
  const act = (a) => {
    const locked = a.games.length - a.open.length;
    return `
    <div class="dg-card step ${a.done ? "done" : a.id === nowAct ? "now" : "later"}">
      <b>${a.name}</b>
      <span class="pts">${a.open.some((id) => s.points[id] !== null) ? `<b>${a.points}</b> / ${a.max}` : ""}</span>
      <span class="sub">${a.open.length} ${a.open.length === 1 ? "game" : "games"}${locked ? ` · ${locked} locked` : ""}</span>
      <span class="dots">${a.games.map(dot).join("")}</span>
    </div>`;
  };

  const final = s.final;
  const riskLine = final ? (final.house ? (final.total === 0 ? "Bust" : times(final.total / final.base)) : "Locked in") : "";
  const risk = `
    <div class="dg-card step ${final ? "done" : nowAct === FINALE ? "now" : "later"}" style="--c:${esc(game(FINALE).accent)}">
      <b>Risk</b>
      <span class="pts">${final ? `<b>${esc(riskLine)}</b>` : ""}</span>
      <span class="sub">${final ? (final.house ? "You took it to the tables" : "You kept your points") : "Lock your points in, or risk them for up to 2×"}</span>
      <span class="dots"><i class="${final?.house ? "on" : ""}"></i></span>
    </div>`;

  let action;
  if (final) {
    action = `<div class="choice"><button class="dg-btn" type="button" id="shareBtn">Share</button></div>
      <p class="note">${past ? `${fmt(final.total)} points banked from this day.` : `${fmt(final.total)} points banked. Next series in <span id="cd"></span>`}</p>`;
  } else if (s.complete) {
    action = `<div class="choice">
        <a class="dg-btn" href="${link(game(FINALE))}" style="--accent:${esc(game(FINALE).accent)}">Risk it for up to ${fmt(s.total * 2)}</a>
        <button class="dg-btn plain" type="button" id="lockBtn">Lock in ${fmt(s.total)}</button>
      </div>
      <p class="note">Up to five win-or-lose hands at the casino tables. Each one moves your score by 0.2×: anywhere from nothing to double.</p>`;
  } else {
    const next = game(s.next);
    action = `<div class="choice"><a class="dg-btn" href="${link(next)}" style="--accent:${esc(next.accent)}">${started ? `Continue: ${esc(next.name)}` : "Start the series"}</a></div>
      <p class="note">${started ? `${s.played} of ${s.open.length} played` : `${s.open.length} games, up to 100 points each. What you score is banked as points to spend.`}</p>`;
  }

  const shown = final ? final.total : s.total;
  $("series").innerHTML = `
    <div class="score">
      <b class="${started ? "" : "dim"}">${fmt(shown)}</b>
      <span>${final ? (past ? "that day's score" : "today's score") : `of ${fmt(s.max)}`}</span>
      ${final?.house ? `<span class="how"><b>${fmt(final.base)}</b> points, ${final.total === 0 ? "lost at the tables" : `<b>${times(final.total / final.base)}</b> at the tables`}</span>` : ""}
    </div>
    <div class="dg-segs" aria-hidden="true">${s.open.map((id) => `<i class="${s.points[id] === null ? "" : "on"}" style="--c:${esc(game(id).accent)}"></i>`).join("")}</div>
    <div class="steps">${s.acts.map(act).join("")}${risk}</div>
    ${action}`;

  $("lockBtn")?.addEventListener("click", () => { lockIn(day); $("balance").textContent = fmt(wallet().balance); renderSeries(); });
  if ($("shareBtn")) wireShare($("shareBtn"), () => seriesShare(NUMBER, seriesState(day)));
  const cd = $("cd");
  if (cd) { const tick = () => (cd.textContent = formatCountdown(msUntilMidnight())); tick(); setInterval(tick, 1000); }
}

/* ---------------- Episodes ---------------- */

function renderEpisodes() {
  const s = seriesState(day);
  const card = (g) => {
    if (!isUnlocked(g.id)) {
      return `<a class="dg-card game locked" href="${esc(g.path)}" style="--c:${esc(g.accent)}" title="${esc(g.tagline)}">
        <span class="dot"></span><b>${esc(g.name)}</b><span class="status">${LOCKED[g.id] / 1000}k to unlock</span></a>`;
    }
    const result = gameStore(g.id).getDay(day), points = s.points[g.id];
    return `<a class="dg-card game ${result ? "done" : ""}" href="${link(g)}" style="--c:${esc(g.accent)}" title="${esc(g.tagline)}">
      <span class="dot"></span><b>${esc(g.name)}</b><span class="status">${result ? `${points} points` : "Play"}</span></a>`;
  };
  const anyLocked = ORDER.some((id) => !isUnlocked(id));
  $("episodes").innerHTML = CATEGORIES.map((category) => {
    const act = ACTS.find((a) => a.name === category);
    return `<section class="section"><h2 class="dg-label">${esc(category)}</h2><div class="games">${act.games.map((id) => card(game(id))).join("")}</div></section>`;
  }).join("") + `<p class="note">Any game you play here counts toward ${past ? "that day's" : "today's"} series.${anyLocked ? " Locked games open for good with points, or all at once with Plus." : ""}</p>`;
}

/* ---------------- Tabs ---------------- */

function show(tab) {
  for (const name of ["series", "episodes"]) {
    $(name).hidden = name !== tab;
    $(`tab-${name}`).setAttribute("aria-selected", String(name === tab));
  }
  history.replaceState(null, "", `${location.pathname}${location.search}${tab === "episodes" ? "#episodes" : ""}`);
}
$("tab-series").addEventListener("click", () => show("series"));
$("tab-episodes").addEventListener("click", () => show("episodes"));

renderSeries();
renderEpisodes();
show(location.hash === "#episodes" ? "episodes" : "series");
