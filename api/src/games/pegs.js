// Pegs' server rules. The client sends only the launcher tick of each drop; the server drops
// every ball again through the same physics the browser used and scores the game itself.
import { GAME_ID, MAX_SCORE, dailyField, resultOf } from "../../../web/games/pegs/core/puzzle.js";
import { BALLS, playGame } from "../../../web/games/pegs/core/sim.js";
import { HttpError } from "../lib/http.js";

export default {
  id: GAME_ID,
  maxScore: MAX_SCORE,

  /**
   * @param {string} day       YYYY-MM-DD
   * @param {unknown} answers  { drops: number[], assist: boolean }: for each ball, the tick of
   *                           the launcher's slide it was dropped on
   * @returns {{ score: number, picks: {round:number, answer:string}[], detail: object }}
   */
  checkAnswers(day, answers) {
    const game = playGame(dailyField(day), answers?.drops);
    if (!game) throw new HttpError(400, `answers.drops must be one complete game: up to ${BALLS} launcher ticks.`);
    if (typeof answers.assist !== "boolean") throw new HttpError(400, "answers.assist must be true or false.");
    const { cleared, used, total } = resultOf(game);
    return {
      score: total,
      // One pick per ball (accent pegs it cleared), so day stats show how each ball went for everyone.
      picks: game.perBall.map((n, round) => ({ round, answer: String(n) })),
      detail: { cleared, used, perBall: game.perBall, assist: answers.assist, drops: answers.drops },
    };
  },
};
