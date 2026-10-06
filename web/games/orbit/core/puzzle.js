// Orbit game rules around the physics in sim.js: which level belongs to which day, how a
// finished run is scored, and how it is written out for sharing. Pure functions only, so the
// browser and the API import this same file and always agree.
import { SEEDS } from "./levels.js";
import { MAX_JUMPS, makeLevel } from "./sim.js";

export const GAME_ID = "orbit";
export const MAX_SCORE = MAX_JUMPS;

// Levels come from a checked list instead of straight from the date, because a random star
// map is not always winnable. Day 1 uses the first seed, day 2 the second, and so on.
const FIRST_DAY = "2026-10-05";
const dayIndex = (day) => {
  const [y, m, d] = day.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 864e5);
};

/** The level for a date. Same for everyone. */
export function dailyLevel(day) {
  const n = SEEDS.length;
  return makeLevel(SEEDS[(((dayIndex(day) - dayIndex(FIRST_DAY)) % n) + n) % n]);
}

/** A random level that isn't the one for `day`. */
export function practiceLevel(day, rnd = Math.random) {
  const today = dailyLevel(day).seed;
  const others = SEEDS.filter((s) => s !== today);
  return makeLevel(others[Math.floor(rnd() * others.length)]);
}

/** Higher is better: 5 for a one-jump win down to 1 for using all five, 0 for not arriving. */
export const scoreRun = (run) => (run.done === "win" ? MAX_JUMPS + 1 - run.jumps : 0);

export const MARKS = { hop: "🪐", miss: "💨", goal: "🏁" };
/** Shown next to any result earned with slow motion on. */
export const ASSIST_MARK = "🐢";

/** Short result text, e.g. "3 jumps" or "Lost". Also what the hub shows on the game's card. */
export function resultLabel({ won, jumps, assist }) {
  const text = won ? `${jumps} ${jumps === 1 ? "jump" : "jumps"}` : "Lost";
  return assist ? `${text} ${ASSIST_MARK}` : text;
}

/** The text players copy to share. `title` is e.g. "Orbit #12". */
export function shareText(title, { won, jumps, outcomes, assist }) {
  const head = `${title} · ${won ? jumps : "X"}/${MAX_JUMPS} jumps${assist ? ` ${ASSIST_MARK}` : ""}`;
  return `${head}\n${outcomes.map((o) => MARKS[o]).join("")}`;
}
