// Pins' server rules. The client sends only the two tap ticks of each ball; the server rolls
// every ball again through the same physics the browser used and scores the game itself.
import { GAME_ID, MAX_SCORE, playGame, scoreGame } from "../../../web/games/pins/core/puzzle.js";
import { dailyLane } from "../../../web/games/pins/core/sim.js";
import { HttpError } from "../lib/http.js";

const MAX_BALLS = 7; // two open frames and a spare in the last one

export default {
  id: GAME_ID,
  maxScore: MAX_SCORE,

  /**
   * @param {string} day       YYYY-MM-DD
   * @param {unknown} answers  { balls: [pos, hook][], assist: boolean }: for each ball, the tick
   *                           of the position tap and of the hook tap within their sweeps
   * @returns {{ score: number, picks: {round:number, answer:string}[], detail: object }}
   */
  checkAnswers(day, answers) {
    const lane = dailyLane(day);
    const balls = answers?.balls;
    const tick = (t, period) => Number.isInteger(t) && t >= 0 && t < period;
    const valid = Array.isArray(balls) && balls.length <= MAX_BALLS &&
      balls.every((b) => Array.isArray(b) && b.length === 2 && tick(b[0], lane.posPeriod) && tick(b[1], lane.hookPeriod));
    if (!valid) throw new HttpError(400, "answers.balls must be a list of [position tick, hook tick] pairs.");
    if (typeof answers.assist !== "boolean") throw new HttpError(400, "answers.assist must be true or false.");

    const game = playGame(lane, balls);
    if (!game) throw new HttpError(400, "answers.balls isn't one complete game.");
    const { frames, total } = scoreGame(game.rolls);
    return {
      score: total,
      // One pick per frame (its marks, like "X" or "7/"), so day stats show how each frame went for everyone.
      picks: frames.map((f, round) => ({ round, answer: f.marks })),
      detail: { rolls: game.rolls, assist: answers.assist, balls },
    };
  },
};
