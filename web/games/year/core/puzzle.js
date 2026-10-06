// Year game rules: which thing is asked about each day and how guesses score. It asks about
// the same catalog of inventions and landmarks Middleman uses, so there is one set of facts
// to keep right. Pure functions only, so the browser and the API always agree.
import { SCALES, dailyRounds } from "../../middleman/core/puzzle.js";
import { hash, mulberry32 } from "../../../shared/random.js";

export const GAME_ID = "year";
export const GUESSES = 3;

// Only things with a firm year in the last thousand years: nobody should lose points over
// when exactly the wheel was invented.
const POOL = SCALES.year.items.filter((it) => it.v >= 1000 && Number.isInteger(it.v));

/** Pick a thing from the pool, skipping `avoid` (items that would give away another game's answer). */
function pick(rng, avoid = []) {
  const pool = POOL.filter((it) => !avoid.includes(it));
  return pool[Math.floor(rng() * pool.length)];
}

/** The day's thing: { id, name, emoji, v } where v is the year. Never one of today's Middleman ends. */
export function dailyThing(day) {
  const ends = dailyRounds(day).filter((r) => r.scale === "year").flatMap((r) => [r.a, r.b]);
  return pick(mulberry32(hash(GAME_ID + ":" + day)), ends);
}
export const practiceThing = () => pick(Math.random);

/** Is this something a player could have typed as a year? */
export const validGuess = (g) => Number.isInteger(g) && g >= 1 && g <= 2100;

/**
 * Points, 0 to 100. The exact year scores 100, 85 or 70 on the first, second or third guess.
 * Otherwise the best near miss counts: up to 60, falling to nothing at 40 years out, and
 * worth a little less on later guesses.
 */
export function score(answer, guesses) {
  let best = 0;
  guesses.slice(0, GUESSES).forEach((g, n) => {
    const off = Math.abs(g - answer);
    const points = off === 0 ? [100, 85, 70][n] : 60 * Math.max(0, 1 - off / 40) * [1, 0.9, 0.8][n];
    if (points > best) best = points;
  });
  return Math.round(best);
}

/** What to tell the player about one guess: which way to go and how far off it was. */
export function feedback(answer, g) {
  const off = Math.abs(g - answer);
  return { dir: g === answer ? "exact" : g < answer ? "Later" : "Earlier", text: off === 0 ? "Exactly right" : `${off} ${off === 1 ? "year" : "years"} off` };
}

/** The text players copy to share: how far off each guess was. `title` is e.g. "Year #12". */
export const shareText = (title, answer, guesses, points) => `${title} · ${points}/100\n📅 ${guesses.map((g) => (g === answer ? "✓" : `${g < answer ? "↑" : "↓"}${Math.abs(g - answer)}`)).join(" · ")}`;
