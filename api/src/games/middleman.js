// Middleman's server rules. It reuses the browser's own puzzle code, so the server always
// knows the exact puzzle for a day and scores answers itself instead of trusting the client.
import { GAME_ID, dailyRounds, scoreAnswer } from "../../../web/games/middleman/core/puzzle.js";
import { HttpError } from "../lib/http.js";

export default {
  id: GAME_ID,
  maxScore: 500,

  /**
   * @param {string} day       YYYY-MM-DD
   * @param {unknown} answers  one item ID (or null for "ran out of time") per round
   * @returns {{ score: number, picks: {round:number, answer:string}[], detail: object }}
   */
  checkAnswers(day, answers) {
    const rounds = dailyRounds(day);
    if (!Array.isArray(answers) || answers.length !== rounds.length) {
      throw new HttpError(400, `answers must be an array of ${rounds.length} item IDs (or null).`);
    }
    const scores = [];
    const picks = [];
    rounds.forEach((round, i) => {
      const id = answers[i];
      if (id !== null && (typeof id !== "string" || id.length > 64)) throw new HttpError(400, `Round ${i + 1}: answer must be an item ID or null.`);
      const result = scoreAnswer(round, id);
      if (!result) throw new HttpError(400, `Round ${i + 1}: "${id}" is not a valid answer for this round.`);
      scores.push(result.score);
      if (id !== null) picks.push({ round: i, answer: id });
    });
    return { score: scores.reduce((a, b) => a + b, 0), picks, detail: { scores, answers } };
  },
};
