// Close game rules: one estimate a day (how heavy, how fast, how big, how much) and how
// guesses score. The things and their values come from Middleman's catalog, so there is one
// set of facts to keep right. Pure functions only, so the browser and the API always agree.
import { SCALES, dailyRounds } from "../../middleman/core/puzzle.js";
import { hash, mulberry32 } from "../../../shared/random.js";

export const GAME_ID = "close";
export const GUESSES = 3;
/** A guess within this many percent counts as spot on. */
export const SPOT_ON = 4;

/** The measures asked about, and the question each one asks. */
export const MEASURES = {
  weight: "How much does it weigh?",
  speed: "What is its top speed?",
  size: "How long or tall is it?",
  price: "What does it typically cost?",
};
const KEYS = Object.keys(MEASURES);

/**
 * The unit to answer in, chosen so the number is a comfortable size:
 * { label, per } where `per` converts the catalog's value (kg, mph, m, USD) into that unit.
 */
export function unitFor(scale, v) {
  if (scale === "weight") return v < 0.001 ? { label: "mg", per: 1e6 } : v < 1 ? { label: "g", per: 1000 } : v < 1000 ? { label: "kg", per: 1 } : { label: "tonnes", per: 0.001 };
  if (scale === "size") return v < 0.01 ? { label: "mm", per: 1000 } : v < 1 ? { label: "cm", per: 100 } : v < 1000 ? { label: "m", per: 1 } : { label: "km", per: 0.001 };
  return scale === "speed" ? { label: "mph", per: 1 } : { label: "US dollars", per: 1 };
}

function pick(rng, avoid = []) {
  const scale = KEYS[Math.floor(rng() * KEYS.length)];
  // Nothing too extreme to type: skip the very smallest and the astronomically large.
  const pool = SCALES[scale].items.filter((it) => !avoid.includes(it) && it.v * unitFor(scale, it.v).per < 1e7);
  const item = pool[Math.floor(rng() * pool.length)];
  const unit = unitFor(scale, item.v);
  return { scale, item, unit, answer: item.v * unit.per };
}

/** The day's question: { scale, item, unit, answer }. Never one of today's Middleman ends. */
export function dailyQuestion(day) {
  const ends = dailyRounds(day).flatMap((r) => [r.a, r.b]);
  return pick(mulberry32(hash(GAME_ID + ":" + day)), ends);
}
export const practiceQuestion = () => pick(Math.random);

/** Is this something a player could have typed as an estimate? */
export const validGuess = (g) => typeof g === "number" && Number.isFinite(g) && g > 0 && g < 1e12;

/** How many times too big or too small a guess is: 1 is perfect, 2 is double or half. */
export const factorOff = (answer, g) => (g > answer ? g / answer : answer / g);

/**
 * Points, 0 to 100, from the best guess. Spot on scores 100; being out by a factor of 4
 * scores nothing; in between it falls away evenly on a ratio scale, so twice too big costs
 * the same as half too small. Later guesses are worth a little less.
 */
export function score(answer, guesses) {
  let best = 0;
  guesses.slice(0, GUESSES).forEach((g, n) => {
    const f = factorOff(answer, g);
    const closeness = f <= 1 + SPOT_ON / 100 ? 1 : Math.max(0, 1 - Math.log2(f) / 2);
    const points = 100 * closeness * [1, 0.85, 0.7][n];
    if (points > best) best = points;
  });
  return Math.round(best);
}

/** What to tell the player about one guess: which way to go and how far off it was. */
export function feedback(answer, g) {
  const f = factorOff(answer, g);
  if (f <= 1 + SPOT_ON / 100) return { dir: "exact", text: "Spot on" };
  const way = g < answer ? "low" : "high";
  return { dir: g < answer ? "Higher" : "Lower", text: f >= 2 ? `${f >= 10 ? Math.round(f) : f.toFixed(1)}× too ${way}` : `${Math.round((f - 1) * 100)}% too ${way}` };
}

/** The text players copy to share: how far off each guess was. `title` is e.g. "Close #12". */
export function shareText(title, answer, guesses, points) {
  const mark = (g) => { const fb = feedback(answer, g); return fb.dir === "exact" ? "✓" : `${g < answer ? "↑" : "↓"}${fb.text.split(" ")[0]}`; };
  return `${title} · ${points}/100\n📏 ${guesses.map(mark).join(" · ")}`;
}
