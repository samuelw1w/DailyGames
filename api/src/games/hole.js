// Hole's server rules. The client sends only the two tap ticks of each swing and putt; the
// server plays the hole again through the same physics and counts the strokes itself.
import { GAME_ID, MAX_SCORE, dailyCourse, playHole, pointsFor, scoreName } from "../../../web/games/hole/core/sim.js";
import { HttpError } from "../lib/http.js";

export default {
  id: GAME_ID,
  maxScore: MAX_SCORE,

  /**
   * @param {string} day       YYYY-MM-DD
   * @param {unknown} answers  { taps: [aim, power][], assist: boolean }: for each swing or
   *                           putt, the tick of the aim tap and of the power tap
   * @returns {{ score: number, picks: {round:number, answer:string}[], detail: object }}
   */
  checkAnswers(day, answers) {
    const course = dailyCourse(day);
    const round = playHole(course, answers?.taps);
    if (!round) throw new HttpError(400, "answers.taps must be one complete hole: an [aim tick, power tick] pair per stroke.");
    if (typeof answers.assist !== "boolean") throw new HttpError(400, "answers.assist must be true or false.");
    return {
      score: pointsFor(round.strokes, course.par),
      // A single pick: the name of the score ("Birdie", "Par"...), so day stats show how the field did.
      picks: [{ round: 0, answer: scoreName(round.strokes, course.par) }],
      detail: { strokes: round.strokes, par: course.par, holed: round.holed, assist: answers.assist, taps: answers.taps },
    };
  },
};
