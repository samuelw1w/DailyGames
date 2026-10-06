// Pegs game rules around the physics in sim.js: which field belongs to which day, scoring
// and share text. Pure functions only, so the browser and the API always agree.
import { SEEDS } from "./levels.js";
import { BALLS, TARGETS, makeField } from "./sim.js";

export const GAME_ID = "pegs";
/** Every accent peg, plus two points for each ball left over. */
export const MAX_SCORE = TARGETS + 2 * (BALLS - 1);
/** Shown next to any result earned with slow motion on. */
export const ASSIST_MARK = "🐢";

// Fields come from a checked list instead of straight from the date, because a random field
// can't always be cleared. Day 1 uses the first seed, day 2 the second, and so on.
const FIRST_DAY = "2026-10-05";
const dayIndex = (day) => {
  const [y, m, d] = day.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 864e5);
};

/** The field for a date. Same for everyone. */
export function dailyField(day) {
  const n = SEEDS.length;
  return makeField(SEEDS[(((dayIndex(day) - dayIndex(FIRST_DAY)) % n) + n) % n]);
}

/** A random field that isn't the one for `day`. */
export function practiceField(day, rnd = Math.random) {
  const today = dailyField(day).seed;
  const others = SEEDS.filter((s) => s !== today);
  return makeField(others[Math.floor(rnd() * others.length)]);
}

/** A finished game in numbers: accent pegs cleared, balls used, and the score (higher is better). */
export function resultOf(game) {
  const cleared = game.perBall.reduce((a, b) => a + b, 0), used = game.perBall.length;
  return { cleared, used, total: cleared + (cleared === TARGETS ? 2 * (BALLS - used) : 0) };
}

/** Short result text, e.g. "10/10 in 3" or "7/10". Also what the hub shows on the game's card. */
export function resultLabel({ cleared, used, assist }) {
  const text = cleared === TARGETS ? `${cleared}/${TARGETS} in ${used}` : `${cleared}/${TARGETS}`;
  return assist ? `${text} ${ASSIST_MARK}` : text;
}

/** The text players copy to share: pegs cleared, balls used, and the pegs each ball took. */
export function shareText(title, { cleared, used, perBall, assist }) {
  const head = `${title} · ${cleared}/${TARGETS} pegs · ${used} ${used === 1 ? "ball" : "balls"}${assist ? ` ${ASSIST_MARK}` : ""}`;
  return `${head}\n🟡 ${perBall.join(" · ")}`;
}
