// Skip's server rules. The client sends only the ticks of the taps on each stone; the server
// checks them against the day's touches and counts the skips itself.
import { GAME_ID, MAX_SKIPS, STONES, dailyWater, playGame, bestOf } from "../../../web/games/skip/core/sim.js";
import { HttpError } from "../lib/http.js";

export default {
  id: GAME_ID,
  maxScore: MAX_SKIPS,

  /**
   * @param {string} day       YYYY-MM-DD
   * @param {unknown} answers  { throws: number[][], assist: boolean }: for each of the three
   *                           stones, the tick of every tap after the throw, in order
   * @returns {{ score: number, picks: {round:number, answer:string}[], detail: object }}
   */
  checkAnswers(day, answers) {
    const counts = playGame(dailyWater(day), answers?.throws);
    if (!counts) throw new HttpError(400, `answers.throws must be ${STONES} lists of tap ticks in increasing order.`);
    if (typeof answers.assist !== "boolean") throw new HttpError(400, "answers.assist must be true or false.");
    return {
      score: bestOf(counts),
      // One pick per stone (its skip count), so day stats show the most common counts.
      picks: counts.map((n, round) => ({ round, answer: String(n) })),
      detail: { counts, assist: answers.assist, throws: answers.throws },
    };
  },
};
