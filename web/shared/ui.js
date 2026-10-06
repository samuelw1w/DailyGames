// Small UI pieces every game uses: the help dialog, the copy button, the countdown to the
// next puzzle and the "you beat X%" line.
import { getStats } from "./api.js";
import { msUntilMidnight, formatCountdown } from "./daily.js";
import { gameStore } from "./storage.js";
import { GAMES } from "./registry.js";
import { seriesState, pointsFor, wallet, FINALE } from "./series.js";
import { LOCKED, isPlus, isUnlocked, unlockGame, dayQuery, activeDay } from "./account.js";

// Page transitions (shared/blinds.js) close in the colour of the game being opened.
globalThis.dgBlinds?.setGameColors(Object.fromEntries(GAMES.map((g) => [g.id, g.accent])));

export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** Open a dialog. `body` is trusted HTML. Closes on the button, Escape or a click outside. */
export function modal({ title, body, button = "Got it", onClose }) {
  const o = document.createElement("div");
  o.className = "dg-overlay";
  o.innerHTML = `<div class="dg-card dg-modal" role="dialog" aria-modal="true" aria-labelledby="dgModalTitle">
    <h3 id="dgModalTitle">${esc(title)}</h3>${body}
    <button class="dg-btn" type="button">${esc(button)}</button>
  </div>`;
  document.body.appendChild(o);
  const close = () => { o.remove(); document.removeEventListener("keydown", onKey); onClose?.(); };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  o.addEventListener("click", (e) => { if (e.target === o) close(); });
  o.querySelector(".dg-btn").addEventListener("click", close);
  document.addEventListener("keydown", onKey);
  o.querySelector(".dg-btn").focus();
}

/**
 * The address put at the end of every shared result, so friends know where to play.
 * This is a placeholder name: change it to the real site once there is one.
 */
export const SITE = "tenaday.games";

/**
 * Open the share sheet: a preview of exactly what will be sent, and a few ways to send it.
 * `text` is the result; the site's address is added as the last line.
 */
export function shareSheet(text) {
  const full = `${text}\n${SITE}`;
  const enc = encodeURIComponent(full);
  const o = document.createElement("div");
  o.className = "dg-overlay";
  o.innerHTML = `<div class="dg-card dg-modal dg-share" role="dialog" aria-modal="true" aria-labelledby="dgShareTitle">
    <h3 id="dgShareTitle">Share</h3>
    <pre class="dg-preview">${esc(full)}</pre>
    <div class="dg-ways">
      <button class="dg-btn" type="button" data-way="copy">Copy</button>
      <a class="dg-btn plain" href="sms:?&body=${enc}">Messages</a>
      <a class="dg-btn plain" href="https://wa.me/?text=${enc}" target="_blank" rel="noopener">WhatsApp</a>
      <a class="dg-btn plain" href="https://x.com/intent/post?text=${enc}" target="_blank" rel="noopener">X</a>
      ${navigator.share ? `<button class="dg-btn plain" type="button" data-way="more">More…</button>` : ""}
    </div>
    <button class="dg-link" type="button" data-way="close">Close</button>
  </div>`;
  document.body.appendChild(o);
  const close = () => { o.remove(); document.removeEventListener("keydown", onKey); };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  o.addEventListener("click", (e) => { if (e.target === o) close(); });
  o.querySelector('[data-way="close"]').addEventListener("click", close);
  const copyBtn = o.querySelector('[data-way="copy"]');
  copyBtn.addEventListener("click", () => {
    const done = () => { copyBtn.textContent = "Copied"; setTimeout(() => (copyBtn.textContent = "Copy"), 1600); };
    try { navigator.clipboard.writeText(full).then(done, () => prompt("Copy your result:", full)); } catch { prompt("Copy your result:", full); }
  });
  // Closing the system share sheet without picking anything is not a failure.
  o.querySelector('[data-way="more"]')?.addEventListener("click", () => navigator.share({ text: full }).catch(() => {}));
  copyBtn.focus();
}

/** Make a button open the share sheet for `text`. */
export function wireShare(btn, text) {
  btn.addEventListener("click", () => shareSheet(typeof text === "function" ? text() : text));
}

let countdownTimer = null;
/** Keep `el` showing the time left until the next puzzle. Only one countdown runs at a time. */
export function startCountdown(el) {
  if (countdownTimer) clearInterval(countdownTimer);
  if (!el) return;
  const update = () => (el.textContent = formatCountdown(msUntilMidnight()));
  update();
  countdownTimer = setInterval(update, 1000);
}

/** "You beat 64% of 120 players". Uses the submit response, or asks the API on a return visit. */
export async function showRank(el, sent, game, day, total) {
  const res = (await sent) ?? (await getStats(game, day, total));
  const rank = res?.rank;
  if (!rank || !el?.isConnected || rank.players < 2) return;
  el.innerHTML = `You beat <b>${rank.betterThan}%</b> of ${rank.players.toLocaleString("en-US")} players today.`;
  el.hidden = false;
}

/* ---------------- The Series ---------------- */

/** Path from a game page (web/games/<id>/) to another game or to the hub. */
const gameHref = (id) => `../${id}/`;
const nameOf = (id) => GAMES.find((g) => g.id === id)?.name ?? id;

/**
 * The button that carries a player on through the day: the next unplayed game, or back to
 * the hub once the day's lineup is done (or still has to be chosen). Goes first on every daily result screen.
 */
