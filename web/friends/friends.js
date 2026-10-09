// Leaderboards: two boards, both ranked on the day's score (0 to 600, before Risk; Risk only
// moves points). "Everyone" is real: the best scores the server holds for a day or a week, under
// names made from each player's client id. "Friends" is the table for one day or for all
// time, a head-to-head with one friend, and the last seven days.
//
// THE FRIENDS HERE ARE A MOCK-UP. Their names and scores are made up in this file (the same
// ones every time, from the date) so the page can be designed and tried before accounts
// exist. "You" is real: it reads the scores saved in this browser. To make this page real,
// replace friendDay() with scores fetched from the API.
import { GAMES } from "../shared/registry.js";
import { dayKey, parseDayKey } from "../shared/daily.js";
import { hash, mulberry32 } from "../shared/random.js";
import { clientId } from "../shared/storage.js";
import { getLeaderboard } from "../shared/api.js";
import { nameFor } from "../shared/names.js";
import { ACTS, ORDER, seriesState, playedDays } from "../shared/series.js";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const $ = (id) => document.getElementById(id);
const fmt = (n) => n.toLocaleString("en-US");
const game = (id) => GAMES.find((g) => g.id === id);
const TODAY = dayKey();
const BACK = 30; // how many days back the page goes

/* ---------------- Made-up friends ---------------- */

// `skill` is how well they usually score (0 to 1).
const FRIENDS = [
  { name: "Maya", skill: 0.8 },
  { name: "Theo", skill: 0.68 },
  { name: "Priya", skill: 0.74 },
  { name: "Jonah", skill: 0.58 },
  { name: "Lena", skill: 0.64 },
];

/** A made-up friend's day: the same shape as a real one, or null on a day they didn't play. */
function friendDay(friend, day) {
  const rng = mulberry32(hash(`friend:${friend.name}:${day}`));
  if (rng() < 0.12) return null;
  // Like everyone, a friend plays three games from each act: here, a different three each day.
  const lineup = ACTS.flatMap((act) => [...act.games].sort(() => rng() - 0.5).slice(0, 3));
  const points = Object.fromEntries(ORDER.map((id) => [id, lineup.includes(id) ? Math.max(0, Math.min(100, Math.round(100 * (friend.skill + (rng() - 0.5) * 0.75)))) : null]));
  return { points, total: lineup.reduce((sum, id) => sum + points[id], 0), done: true };
}

/**
 * Your own day's score, from what's saved in this browser, or null if you didn't play it.
 * A day played later (from the archive) isn't ranked, so it counts as not played here.
 */
function yourDay(day) {
  const s = seriesState(day);
  if (!s.played || s.late) return null;
  return { points: s.points, total: s.total, done: s.complete };
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
// Your all-time total is every day's score added up. Risk and spending points don't change it.
const careers = () => [{ name: "You", you: true, all: career(yourDays(), yourDay) }, ...FRIENDS.map((f) => ({ name: f.name, all: career(lastDays(), (key) => friendDay(f, key)) }))]
  .sort((a, b) => b.all.total - a.all.total);

const everyone = (day) => [{ name: "You", you: true, day: yourDay(day) }, ...FRIENDS.map((f) => ({ name: f.name, day: friendDay(f, day) }))]
  .sort((a, b) => (b.day?.total ?? -1) - (a.day?.total ?? -1));

/* ---------------- The page ---------------- */

/** A friend's name, with a label on the one being compared with you further down. */
const nameHtml = (p) => `<span class="name">${esc(p.name)}${p.name === versus ? `<em>Comparing</em>` : ""}</span>`;

let board = location.hash === "#friends" ? "friends" : "everyone"; // which leaderboard is showing
let day = TODAY;
let versus = FRIENDS[0].name; // the friend you're being compared with. Their row is outlined and labelled.
let scope = "daily";          // "daily" for one day's scores, "all" for everything added up

const shift = (key, n) => { const d = parseDayKey(key); d.setDate(d.getDate() + n); return dayKey(d); };
const label = (key) => (key === TODAY ? "Today" : key === shift(TODAY, -1) ? "Yesterday" : parseDayKey(key).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }));
const actPoints = (d, act) => act.games.reduce((sum, id) => sum + (d.points[id] ?? 0), 0);

function how(d) {
  if (!d) return "Didn't play";
  const acts = ACTS.map((a) => `${a.name} ${actPoints(d, a)}`).join(" · ");
  return `${acts}${d.done ? "" : " · in progress"}`;
}

