// Small UI pieces every game uses: the help dialog, the copy button, the countdown to the
// next puzzle and the "you beat X%" line.
import { getStats } from "./api.js";
import { msUntilMidnight, formatCountdown } from "./daily.js";
import { gameStore, clientId } from "./storage.js";
import { GAMES } from "./registry.js";
import { seriesState, pointsFor, wallet, FINALE } from "./series.js";
import { LOCKED, isPlus, isUnlocked, unlockGame, dayQuery, activeDay } from "./account.js";
import { ScoreRing } from "./score-ring.js";

// Page transitions (shared/blinds.js) close in the colour of the game being opened.
globalThis.dgBlinds?.setGameColors(Object.fromEntries(GAMES.map((g) => [g.id, g.accent])));

export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/**
 * Open a dialog. `body` is trusted HTML. Closes on the button, Escape or a click outside.
 * A body that is a numbered list (every game's how-to) is shown as one card per step, to
 * swipe or step through; the button reads Next until the last card.
 */
export function modal({ title, body, button = "Got it", onClose }) {
  const o = document.createElement("div");
  o.className = "dg-overlay";
  o.innerHTML = `<div class="dg-card dg-modal" role="dialog" aria-modal="true" aria-labelledby="dgModalTitle">
    <h3 id="dgModalTitle">${esc(title)}</h3>${body}
    <button class="dg-btn" type="button">${esc(button)}</button>
  </div>`;
  document.body.appendChild(o);
  const btn = o.querySelector(".dg-modal > .dg-btn");
  const close = () => { o.remove(); document.removeEventListener("keydown", onKey); onClose?.(); };
  let next = () => false; // moves to the next step card; false once there is none
  const onKey = (e) => { if (e.key === "Escape") close(); };
  o.addEventListener("click", (e) => { if (e.target === o) close(); });
  btn.addEventListener("click", () => { if (!next()) close(); });
  document.addEventListener("keydown", onKey);

  const list = o.querySelector(".dg-modal > ol");
  if (list && list.children.length > 1) {
    const steps = [...list.children], track = document.createElement("div"), dots = document.createElement("div");
    track.className = "dg-steps";
    dots.className = "dg-stepdots";
    steps.forEach((li, i) => {
      // The bold lead of each step becomes the card's heading; the rest is its text.
      const lead = li.querySelector("b"), head = lead ? lead.textContent.trim().replace(/[.,:]$/, "") : "";
      lead?.remove();
      const text = li.innerHTML.trim();
      const card = document.createElement("article");
      card.className = "dg-step";
      card.innerHTML = `<span class="n">${i + 1}<i> / ${steps.length}</i></span><h4>${esc(head)}</h4><p>${text.charAt(0).toUpperCase() + text.slice(1)}</p>`;
      track.appendChild(card);
      dots.appendChild(document.createElement("i"));
    });
    list.replaceWith(track);
    track.after(dots);
    const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const at = () => Math.round(track.scrollLeft / (track.scrollWidth / steps.length));
    const go = (i) => track.scrollTo({ left: i * (track.scrollWidth / steps.length), behavior: calm ? "auto" : "smooth" });
    // `want` is the card being shown or slid to, so quick taps on Next never stall mid-slide.
    let want = 0, settle;
    const sync = (i) => {
      [...dots.children].forEach((d, n) => d.classList.toggle("on", n === i));
      btn.textContent = i < steps.length - 1 ? "Next" : button;
    };
    const show = (i) => { want = i; go(i); sync(i); };
    [...dots.children].forEach((d, n) => d.addEventListener("click", () => show(n)));
    track.addEventListener("scroll", () => {
      clearTimeout(settle);
      settle = setTimeout(() => { want = at(); sync(want); }, 140); // a swipe has come to rest
    }, { passive: true });
    next = () => { if (want >= steps.length - 1) return false; show(want + 1); return true; };
    sync(0);
  }
  btn.focus();
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
  const res = (await sent) ?? (await getStats(game, day, total, clientId()));
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

/**
 * The game's score out of 100 as a ring in its colour, which fills in once it is on the page.
 * For a daily result it also says whether those points count toward the day's series;
 * practice games leave that line to the game.
 */
export function pointsLine(gameId, result, daily = true) {
  const ring = `<div class="dg-ring" data-points="${pointsFor(gameId, result) ?? 0}"></div>`;
  if (!daily) return ring;
  return ring + (seriesState(activeDay()).open.includes(gameId)
    ? `<p class="dg-points">Points toward the day's series</p>`
    : `<p>Played for fun: it isn't one of the games in this day's series.</p>`);
}

// Rings fill in as soon as a result screen puts them on the page, a beat after it slides in.
new MutationObserver(() => {
  document.querySelectorAll(".dg-ring:not(.score-ring)").forEach((el) => {
    const ring = new ScoreRing(el);
    setTimeout(() => ring.play(+el.dataset.points), 250);
  });
}).observe(document.body, { childList: true, subtree: true });

/**
 * The standard result screen, used by the simpler games. Draws the verdict, the points, an
 * optional `body` (trusted HTML), stats and the buttons, and wires them up.
 *   { gameId, day, daily, big, unit, title, body, result, share, sent, best, practiceLabel, onPractice, onBack, onDaily }
 * `result` is the saved result (for points); `best` is the text for the "best" tile.
 */
export function resultScreen(view, o) {
  const st = gameStore(o.gameId).stats();
  const hasToday = !!gameStore(o.gameId).getDay(o.day);
  // A score out of 100 is what the ring shows, so it isn't repeated above the title.
  view.innerHTML = `
  <section class="dg-summary dg-enter">
    <div class="dg-verdict">
      ${o.unit === "of 100" ? "" : `<span class="big">${o.big}</span><span>${o.unit}</span>`}
      <h2>${esc(o.title)}</h2>
      ${pointsLine(o.gameId, o.result, o.daily)}
      ${o.daily ? "" : "<p>Practice games don't count toward your day.</p>"}
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
