// Date helpers. A "day key" is the player's LOCAL calendar date, e.g. "2026-10-05",
// so the puzzle flips at the player's own midnight.

const pad = (n) => String(n).padStart(2, "0");

export const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function parseDayKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Puzzle number counted from a game's launch day (launch day = #1). */
export function puzzleNumber(launchDay, day = dayKey()) {
  return Math.max(1, Math.round((parseDayKey(day) - parseDayKey(launchDay)) / 864e5) + 1);
}

export function msUntilMidnight(now = new Date()) {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return next - now;
}

export function formatCountdown(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}
