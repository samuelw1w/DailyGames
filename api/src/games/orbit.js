// Orbit's server rules. The client sends only the ticks at which the player tapped; the server
// replays them through the same physics the browser used and reads off the result itself.
import { GAME_ID, MAX_SCORE, dailyLevel, scoreRun } from "../../../web/games/orbit/core/puzzle.js";
import { MAX_JUMPS, MAX_TICKS, replay } from "../../../web/games/orbit/core/sim.js";
import { HttpError } from "../lib/http.js";

export default {
  id: GAME_ID,
  maxScore: MAX_SCORE,

  /**
   * @param {string} day       YYYY-MM-DD
   * @param {unknown} answers  { taps: number[], assist: boolean }: the tick of each launch, in
   *                           order, and whether slow motion was on for any of them
   * @returns {{ score: number, picks: {round:number, answer:string}[], detail: object }}
   */
  checkAnswers(day, answers) {
    const taps = answers?.taps;
    const inOrder = Array.isArray(taps) && taps.length <= MAX_JUMPS &&
      taps.every((t, i) => Number.isInteger(t) && t >= 1 && t <= MAX_TICKS && (i === 0 || t > taps[i - 1]));
    if (!inOrder) throw new HttpError(400, `answers.taps must be up to ${MAX_JUMPS} tick numbers in increasing order.`);
    if (typeof answers.assist !== "boolean") throw new HttpError(400, "answers.assist must be true or false.");

    const run = replay(dailyLevel(day), taps);
    if (!run) throw new HttpError(400, "answers.taps doesn't match a real run of this day's level.");
    return {
      score: scoreRun(run),
      // One pick per jump ("hop", "miss" or "goal"), so day stats show how each jump went for everyone.
      picks: run.outcomes.map((answer, round) => ({ round, answer })),
      detail: { jumps: run.jumps, outcomes: run.outcomes, assist: answers.assist, taps },
    };
  },
};
