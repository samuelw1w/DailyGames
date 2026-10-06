// Stop's rules: where the needle and the mark are on every tick of each round, and how close
// a tap came. No DOM, storage or network code: the browser plays with this file and the API
// rescores the same taps with it. Angles are whole degrees and time is whole ticks, so the
// same tap gives the same result everywhere.
import { hash, mulberry32 } from "../../../shared/random.js";

export const GAME_ID = "stop";
export const TICKS_PER_SEC = 60;
export const ROUNDS = 5;
/** Ticks each round runs before the needle is stopped for you, wherever it is. */
export const CLOCK = 8 * TICKS_PER_SEC;
/** Shown next to any result earned with slow motion on. */
export const ASSIST_MARK = "🐢";

const SPEEDS = [3, 4, 5, 6, 8]; // degrees per tick: half a turn a second, up to more than one
const MISS = 40;                // an error this big (in degrees) scores nothing
const ROUND_POINTS = 20;

/**
 * A day's dial: for each round, where the mark is, where the needle starts, how fast and which
 * way it turns. The needle moves in whole steps, so the mark is always put on a spot the
 * needle really lands on: a perfect stop is possible every round.
 */
export function makeDial(rng) {
  const pick = (n) => Math.floor(rng() * n);
  return SPEEDS.map((speed) => {
    const round = { target: 0, start: pick(360), speed, dir: pick(2) ? 1 : -1 };
    round.target = needleAt(round, 40 + pick(120));
    return round;
  });
}

/** The dial for a date. Same for everyone. */
export const dailyDial = (day) => makeDial(mulberry32(hash(GAME_ID + ":" + day)));

/** The needle's angle (0 to 359, clockwise from the top) on tick `t` of a round. */
export const needleAt = (round, t) => (((round.start + round.dir * round.speed * t) % 360) + 360) % 360;

/** How many degrees off the mark a tap on tick `t` is: 0 to 180. */
export function errorAt(round, t) {
  const d = Math.abs(needleAt(round, t) - round.target);
  return d > 180 ? 360 - d : d;
}

/** Points for one round, 0 to 20: full marks on the mark, falling away faster the further off. */
export function roundPoints(error) {
  if (error >= MISS) return 0;
  const closeness = 1 - error / MISS;
  return Math.round(ROUND_POINTS * closeness * closeness);
}

/**
 * Score a whole day from the tick of each round's tap. Returns { errors, points, total }
 * (total is 0 to 100), or null if `ticks` isn't five whole numbers from 1 to CLOCK.
 */
export function playGame(dial, ticks) {
  if (!Array.isArray(ticks) || ticks.length !== ROUNDS) return null;
  if (!ticks.every((t) => Number.isInteger(t) && t >= 1 && t <= CLOCK)) return null;
  const errors = ticks.map((t, n) => errorAt(dial[n], t));
  const points = errors.map(roundPoints);
  return { errors, points, total: points.reduce((a, b) => a + b, 0) };
}

/** The text players copy to share: the error in degrees for each round. `title` is e.g. "Stop #12". */
export const shareText = (title, { errors, total }, assist) => `${title} · ${total}/100${assist ? ` ${ASSIST_MARK}` : ""}\n🎯 ${errors.map((e) => `${e}°`).join(" · ")}`;
