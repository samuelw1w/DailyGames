// Hub: one card per game from the registry, grouped by category, with today's status
// from local storage.
import { GAMES, CATEGORIES } from "../shared/registry.js";
import { dayKey, parseDayKey } from "../shared/daily.js";
import { gameStore } from "../shared/storage.js";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const today = dayKey();
document.getElementById("today").textContent = new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

const live = GAMES.filter((g) => g.status === "live");
const results = new Map(live.map((g) => [g.id, gameStore(g.id).getDay(today)]));
const done = live.filter((g) => results.get(g.id)).length;

/** What the card says once today's puzzle is finished. Games can save their own `label`. */
const doneText = (g, result) => `Done: ${result.label ?? `${result.total}/${g.maxScore}`}`;

function card(g) {
  if (g.status !== "live") {
    return `<div class="dg-card game soon" style="--c:${esc(g.accent)}"><span class="dot"></span><b>${esc(g.name)}</b><span class="status">Soon</span></div>`;
  }
  const result = results.get(g.id);
  return `<a class="dg-card game ${result ? "done" : ""}" href="${esc(g.path)}" style="--c:${esc(g.accent)}" title="${esc(g.tagline)}">
    <span class="dot"></span><b>${esc(g.name)}</b><span class="status">${result ? esc(doneText(g, result)) : "Play"}</span></a>`;
}

document.getElementById("games").innerHTML = CATEGORIES
  .map((category) => [category, GAMES.filter((g) => g.category === category)])
  .filter(([, games]) => games.length)
  .map(([category, games]) => `<section class="section dg-enter"><h2 class="dg-label">${esc(category)}</h2><div class="games">${games.map(card).join("")}</div></section>`)
  .join("");

document.getElementById("segs").innerHTML = live.map((g) => `<i class="${results.get(g.id) ? "on" : ""}" style="--c:${esc(g.accent)}"></i>`).join("");
document.getElementById("progress").textContent = `${done} of ${live.length} done`;

// Hub streak: days in a row with at least one game finished. Today only counts once played.
const played = new Set(live.flatMap((g) => Object.keys(gameStore(g.id).history())));
const d = parseDayKey(today);
if (!played.has(today)) d.setDate(d.getDate() - 1);
let streak = 0;
while (played.has(dayKey(d))) { streak++; d.setDate(d.getDate() - 1); }
document.getElementById("streak").textContent = streak ? `${streak}-day streak` : "";