/** The all-time table: everyone's points added up, and you against one friend over the long run. */
function renderAllTime() {
  const people = careers();
  const you = people.find((p) => p.you).all, friend = FRIENDS.find((f) => f.name === versus), them = people.find((p) => p.name === versus).all;
  const side = (mine, theirs) => `<b class="${mine >= theirs && mine > 0 ? "ahead" : ""}">${fmt(mine)}</b>`;
  const row = (p, n) => {
    const inner = `<span class="rank">${n + 1}</span><span class="face">${esc(p.name[0])}</span>${nameHtml(p)}
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
    <h2 class="dg-label">You and ${esc(versus)}, all time<span>Tap a friend to switch</span></h2>
    <div class="dg-card versus">
      <div class="heads">
        <div><span>You</span>${side(you.total, them.total)}</div>
        <i>vs</i>
        <div><span>${esc(versus)}</span>${side(them.total, you.total)}</div>
      </div>
      <div class="lines">${line("Days played", you.days, them.days)}${line("Average day", you.average, them.average)}${line("Best day", you.best, them.best)}${line("Days won", won, lost)}</div>
    </div>
    <p class="tally">All-time is every day's score added up. Risk only moves points, so it doesn't count here, and neither do days played later.</p>`;
  document.querySelectorAll("[data-versus]").forEach((b) => b.addEventListener("click", () => { versus = b.dataset.versus; render(); }));
}

/* ---------------- Everyone ---------------- */

/**
 * The real board: the best scores the server holds for the day (or the week to it), with your
 * own place under it when you aren't in the top twenty.
 */
async function renderEveryone() {
  const week = scope === "all", asked = `${day}:${scope}`;
  $("view").innerHTML = `<p class="tally">Loading the leaderboard…</p>`;
  const lb = await getLeaderboard(day, clientId(), week ? "week" : "day");
  if (board !== "everyone" || asked !== `${day}:${scope}`) return; // switched away while it loaded
  const span = week ? "these seven days" : day === TODAY ? "today" : "that day";
  if (!lb) { $("view").innerHTML = `<p class="tally">The leaderboard lives on the server, and it couldn't be reached. Your own scores are still saved in this browser.</p>`; return; }
  const row = (p) => `<div class="dg-card who ${p.you ? "you" : ""}"><span class="rank">${p.rank ?? ""}</span><span class="face">${esc(p.name[0])}</span>
      <span class="name">${esc(p.you ? `${p.name} (you)` : p.name)}</span>
      <span class="total">${p.score === null ? "–" : fmt(p.score)}</span><span class="how">${week ? `${p.days} ${p.days === 1 ? "day" : "days"}` : p.you ? "Your score" : ""}</span></div>`;
  const me = lb.you, inTop = lb.top.some((p) => p.you);
  const mine = me && !inTop ? `<p class="gap">${me.score === null ? `You haven't finished a series ${span} yet.` : "Your place"}</p>${me.score === null ? "" : row({ ...me, you: true, days: me.days ?? "" })}` : "";
  $("view").innerHTML = `
    ${lb.top.length ? `<div class="board">${lb.top.map(row).join("")}</div>${mine}` : `<p class="tally">Nobody has finished a series ${span} yet. Be the first.</p>`}
    <p class="tally">${fmt(lb.players)} ${lb.players === 1 ? "player" : "players"} ${span}, ranked on the day's score out of 600${week ? ", added up" : ""}. Risk only moves points, so it doesn't count here. You show up as ${esc(nameFor(clientId()))}.</p>`;
}

function render() {
  const all = board === "everyone";
  $("board-everyone").setAttribute("aria-selected", String(all));
  $("board-friends").setAttribute("aria-selected", String(!all));
  $("tab-daily").textContent = all ? "Day" : "Daily";
  $("tab-all").textContent = all ? "Week" : "All time";
  $("sub").textContent = all ? "The best day's scores, from everyone who played" : "Sample friends, to show how this page will work";
  $("foot").textContent = all ? "Names are given, not chosen, until there are accounts. Scores are checked by the server." : "These friends are made up, and so are their scores. Real ones need accounts, which the site doesn't have yet. Your own scores are real.";
  $("days").hidden = !all && scope === "all";
  $("tab-daily").setAttribute("aria-selected", String(scope === "daily"));
  $("tab-all").setAttribute("aria-selected", String(scope === "all"));
  $("day").textContent = all && scope === "all" ? `Week to ${label(day).toLowerCase() === "today" ? "today" : label(day)}` : label(day);
  $("next").disabled = day === TODAY;
  $("prev").disabled = day === shift(TODAY, -BACK);
  if (all) return renderEveryone();
  if (scope === "all") return renderAllTime();

  const people = everyone(day);
  const you = people.find((p) => p.you).day, them = people.find((p) => p.name === versus).day;
  const side = (mine, theirs, text) => `<b class="${mine !== null && (theirs === null || mine >= theirs) ? "ahead" : ""}">${text}</b>`;
  const num = (d, value) => (d ? value : "–");

  const row = (p, n) => {
    const inner = `<span class="rank">${p.day ? n + 1 : ""}</span><span class="face">${esc(p.name[0])}</span>${nameHtml(p)}
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
    <h2 class="dg-label">You and ${esc(versus)}<span>Tap a friend to switch</span></h2>
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

const pickBoard = (name) => { board = name; history.replaceState(null, "", `${location.pathname}${location.search}${name === "friends" ? "#friends" : ""}`); render(); };
$("board-everyone").addEventListener("click", () => pickBoard("everyone"));
$("board-friends").addEventListener("click", () => pickBoard("friends"));
$("tab-daily").addEventListener("click", () => { scope = "daily"; render(); });
$("tab-all").addEventListener("click", () => { scope = "all"; render(); });
$("prev").addEventListener("click", () => { day = shift(day, -1); render(); });
$("next").addEventListener("click", () => { day = shift(day, 1); render(); });
render();
