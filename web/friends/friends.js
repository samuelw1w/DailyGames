// Friends page: the table for one day or for all time, a head-to-head with one friend, and
// the last seven days.
//
// THE FRIENDS HERE ARE A MOCK-UP. Their names and scores are made up in this file (the same
// ones every time, from the date) so the page can be designed and tried before accounts
// exist. "You" is real: it reads the scores saved in this browser. To make this page real,
// replace friendDay() with scores fetched from the API.
import { GAMES } from "../shared/registry.js";
import { dayKey, parseDayKey } from "../shared/daily.js";
import { hash, mulberry32 } from "../shared/random.js";
import { ACTS, ORDER, seriesState, times, playedDays, bankedOn } from "../shared/series.js";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const $ = (id) => document.getElementById(id);
const fmt = (n) => n.toLocaleString("en-US");
const game = (id) => GAMES.find((g) => g.id === id);
const TODAY = dayKey();
const BACK = 30; // how many days back the page goes

/* ---------------- Made-up friends ---------------- */

// `skill` is how well they usually score (0 to 1); `risk` how often they gamble their points.
const FRIENDS = [
  { name: "Maya", skill: 0.8, risk: 0.3 },
  { name: "Theo", skill: 0.68, risk: 0.85 },
  { name: "Priya", skill: 0.74, risk: 0.5 },
  { name: "Jonah", skill: 0.58, risk: 0.6 },
  { name: "Lena", skill: 0.64, risk: 0.15 },
];
const MULTIPLES = [0.4, 0.6, 0.8, 0.8, 1, 1.2, 1.2, 1.4, 1.6, 2]; // Risk moves a score in steps of 0.2×, from 0× to 2×

/** A made-up friend's day: the same shape as a real one, or null on a day they didn't play. */
function friendDay(friend, day) {
  const rng = mulberry32(hash(`friend:${friend.name}:${day}`));
  if (rng() < 0.12) return null;
  const points = Object.fromEntries(ORDER.map((id) => [id, Math.max(0, Math.min(100, Math.round(100 * (friend.skill + (rng() - 0.5) * 0.75))))]));
  const base = ORDER.reduce((sum, id) => sum + points[id], 0);
  const risked = rng() < friend.risk;
  const total = risked ? Math.round(base * MULTIPLES[Math.floor(rng() * MULTIPLES.length)]) : base;
  return { points, base, total, risked, done: true };
}

/** Your own day, from what's saved in this browser, or null if you didn't play. */
function yourDay(day) {
  const s = seriesState(day);
  if (!s.played) return null;
  return { points: s.points, base: s.total, total: s.final?.total ?? s.total, risked: !!s.final?.house, done: !!s.final };
}

/**
 * Everything someone has scored: { total, days, best, average }. `dayOf(key)` gives their day.
 * The made-up friends have been playing for the last 30 days; you, for as long as this
 * browser has results saved.
 */
function career(keys, dayOf) {
  const totals = keys.map(dayOf).filter(Boolean).map((d) => d.total);
  const total = totals.reduce((a, b) => a + b, 0);
  return { total, days: totals.length, best: totals.length ? Math.max(...totals) : 0, average: totals.length ? Math.round(total / totals.length) : 0 };
}
const lastDays = () => Array.from({ length: BACK + 1 }, (_, n) => shift(TODAY, -n));
const yourDays = playedDays;
// Your all-time total is every point you have banked. Spending points on games doesn't lower it.
const banked = (key) => { const total = bankedOn(key); return total ? { total } : null; };
const careers = () => [{ name: "You", you: true, all: career(yourDays(), banked) }, ...FRIENDS.map((f) => ({ name: f.name, all: career(lastDays(), (key) => friendDay(f, key)) }))]
  .sort((a, b) => b.all.total - a.all.total);

