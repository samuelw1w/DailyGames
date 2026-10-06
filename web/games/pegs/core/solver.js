// Finds a way to clear a Pegs field by trying every drop. Used by tools/pegs-levels.js to
// pick fair fields and by the tests; the game itself never runs it.
import { BALLS, createGame, dropBall, stepBall, applyBall } from "./sim.js";

/**
 * Play greedily: each ball is dropped on the launcher tick that clears the most accent pegs.
 * Returns the drops if that clears the field within `maxBalls`, else null.
 */
export function solve(field, maxBalls = BALLS) {
  const game = createGame(field);
  const drops = [];
  while (!game.done && drops.length < maxBalls) {
    let best = -1, bestTick = 0;
    for (let i = 0; i < field.period; i++) {
      const alive = game.alive.slice();
      const ball = dropBall(field, i);
      while (!ball.done) stepBall(field, alive, ball);
      const got = ball.hits.filter((n) => field.pegs[n].target).length;
      if (got > best) { best = got; bestTick = i; }
    }
    const ball = dropBall(field, bestTick);
    while (!ball.done) stepBall(field, game.alive, ball);
    applyBall(field, game, ball);
    drops.push(bestTick);
  }
  return game.done && game.alive.every((up, n) => !up || !field.pegs[n].target) ? drops : null;
}

/** The bar a field must clear to be a daily puzzle: greedy play clears it with a ball to spare. */
export const isFair = (field) => !!field && solve(field, BALLS - 1) !== null;
