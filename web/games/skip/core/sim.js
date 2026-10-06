// Skip's rules: when a thrown stone touches the water, how forgiving each touch is, and how
// many skips a set of taps earns. No DOM, storage or network code: the browser plays with
// this file and the API recounts the same taps with it.
//
// Time moves in fixed ticks and the maths only uses + - * / and Math.round, so the same tap
// timing gives the same count on every device.
import { hash, mulberry32 } from "../../../shared/random.js";

export const GAME_ID = "skip";
export const TICKS_PER_SEC = 60;
export const STONES = 3;
/** A stone that skips this many times sails out of sight. Also the top score. */
export const MAX_SKIPS = 30;
/** Ticks from the throw to the first touch. */
export const FIRST_TOUCH = 48;
/** Shown next to any result earned with slow motion on. */
export const ASSIST_MARK = "🐢";

const WINDOW = 7;        // the first touch forgives a tap up to this many ticks early or late
const SHRINK = 0.92;     // each later touch forgives this fraction of the one before
const WINDOW_MIN = 1.5;
const HOP_MIN = 12;      // hops never get shorter than this many ticks

/**
 * A day's water: `seed` drives the bounces, `hop` is the typical length of the first hop in
 * ticks, `keep` the fraction of that length each hop passes on to the next, and `side` which
 * way the stone drifts on screen (-1 left, 1 right).
 */
export function makeWater(rng) {
  const pick = (n) => Math.floor(rng() * n);
  return { seed: pick(2 ** 31), hop: 46 + 2 * pick(7), keep: 0.95 + 0.005 * pick(4), side: pick(2) ? 1 : -1 };
}

/** The water for a date. Same for everyone. */
export const dailyWater = (day) => makeWater(mulberry32(hash(GAME_ID + ":" + day)));

/**
 * How stone number `stone` (0-based) bounces: `ticks` is the tick of every touch, first to
 * last (MAX_SKIPS + 1 of them), and `lifts[n]` how high the hop into touch n rises for its
 * length. Hops get shorter overall, but each one is anywhere from much shorter to much longer
 * than the trend, and no two stones bounce alike, so there is no rhythm to memorise: every
 * touch has to be watched.
 */
export function touches(water, stone) {
  const rng = mulberry32((water.seed + 7919 * (stone + 1)) >>> 0);
  const ticks = [FIRST_TOUCH], lifts = [1];
  let length = water.hop;
  for (let n = 0; n < MAX_SKIPS; n++) {
    ticks.push(ticks[n] + Math.max(HOP_MIN, Math.round(length * (0.55 + 0.9 * rng()))));
    lifts.push(0.5 + 1.5 * rng());
    length *= water.keep;
  }
  return { ticks, lifts };
}

/** How many ticks early or late a tap may be on touch `n` (0-based). Shrinks with every skip. */
export function windowAt(n) {
  let w = WINDOW;
  for (let i = 0; i < n; i++) w *= SHRINK;
  return w > WINDOW_MIN ? w : WINDOW_MIN;
}

/** Does a tap on tick `t` catch touch `n`? */
export const catches = (ticks, n, t) => Math.abs(t - ticks[n]) <= windowAt(n);

/**
 * Skips earned by stone number `stone`, from the ticks of its taps (counted from the throw).
 * The first tap must catch the first touch, the second the second, and so on; the first tap
 * that catches nothing sinks the stone.
 */
export function countSkips(water, stone, taps) {
  const { ticks } = touches(water, stone);
  let n = 0;
  while (n < MAX_SKIPS && n < taps.length && catches(ticks, n, taps[n])) n++;
  return n;
}

/**
 * Recount a whole day from each stone's taps. Returns the skip count per stone, or null
 * if `throws` isn't one list of increasing whole-number ticks per stone.
 */
export function playGame(water, throws) {
  if (!Array.isArray(throws) || throws.length !== STONES) return null;
  const ok = throws.every((taps) => Array.isArray(taps) && taps.length <= MAX_SKIPS &&
    taps.every((t, i) => Number.isInteger(t) && t >= 1 && t <= 5000 && (i === 0 || t > taps[i - 1])));
  return ok ? throws.map((taps, stone) => countSkips(water, stone, taps)) : null;
}

export const bestOf = (counts) => Math.max(0, ...counts);

const skipsText = (n) => `${n} ${n === 1 ? "skip" : "skips"}`;

/** Short result text, e.g. "14 skips". Also what the hub shows on the game's card. */
export const resultLabel = (best, assist) => skipsText(best) + (assist ? ` ${ASSIST_MARK}` : "");

/** The text players copy to share: the best count, then every stone. `title` is e.g. "Skip #12". */
export const shareText = (title, counts, assist) => `${title} · ${resultLabel(bestOf(counts), assist)}\n🪨 ${counts.join(" · ")}`;
