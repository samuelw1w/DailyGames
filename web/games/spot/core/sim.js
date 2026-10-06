// Spot's rules: where the reticle and the keeper are on every tick, and what a shot taken on
// a given tick does. No DOM, storage or network code: the browser plays with this file and
// the API replays the same taps with it.
//
// Everything is a function of the tick number using only + - * /, so the same tap timing
// gives the same result on every device.
import { hash, mulberry32 } from "../../../shared/random.js";

export const GAME_ID = "spot";
export const WORLD = { w: 800, h: 600 };
export const GOAL = { left: 170, right: 630, top: 150, ground: 320 };
export const SPOT = [400, 545]; // where the ball sits
export const TICKS_PER_SEC = 60;
export const KICKS = 5;
/** Ticks to take each kick. When they run out the ball is struck wherever the reticle is. */
export const CLOCK = 8 * TICKS_PER_SEC;
/** Shown next to any result earned with slow motion on. */
export const ASSIST_MARK = "🐢";

// The reticle strays a little outside the frame, so going for the corners risks a miss.
const SWEEP = { left: 55, right: 745, top: 85, bottom: 308 };
const STATIONS = [225, 312, 400, 488, 575]; // spots on the line the keeper moves between
const REACH = { x: 150, y: 125 };           // how far the keeper's dive covers, sideways and up
const LEAN = 40;                            // a moving keeper covers this much more the way he's going
const MAX_ROUTINE = 5 * TICKS_PER_SEC;
const FAIR_CHANCE = 7; // ticks
const WIND = 16;                            // sideways push on the ball for each point of wind
const CHEST = 80;                           // height of the keeper's middle above the ground

/* ---------------- The day ---------------- */

/**
 * A day's shootout: the keeper's routine, the wind, and the reticle's path for each kick.
 * The keeper repeats the same routine on every kick (stand, shuffle to the next spot, stand...),
 * which is what makes him readable. The reticle gets faster with each kick.
 */
export function makeDay(rng) {
  const pick = (n) => Math.floor(rng() * n);
  // Keeper: 3 or 4 stops, never the same spot twice in a row (the last leads back to the first).
  // Routines longer than 5 seconds are thrown away, so there is always time to watch one through.
  let legs, period;
  do {
    const count = 3 + pick(2);
    const stops = [];
    while (stops.length < count) {
      const s = pick(STATIONS.length);
      const last = stops.length === count - 1;
      if (s === stops[stops.length - 1] || (last && s === stops[0])) continue;
      stops.push(s);
    }
    legs = [];
    period = 0;
    stops.forEach((s, i) => {
      const from = STATIONS[s], to = STATIONS[stops[(i + 1) % count]];
      const hold = 24 + 6 * pick(6);                                // stands for 0.4 to 0.9 s
      const move = Math.ceil(Math.abs(to - from) / (4 + pick(3)));  // then shuffles across
      legs.push({ start: period, from, to, hold, move });
      period += hold + move;
    });
  } while (period > MAX_ROUTINE);

  // Wind blows across the goal all day (negative = to the left) and carries every shot with it.
  const wind = pick(7) - 3;
  // Reticle paths. A path is only kept if it offers a scoring chance at least a tenth of a
  // second long, so no kick is impossible.
  const game = { keeper: { legs, period }, wind, kicks: [] };
  for (let k = 0; k < KICKS; k++) {
    do {
      const xPeriod = 2 * (58 - 5 * k + pick(4)); // there and back: about 2 s on kick 1, 1.3 s on kick 5
      const yPeriod = 2 * (19 + pick(9));
      game.kicks[k] = { xPeriod, yPeriod, xStart: pick(xPeriod), yStart: pick(yPeriod) };
    } while (longestChance(game, k) < FAIR_CHANCE);
  }
  return game;
}

/** The longest run of ticks on kick `k` where a shot would score. */
export function longestChance(game, k) {
  let best = 0, run = 0;
  for (let t = 1; t <= CLOCK; t++) {
    run = shoot(game, k, t).outcome === "goal" ? run + 1 : 0;
    if (run > best) best = run;
  }
  return best;
}

/** The shootout for a date. Same for everyone. */
export const dailyGame = (day) => makeDay(mulberry32(hash(GAME_ID + ":" + day)));

/* ---------------- Motion ---------------- */

// A back-and-forth sweep: 0 at the start, 1 at the turn, 0 again after `period` ticks.
const sweep = (i, period) => (i <= period / 2 ? i : period - i) / (period / 2);

/** Where the reticle is on tick `t` of kick `k`: [x, y]. */
export function reticleAt(game, k, t) {
  const { xPeriod, yPeriod, xStart, yStart } = game.kicks[k];
  return [
    SWEEP.left + (SWEEP.right - SWEEP.left) * sweep((xStart + t) % xPeriod, xPeriod),
    SWEEP.top + (SWEEP.bottom - SWEEP.top) * sweep((yStart + t) % yPeriod, yPeriod),
  ];
}

/** The keeper on tick `t` of any kick: { x, v } where v is -1, 0 or 1 (moving left, still, right). */
export function keeperAt(game, t) {
  const { legs, period } = game.keeper;
  const at = t % period;
  let leg = legs[0];
  for (const l of legs) if (l.start <= at) leg = l;
  const moved = at - leg.start - leg.hold;
  if (moved <= 0) return { x: leg.from, v: 0 };
  return { x: leg.from + ((leg.to - leg.from) * moved) / leg.move, v: leg.to > leg.from ? 1 : -1 };
}

/* ---------------- A kick ---------------- */

/**
 * Take kick `k` on tick `t` (1 to CLOCK). Returns { outcome, aim, target, keeper, cover }:
 * `outcome` is "goal", "saved", "wide" or "over"; `aim` is where the reticle was and `target`
 * where the wind carries the ball to; `keeper` where he was; `cover` the middle of what his
 * dive reaches.
 */
export function shoot(game, k, t) {
  const aim = reticleAt(game, k, t);
  const target = [aim[0] + game.wind * WIND, aim[1]];
  const keeper = keeperAt(game, t);
  const cover = [keeper.x + keeper.v * LEAN, GOAL.ground - CHEST];
  const dx = (target[0] - cover[0]) / REACH.x, dy = (target[1] - cover[1]) / REACH.y;
  const stretch = dx * dx + dy * dy; // 1 is the edge of his reach
  let outcome = "goal";
  if (target[0] < GOAL.left || target[0] > GOAL.right) outcome = "wide";
  else if (target[1] < GOAL.top) outcome = "over";
  else if (stretch <= 1) outcome = "saved";
  return { outcome, aim, target, keeper, cover, stretch };
}

/**
 * Replay a whole shootout from the tick of each kick. Returns the five outcomes, or null if
 * `ticks` isn't five whole numbers from 1 to CLOCK.
 */
export function playGame(game, ticks) {
  if (!Array.isArray(ticks) || ticks.length !== KICKS) return null;
  if (!ticks.every((t) => Number.isInteger(t) && t >= 1 && t <= CLOCK)) return null;
  return ticks.map((t, k) => shoot(game, k, t).outcome);
}

export const scoreOf = (outcomes) => outcomes.filter((o) => o === "goal").length;

const BLOCKS = { goal: "🟩", saved: "🟥", wide: "⬛", over: "⬛" };

/** The text players copy to share: one block per kick. `title` is e.g. "Spot #12". */
export function shareText(title, outcomes, assist) {
  return `${title} · ${scoreOf(outcomes)}/${KICKS}${assist ? ` ${ASSIST_MARK}` : ""}\n⚽ ${outcomes.map((o) => BLOCKS[o]).join("")}`;
}
