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

const WINDOW = 9;        // the first touch forgives a tap up to this many ticks early or late
const SHRINK = 0.93;     // each later touch forgives this fraction of the one before
const WINDOW_MIN = 1.5;
const HOP_MIN = 14;      // hops never get shorter than this many ticks

// The day's rhythm: hop lengths cycle through one of these, on top of getting steadily shorter.
const RHYTHMS = [[1], [1.2, 0.8], [1, 1, 0.7], [1.25, 1, 0.75, 1], [0.8, 1.2, 1], [1, 0.7, 1.3]];

/**
 * A day's water: `hop` is the length of the first hop in ticks, `keep` the fraction of its
 * length each hop passes on to the next, `rhythm` the repeating long/short pattern, and
 * `side` which way the stone drifts on screen (-1 left, 1 right).
 */
export function makeWater(rng) {
  const pick = (n) => Math.floor(rng() * n);
  return { hop: 62 + 2 * pick(7), keep: 0.95 + 0.005 * pick(4), rhythm: RHYTHMS[pick(RHYTHMS.length)], side: pick(2) ? 1 : -1 };
}

/** The water for a date. Same for everyone. */
export const dailyWater = (day) => makeWater(mulberry32(hash(GAME_ID + ":" + day)));

/** The tick of every touch, first to last: MAX_SKIPS + 1 of them. */
export function touches(water) {
  const ticks = [FIRST_TOUCH];
  let length = water.hop;
  for (let n = 0; n < MAX_SKIPS; n++) {
    ticks.push(ticks[n] + Math.max(HOP_MIN, Math.round(length * water.rhythm[n % water.rhythm.length])));
    length *= water.keep;
  }
  return ticks;
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
 * Skips earned by one stone, from the ticks of its taps (counted from the throw). The first
 * tap must catch the first touch, the second the second, and so on; the first tap that
 * catches nothing sinks the stone.
 */
export function countSkips(water, taps) {
  const ticks = touches(water);
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
  const last = touches(water)[MAX_SKIPS] + WINDOW;
  const ok = throws.every((taps) => Array.isArray(taps) && taps.length <= MAX_SKIPS &&
    taps.every((t, i) => Number.isInteger(t) && t >= 1 && t <= last && (i === 0 || t > taps[i - 1])));
  return ok ? throws.map((taps) => countSkips(water, taps)) : null;
}

export const bestOf = (counts) => Math.max(0, ...counts);

const skipsText = (n) => `${n} ${n === 1 ? "skip" : "skips"}`;

/** Short result text, e.g. "14 skips". Also what the hub shows on the game's card. */
export const resultLabel = (best, assist) => skipsText(best) + (assist ? ` ${ASSIST_MARK}` : "");

/** The text players copy to share: the best count, then every stone. `title` is e.g. "Skip #12". */
export const shareText = (title, counts, assist) => `${title} · ${resultLabel(bestOf(counts), assist)}\n🪨 ${counts.join(" · ")}`;