export function seriesButton(day) {
  const s = seriesState(day);
  if (s.next) return `<a class="dg-btn" href="${gameHref(s.next)}${dayQuery(day)}">Next: ${esc(nameOf(s.next))}</a>`;
  return `<a class="dg-btn" href="../../${dayQuery(day)}">${s.complete && !s.final ? "Finish the day" : "Back to the hub"}</a>`;
}

/** "+82 points" for a game's daily result, or a note that the game isn't in the day's lineup. */
export const pointsLine = (gameId, result) => (seriesState(activeDay()).open.includes(gameId)
  ? `<p class="dg-points">+${pointsFor(gameId, result)} <span>of 100 points</span></p>`
  : `<p>Played for fun: it isn't one of the games in this day's series.</p>`);

/**
 * The standard result screen, used by the simpler games. Draws the verdict, the points, an
 * optional `body` (trusted HTML), stats and the buttons, and wires them up.
 *   { gameId, day, daily, big, unit, title, body, result, share, sent, best, practiceLabel, onPractice, onBack, onDaily }
 * `result` is the saved result (for points); `best` is the text for the "best" tile.
 */
export function resultScreen(view, o) {
  const st = gameStore(o.gameId).stats();
  const hasToday = !!gameStore(o.gameId).getDay(o.day);
  view.innerHTML = `
  <section class="dg-summary dg-enter">
    <div class="dg-verdict">
      <span class="big">${o.big}</span><span>${o.unit}</span>
      <h2>${esc(o.title)}</h2>
      ${o.daily ? pointsLine(o.gameId, o.result) : "<p>Practice games don't count toward your day.</p>"}
    </div>
    ${o.body ?? ""}
    <p class="dg-rank" id="rank" hidden></p>
    ${o.daily ? `<div class="dg-stats">
      <div class="dg-stat"><b>${st.streak}</b><span>Day streak</span></div>
      <div class="dg-stat"><b>${st.played}</b><span>Played</span></div>
      <div class="dg-stat"><b>${esc(o.best ?? st.best)}</b><span>Best</span></div>
      <div class="dg-stat"><b id="cd">--:--:--</b><span>Next puzzle</span></div></div>` : ""}
    <div class="dg-actions">
      ${o.daily ? seriesButton(o.day) : ""}
      <button class="dg-btn plain" id="copyBtn" type="button">Share</button>
      <button class="dg-btn plain" id="practiceBtn" type="button">${esc(o.practiceLabel ?? "Play a practice game")}</button>
      ${!o.daily ? (hasToday ? `<button class="dg-btn plain" id="backBtn" type="button">Back to today's result</button>` : `<button class="dg-btn plain" id="dailyBtn" type="button">Play today's game</button>`) : ""}
    </div>
  </section>`;
  wireShare(view.querySelector("#copyBtn"), o.share);
  view.querySelector("#practiceBtn").addEventListener("click", () => { o.onPractice(); window.scrollTo({ top: 0 }); });
  view.querySelector("#backBtn")?.addEventListener("click", o.onBack);
  view.querySelector("#dailyBtn")?.addEventListener("click", o.onDaily);
  startCountdown(view.querySelector("#cd"));
  if (o.daily) showRank(view.querySelector("#rank"), o.sent ?? null, o.gameId, o.day, o.result.total);
}

/* ---------------- Locked games, Plus and ads ---------------- */

// On an earlier day (Plus only), the "Hub" link at the top of a game goes back to that day.
if (dayQuery()) document.querySelector(".dg-head a")?.setAttribute("href", `../../${dayQuery()}`);

/**
 * If the player hasn't unlocked this game, fill `view` with how to open it (spend points,
 * or get Plus) and return true. Returns false when the game can be played.
 */
export function lockScreen(gameId, view) {
  if (isUnlocked(gameId)) return false;
  const cost = LOCKED[gameId], { balance } = wallet(), short = cost - balance;
  document.querySelector("#sub")?.replaceChildren("Locked");
  view.innerHTML = `
  <section class="dg-summary dg-enter">
    <div class="dg-verdict">
      <span class="big lost">${cost.toLocaleString("en-US")}</span><span>points to unlock ${esc(nameOf(gameId))}</span>
      <p>${short > 0 ? `You have ${balance.toLocaleString("en-US")} to spend: ${short.toLocaleString("en-US")} to go.` : `You have ${balance.toLocaleString("en-US")} to spend.`}</p>
    </div>
    <div class="dg-actions">
      <button class="dg-btn" type="button" id="unlockBtn" ${short > 0 ? "disabled" : ""}>Unlock for ${cost.toLocaleString("en-US")} points</button>
      <a class="dg-btn plain" href="../../plus/">Or unlock everything with Plus</a>
      <a class="dg-btn plain" href="../../">Back to the hub</a>
    </div>
    <p class="dg-rank">Unlocking is for good. It doesn't change the all-time total your friends see.</p>
  </section>`;
  view.querySelector("#unlockBtn").addEventListener("click", () => { unlockGame(gameId); location.reload(); });
  return true;
}

/** A place where an ad would go, as HTML. Empty for Plus members. `up` is the path to the site root. */
export const adSlot = (up = "../../") => (isPlus() ? "" : `<aside class="dg-ad" aria-label="Advertisement"><span>Ad</span><p>An ad would go here.</p><a href="${up}plus/">Remove ads with Plus</a></aside>`);

export { FINALE };
