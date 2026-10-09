// Risk's entry in the game registry, for its day stats: the points each player ended on after
// the tables (0 to double a perfect day). Its hands are dealt by the server one at a time
// (api/src/risk.js), which records the play itself once the run is over, so plays can't be
// posted here.
import { GAME_ID, MAX_SCORE } from "../../../web/games/house/core/tables.js";
import { HttpError } from "../lib/http.js";

export default {
  id: GAME_ID,
  maxScore: MAX_SCORE,

  checkAnswers() {
    throw new HttpError(400, "Risk is dealt by the server, hand by hand: use /api/risk/play.");
  },
};
