// Risk's server rules. The client sends only the tables it chose and what it picked on each
// hand; the server deals the same hands from the date and works out the multiplier itself.
import { GAME_ID, MAX_SCORE, playDay, scoreAt } from "../../../web/games/house/core/tables.js";
import { HttpError } from "../lib/http.js";

export default {
  id: GAME_ID,
  maxScore: MAX_SCORE,

  /**
   * @param {string} day       YYYY-MM-DD
   * @param {unknown} answers  { start, plays }: `plays` is one { table, pick } per hand played
   *                           (one to five, in order); blackjack sends `moves` (a string of
   *                           H and S) instead of `pick`. `start` is the day's Series points.
   * @returns {{ score: number, picks: {round:number, answer:string}[], detail: object }}
   */
  checkAnswers(day, answers) {
    // `start` is the day's Series points (1 to 1,000), which the client reports. The server
    // can check every hand, but not this number, so it is bounded rather than trusted.
    const start = answers?.start;
    if (!Number.isInteger(start) || start < 1 || start > 1000) throw new HttpError(400, "answers.start must be a whole number from 1 to 1000.");
    const result = playDay(day, answers?.plays);
    if (!result) throw new HttpError(400, "answers.plays must be one to five hands, each a table and a legal choice.");
    return {
      score: scoreAt(start, result.tenths),
      // One pick per hand (the table and the side taken), so day stats show the most popular choices.
      picks: answers.plays.map((p, round) => ({ round, answer: `${p.table}:${p.pick ?? "play"}` })),
      detail: { start, tenths: result.tenths, outcomes: result.outcomes, plays: answers.plays },
    };
  },
};
