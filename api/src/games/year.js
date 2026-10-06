// Year's server rules. The client sends its guesses; the server knows the day's answer and
// scores them itself.
import { GAME_ID, GUESSES, dailyThing, validGuess, score } from "../../../web/games/year/core/puzzle.js";
import { HttpError } from "../lib/http.js";

export default {
  id: GAME_ID,
  maxScore: 100,

  /** @param {unknown} answers  { guesses: number[] }: one to three years, in the order guessed */
  checkAnswers(day, answers) {
    const guesses = answers?.guesses;
    if (!Array.isArray(guesses) || !guesses.length || guesses.length > GUESSES || !guesses.every(validGuess)) throw new HttpError(400, `answers.guesses must be 1 to ${GUESSES} years.`);
    // The first guess is the pick, so day stats show the years people reached for.
    return { score: score(dailyThing(day).v, guesses), picks: [{ round: 0, answer: String(guesses[0]) }], detail: { guesses } };
  },
};
