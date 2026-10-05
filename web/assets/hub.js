// Hub: renders a card per game from the registry, with today's status from local storage.
import { GAMES } from "../shared/registry.js";
import { dayKey, puzzleNumber } from "../shared/daily.js";
import { gameStore } from "../shared/storage.js";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const today = dayKey();
document.getElementById("today").textContent = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

const live = GAMES.filter((g) => g.status === "live");
let done = 0;

const cards = live.map((g) => {
  const store = gameStore(g.id);
  const result = store.getDay(today);
  const { streak } = store.stats();
  if (result) done++;
  const status = result
    ? `Today <b>${result.total}/${g.maxScore}</b>${streak > 1 ? ` · ${streak}-day streak` : ""}`
    : `Puzzle #${puzzleNumber(g.launchDay, today)}${streak ? ` · ${streak}-day streak` : ""}`;
  return `<a class="dg-card game dg-enter ${result ? "done" : ""}" href="${esc(g.path)}" style="--g-accent:${esc(g.accent)}">
    <span class="tile" aria-hidden="true">${g.icon}</span>
    <h3>${esc(g.name)}</h3>
    <p>${esc(g.tagline)}</p>
    <div class="foot"><span class="status">${status}</span><span class="dg-btn cta">${result ? "See result" : "Play"}</span></div>
  </a>`;
});

const soon = GAMES.filter((g) => g.status === "soon").map((g) => `<div class="dg-card game soon">
    <span class="tile" aria-hidden="true">${g.icon}</span><h3>${esc(g.name)}</h3><p>${esc(g.tagline)}</p>
    <div class="foot"><span class="status">Coming soon</span></div></div>`);
if (!soon.length) soon.push(`<div class="dg-card game soon"><span class="tile" aria-hidden="true">＋</span><h3>More soon</h3><p>New daily games will show up here.</p></div>`);

document.getElementById("games").innerHTML = cards.concat(soon).join("");
document.getElementById("progress").textContent = `${done} of ${live.length} played today`;
