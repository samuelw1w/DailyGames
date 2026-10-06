// Small UI pieces every game uses: the help dialog, the copy button, the countdown to the
// next puzzle and the "you beat X%" line.
import { getStats } from "./api.js";
import { msUntilMidnight, formatCountdown } from "./daily.js";

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

/** Make a button copy `text`, with a "Copied" flash. */
export function wireCopy(btn, text) {
  const label = btn.textContent;
  btn.addEventListener("click", () => {
    const done = () => { btn.textContent = "Copied"; setTimeout(() => (btn.textContent = label), 1600); };
    const fallback = () => prompt("Copy your result:", text);
    try { navigator.clipboard.writeText(text).then(done, fallback); } catch { fallback(); }
  });
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
