// Spot's server rules. The client sends only the tick on which each kick was taken; the server
// works out where the reticle and the keeper were on that tick and decides each kick itself.
import { GAME_ID, KICKS, CLOCK, dailyGame, playGame, scoreOf } from "../../../web/games/spot/core/sim.js";
import { HttpError } from "../lib/http.js";

export default {
  id: GAME_ID,
  maxScore: KICKS,

  /**
   * @param {string} day       YYYY-MM-DD
   * @param {unknown} answers  { ticks: number[], assist: boolean }: the tick of each of the
   *                           five kicks (1 to CLOCK), and whether slow motion was used
   * @returns {{ score: number, picks: {round:number, answer:string}[], detail: object }}
   */
  checkAnswers(day, answers) {
    const outcomes = playGame(dailyGame(day), answers?.ticks);
    if (!outcomes) throw new HttpError(400, `answers.ticks must be ${KICKS} whole numbers from 1 to ${CLOCK}.`);
    if (typeof answers.assist !== "boolean") throw new HttpError(400, "answers.assist must be true or false.");
    return {
      score: scoreOf(outcomes),
      // One pick per kick ("goal", "saved", "wide" or "over"), so day stats show how each kick went for everyone.
      picks: outcomes.map((answer, round) => ({ round, answer })),
      detail: { outcomes, assist: answers.assist, ticks: answers.ticks },
    };
  },
};
