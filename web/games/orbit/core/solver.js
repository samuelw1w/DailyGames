// Finds routes through an Orbit level by trying every launch moment. Used by
// tools/orbit-levels.js to pick fair levels and by the tests; the game itself never runs it.
import { MAX_JUMPS, ORBIT_TICKS, createRun, cloneRun, step } from "./sim.js";

/** A level is fair if it can be won with launch windows at least this many ticks wide (0.2 s). */
export const FAIR_WINDOW = 12;

/**
 * Every place the ship can land from its current orbit. Tries a launch on each tick of one
 * lap and groups neighbouring ticks that land on the same planet. A planet can be entered
 * turning either way (which half of the window you hit), so each group gives up to two
 * entries: { window, half, tick, run }. `window` is how many ticks in a row reach the planet,
 * `half` how many of those also give this turning direction, and `tick`/`run` are the tap
 * and resulting state from the middle of that half.
 */
export function launches(level, from) {
  const base = cloneRun(from);
  const trials = [];
  for (let o = 0; o < ORBIT_TICKS; o++) {
    const run = cloneRun(base);
    step(level, run, true);
    const tick = run.tick;
    while (run.at < 0 && !run.done) step(level, run, false);
    const missed = run.outcomes[run.outcomes.length - 1] === "miss";
    trials.push({ planet: missed ? -1 : run.at, tick, run });
    step(level, base, false);
  }
  const best = new Map();
  for (let i = 0; i < trials.length; ) {
    let j = i;
    while (j < trials.length && trials[j].planet === trials[i].planet) j++;
    for (let a = i; trials[i].planet >= 0 && a < j; ) {
      let b = a;
      while (b < j && trials[b].run.dir === trials[a].run.dir) b++;
      const key = `${trials[a].planet}:${trials[a].run.dir}`;
      const old = best.get(key);
      if (!old || old.window < j - i || (old.window === j - i && old.half < b - a)) {
        const mid = trials[(a + b - 1) >> 1];
        best.set(key, { window: j - i, half: b - a, tick: mid.tick, run: mid.run });
      }
      a = b;
    }
    i = j;
  }
  return [...best.values()];
}

/**
 * Shortest win using only launch windows of at least `minWindow` ticks (and, where the
 * turning direction matters, at least a third of that for the half being used).
 * Returns { taps, jumps } or null if the goal can't be reached within MAX_JUMPS.
 */
export function solve(level, { minWindow = 1 } = {}) {
  const seen = new Set([`${level.start}:${level.startDir}`]);
  let frontier = [{ run: createRun(level), taps: [] }];
  for (let jumps = 1; jumps <= MAX_JUMPS && frontier.length; jumps++) {
    const next = [];
    for (const node of frontier) {
      for (const edge of launches(level, node.run)) {
        if (edge.window < minWindow || edge.half * 3 < minWindow) continue;
        const taps = [...node.taps, edge.tick];
        if (edge.run.done === "win") return { taps, jumps };
        const key = `${edge.run.at}:${edge.run.dir}`;
        if (edge.run.done || seen.has(key)) continue;
        seen.add(key);
        next.push({ run: edge.run, taps });
      }
    }
    frontier = next;
  }
  return null;
}

/**
 * The bar a level must clear to be used as a daily puzzle: winnable in 3 or 4 jumps through
 * generous windows (so 5 jumps leaves room for a miss), and never in a single lucky shot.
 * Returns { par, best } or null.
 */
export function rate(level) {
  if (!level) return null;
  const fair = solve(level, { minWindow: FAIR_WINDOW });
  if (!fair || fair.jumps < 3 || fair.jumps > 4) return null;
  const any = solve(level, { minWindow: 3 });
  if (any.jumps < 2) return null;
  return { par: fair.jumps, best: any.jumps };
}