const everyone = (day) => [{ name: "You", you: true, day: yourDay(day) }, ...FRIENDS.map((f) => ({ name: f.name, day: friendDay(f, day) }))]
  .sort((a, b) => (b.day?.total ?? -1) - (a.day?.total ?? -1));

/* ---------------- The page ---------------- */

let day = TODAY;
let versus = FRIENDS[0].name; // the friend you're being compared with
let scope = "daily";          // "daily" for one day's scores, "all" for everything added up

const shift = (key, n) => { const d = parseDayKey(key); d.setDate(d.getDate() + n); return dayKey(d); };
const label = (key) => (key === TODAY ? "Today" : key === shift(TODAY, -1) ? "Yesterday" : parseDayKey(key).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }));
const actPoints = (d, act) => act.games.reduce((sum, id) => sum + (d.points[id] ?? 0), 0);

function how(d) {
  if (!d) return "Didn't play";
  const acts = ACTS.map((a) => `${a.name} ${actPoints(d, a)}`).join(" · ");
  return `${acts}${d.risked ? ` · ${d.total === 0 ? "bust" : times(d.total / d.base)}` : d.done ? "" : " · in progress"}`;
}

/** The all-time table: everyone's points added up, and you against one friend over the long run. */
function renderAllTime() {
  const people = careers();
  const you = people.find((p) => p.you).all, friend = FRIENDS.find((f) => f.name === versus), them = people.find((p) => p.name === versus).all;
  const side = (mine, theirs) => `<b class="${mine >= theirs && mine > 0 ? "ahead" : ""}">${fmt(mine)}</b>`;
  const row = (p, n) => {
    const inner = `<span class="rank">${n + 1}</span><span class="face">${esc(p.name[0])}</span><span class="name">${esc(p.name)}</span>
      <span class="total">${fmt(p.all.total)}</span><span class="how">${p.all.days ? `${p.all.days} ${p.all.days === 1 ? "day" : "days"} · ${fmt(p.all.average)} a day · best ${fmt(p.all.best)}` : "Hasn't played yet"}</span>`;
    return p.you ? `<div class="dg-card who you">${inner}</div>` : `<button class="dg-card who" type="button" data-versus="${esc(p.name)}" aria-pressed="${p.name === versus}">${inner}</button>`;
  };
  // Head to head: every day you both played.
  let won = 0, lost = 0;
  for (const key of yourDays()) {
    const a = yourDay(key), b = friendDay(friend, key);
    if (a && b) { if (a.total > b.total) won++; else if (a.total < b.total) lost++; }
  }
  const line = (what, a, b) => `<div class="line">${side(a, b)}<span class="what">${what}</span>${side(b, a)}</div>`;
  $("view").innerHTML = `
    <div class="board">${people.map(row).join("")}</div>
    <h2 class="dg-label">You and ${esc(versus)}, all time</h2>
    <div class="dg-card versus">
      <div class="heads">
        <div><span>You</span>${side(you.total, them.total)}</div>
        <i>vs</i>
        <div><span>${esc(versus)}</span>${side(them.total, you.total)}</div>
      </div>
      <div class="lines">${line("Days played", you.days, them.days)}${line("Average day", you.average, them.average)}${line("Best day", you.best, them.best)}${line("Days won", won, lost)}</div>
    </div>
    <p class="tally">All-time points are every day's final score added up, after Risk. Points spent on unlocking games still count.</p>`;
  document.querySelectorAll("[data-versus]").forEach((b) => b.addEventListener("click", () => { versus = b.dataset.versus; render(); }));
}

