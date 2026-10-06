// Link's server rules. The client sends what it typed for each pair and whether it took the
// hint; the server knows the day's links and scores them itself.
import { GAME_ID, ROUNDS, dailyLinks, playGame } from "../../../web/games/link/core/puzzle.js";
import { HttpError } from "../lib/http.js";

export default {
  id: GAME_ID,
  maxScore: 100,

  /** @param {unknown} answers  { answers: { guesses: string[], hint: boolean }[] }: one entry per pair */
  checkAnswers(day, answers) {
    const scored = playGame(dailyLinks(day), answers?.answers);
    if (!scored) throw new HttpError(400, `answers.answers must be ${ROUNDS} entries of { guesses, hint }.`);
    return { score: scored.total, picks: scored.rounds.map((r, round) => ({ round, answer: r.solved ? "solved" : "missed" })), detail: { answers: answers.answers } };
  },
};
