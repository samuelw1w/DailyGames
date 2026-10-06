// Stop's server rules. The client sends only the tick each round's needle was stopped on;
// the server works out where the needle was and scores the day itself.
import { GAME_ID, ROUNDS, CLOCK, dailyDial, playGame } from "../../../web/games/stop/core/sim.js";
import { HttpError } from "../lib/http.js";

export default {
  id: GAME_ID,
  maxScore: 100,

  /** @param {unknown} answers  { ticks: number[], assist: boolean }: the tick of each of the five taps */
  checkAnswers(day, answers) {
    const scored = playGame(dailyDial(day), answers?.ticks);
    if (!scored) throw new HttpError(400, `answers.ticks must be ${ROUNDS} whole numbers from 1 to ${CLOCK}.`);
    if (typeof answers.assist !== "boolean") throw new HttpError(400, "answers.assist must be true or false.");
    return { score: scored.total, picks: [], detail: { errors: scored.errors, assist: answers.assist, ticks: answers.ticks } };
  },
};