function render() {
  $("days").hidden = scope === "all";
  $("tab-daily").setAttribute("aria-selected", String(scope === "daily"));
  $("tab-all").setAttribute("aria-selected", String(scope === "all"));
  if (scope === "all") return renderAllTime();
  $("day").textContent = label(day);
  $("next").disabled = day === TODAY;
  $("prev").disabled = day === shift(TODAY, -BACK);

  const people = everyone(day);
  const you = people.find((p) => p.you).day, them = people.find((p) => p.name === versus).day;
  const side = (mine, theirs, text) => `<b class="${mine !== null && (theirs === null || mine >= theirs) ? "ahead" : ""}">${text}</b>`;
  const num = (d, value) => (d ? value : "–");

  const row = (p, n) => {
    const inner = `<span class="rank">${p.day ? n + 1 : ""}</span><span class="face">${esc(p.name[0])}</span><span class="name">${esc(p.name)}</span>
      <span class="total">${p.day ? fmt(p.day.total) : "–"}</span><span class="how">${esc(how(p.day))}</span>`;
    return p.you ? `<div class="dg-card who you ${p.day ? "" : "out"}">${inner}</div>`
      : `<button class="dg-card who ${p.day ? "" : "out"}" type="button" data-versus="${esc(p.name)}" aria-pressed="${p.name === versus}">${inner}</button>`;
  };

  const line = (what, a, b, cls = "") => `<div class="line ${cls}">${side(a, b, a ?? "–")}<span class="what">${what}</span>${side(b, a, b ?? "–")}</div>`;
  const lines = ACTS.map((act) => line(esc(act.name), you ? actPoints(you, act) : null, them ? actPoints(them, act) : null, "act")
    + act.games.map((id) => line(`<i style="--c:${esc(game(id).accent)}"></i>${esc(game(id).name)}`, you ? you.points[id] : null, them ? them.points[id] : null)).join("")).join("");

  // The last seven days up to the one being shown.
  let won = 0, lost = 0;
  const week = Array.from({ length: 7 }, (_, n) => shift(TODAY, n - 6)).map((key) => {
    const a = yourDay(key), b = friendDay(FRIENDS.find((f) => f.name === versus), key);
    const result = a && b ? (a.total > b.total ? "won" : a.total < b.total ? "lost" : "") : "";
    if (result === "won") won++; else if (result === "lost") lost++;
    return `<button type="button" class="${result} ${key === day ? "shown" : ""}" data-day="${key}" aria-label="${esc(label(key))}">
      <span>${parseDayKey(key).toLocaleDateString("en-US", { weekday: "narrow" })}</span><b>${a ? fmt(a.total) : "–"}</b><em>${b ? fmt(b.total) : "–"}</em></button>`;
  }).join("");

  $("view").innerHTML = `
    <div class="board">${people.map(row).join("")}</div>
    <h2 class="dg-label">You and ${esc(versus)}</h2>
    <div class="dg-card versus">
      <div class="heads">
        <div><span>You</span>${side(you?.total ?? null, them?.total ?? null, num(you, you && fmt(you.total)))}</div>
        <i>vs</i>
        <div><span>${esc(versus)}</span>${side(them?.total ?? null, you?.total ?? null, num(them, them && fmt(them.total)))}</div>
      </div>
      <div class="lines">${lines}</div>
    </div>
    <h2 class="dg-label">Last seven days</h2>
    <div class="week">${week}</div>
    <p class="tally">${won || lost ? `You ${won > lost ? "lead" : won < lost ? "trail" : "are level with"} ${esc(versus)} ${Math.max(won, lost)}–${Math.min(won, lost)} this week.` : `No days played against ${esc(versus)} yet this week.`} Your score is on top.</p>`;

  document.querySelectorAll("[data-versus]").forEach((b) => b.addEventListener("click", () => { versus = b.dataset.versus; render(); }));
  document.querySelectorAll("[data-day]").forEach((b) => b.addEventListener("click", () => { day = b.dataset.day; render(); }));
}

$("tab-daily").addEventListener("click", () => { scope = "daily"; render(); });
$("tab-all").addEventListener("click", () => { scope = "all"; render(); });
$("prev").addEventListener("click", () => { day = shift(day, -1); render(); });
$("next").addEventListener("click", () => { day = shift(day, 1); render(); });
render();
