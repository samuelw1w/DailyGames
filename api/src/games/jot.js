// Jot's server rules. The client sends its guesses; the server knows the day's word and
// scores them itself.
import { GAME_ID, GUESSES, dailyWord, validGuess, score } from "../../../web/games/jot/core/puzzle.js";
import { HttpError } from "../lib/http.js";

export default {
  id: GAME_ID,
  maxScore: 100,

  /** @param {unknown} answers  { guesses: string[] }: one to eight five-letter guesses, lower case, in order */
  checkAnswers(day, answers) {
    const guesses = answers?.guesses;
    if (!Array.isArray(guesses) || !guesses.length || guesses.length > GUESSES || !guesses.every(validGuess)) throw new HttpError(400, `answers.guesses must be 1 to ${GUESSES} five-letter words.`);
    // The opening guess is the pick, so day stats show the most popular first words.
    return { score: score(dailyWord(day), guesses), picks: [{ round: 0, answer: guesses[0] }], detail: { guesses } };
  },
};
