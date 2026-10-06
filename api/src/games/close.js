// Close's server rules. The client sends its guesses; the server knows the day's answer and
// scores them itself.
import { GAME_ID, GUESSES, dailyQuestion, validGuess, score } from "../../../web/games/close/core/puzzle.js";
import { HttpError } from "../lib/http.js";

export default {
  id: GAME_ID,
  maxScore: 100,

  /** @param {unknown} answers  { guesses: number[] }: one to three estimates, in the unit the question asked for */
  checkAnswers(day, answers) {
    const guesses = answers?.guesses;
    if (!Array.isArray(guesses) || !guesses.length || guesses.length > GUESSES || !guesses.every(validGuess)) throw new HttpError(400, `answers.guesses must be 1 to ${GUESSES} positive numbers.`);
    return { score: score(dailyQuestion(day).answer, guesses), picks: [], detail: { guesses } };
  },
};
