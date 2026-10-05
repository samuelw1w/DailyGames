// Day keys are the player's local date ("YYYY-MM-DD"). Time zones run from UTC-12 to UTC+14,
// so on any given instant the valid "today" is within one day of the UTC date.

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const toKey = (d) => d.toISOString().slice(0, 10);

export function isDayKey(day) {
  if (typeof day !== "string" || !DAY_RE.test(day)) return false;
  return toKey(new Date(`${day}T00:00:00Z`)) === day; // rejects 2026-02-31 etc.
}

/** Could `day` be "today" somewhere on Earth right now? Plays are only accepted for these days. */
export function isPlayableToday(day, now = new Date()) {
  if (!isDayKey(day)) return false;
  const utc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const t = Date.parse(`${day}T00:00:00Z`);
  return Math.abs(t - utc) <= 864e5;
}

/** Stats are readable for any past day and for days that are "today" somewhere, never the future. */
export function isRevealed(day, now = new Date()) {
  if (!isDayKey(day)) return false;
  const utc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Date.parse(`${day}T00:00:00Z`) <= utc + 864e5;
}
