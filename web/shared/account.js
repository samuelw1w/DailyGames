// What this player has: Plus (the subscription), the games they have unlocked with points,
// and which day they are playing. Everything is kept in this browser.
//
// THERE ARE NO REAL ACCOUNTS OR PAYMENTS YET. "Plus" is a switch saved in the browser so the
// rest of the site can be built and tried: turning it on costs nothing and proves nothing.
// When accounts exist, isPlus() and the unlocked list should come from the server instead.
import { dayKey } from "./daily.js";

const KEY = "dg.v1.account";
/** The first day there was a series. There is nothing earlier to go back to. */
export const FIRST_DAY = "2026-10-05";

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) ?? {}; } catch { return {}; }
}
function save(account) {
  try { localStorage.setItem(KEY, JSON.stringify(account)); } catch { /* storage unavailable */ }
}

/**
 * Games that start locked, and what each costs in points to open for good. Everything else
 * is free. Each act keeps three free games and two to earn.
 */
export const LOCKED = { skip: 20000, hole: 20000, close: 20000, link: 20000 };

/** Does this player have Plus? Plus opens every game, removes ads and lets earlier days be played. */
export const isPlus = () => !!load().plus;
export function setPlus(on) {
  save({ ...load(), plus: !!on });
}

/** Can this player play a game: it's free, they bought it with points, or they have Plus. */
export const isUnlocked = (gameId) => !(gameId in LOCKED) || isPlus() || !!load().unlocked?.includes(gameId);

/** Points spent on unlocking games so far. */
export const spentPoints = () => (load().unlocked ?? []).reduce((sum, id) => sum + (LOCKED[id] ?? 0), 0);

/** Open a game for good with points. The caller checks the player can afford it. */
export function unlockGame(gameId) {
  const account = load();
  if (!(gameId in LOCKED) || account.unlocked?.includes(gameId)) return;
  save({ ...account, unlocked: [...(account.unlocked ?? []), gameId] });
}

/**
 * The day being played. Normally today. With Plus, a link can carry ?day=2026-10-01 to play
 * an earlier day's games; anything else (no Plus, a bad date, a day that hasn't happened or
 * one before the site started) is ignored.
 */
export function activeDay() {
  const today = dayKey();
  const asked = new URLSearchParams(globalThis.location?.search ?? "").get("day");
  return isPlus() && asked && /^\d{4}-\d{2}-\d{2}$/.test(asked) && asked < today && asked >= FIRST_DAY ? asked : today;
}

/** What to add to a link so it stays on the day being played: "" for today, "?day=..." for an earlier one. */
export const dayQuery = (day = activeDay()) => (day === dayKey() ? "" : `?day=${day}`);
