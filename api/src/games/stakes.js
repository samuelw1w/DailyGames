// Stakes' server rules. The client sends only its bets and choices; the server deals the same
// five tables from the date and works out the final bankroll itself.
import { GAME_ID, MAX_SCORE, playDay } from "../../../web/games/stakes/core/tables.js";
import { HttpError } from "../lib/http.js";

export default {
  id: GAME_ID,
  maxScore: MAX_SCORE,

  /**
   * @param {string} day       YYYY-MM-DD
   * @param {unknown} answers  { plays: object[] }: one { bet, ...choice } per table played, in
   *                           order. The choice is `pick` (roulette, baccarat, craps), `moves`
   *                           (blackjack: a string of H, S, D) or `play` (poker: true or false).
   * @returns {{ score: number, picks: {round:number, answer:string}[], detail: object }}
   */
  checkAnswers(day, answers) {
    const result = playDay(day, answers?.plays);
    if (!result) throw new HttpError(400, "answers.plays must be one complete day: a legal bet and choice for each table played.");
    const choice = (p) => String(p.pick ?? p.moves ?? (p.play ? "play" : "fold")) || "stand";
    return {
      score: result.bankroll,
      // One pick per table (what the player chose), so day stats show the most popular plays.
      picks: answers.plays.map((p, round) => ({ round, answer: choice(p) })),
      detail: { bankroll: result.bankroll, deltas: result.results.map((r) => r.delta), plays: answers.plays },
    };
  },
};
