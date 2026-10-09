// The day's score, for the bell curve and the leaderboards. The client sends only its lineup;
// the server adds up the plays it already holds for those games, so a score can't be made up.
import { ACTS, DAY_POINTS, pointsFromScore, validLineup } from "../../../web/shared/scoring.js";
import { HttpError } from "../lib/http.js";

export default {
  id: "series",
  maxScore: DAY_POINTS,

  /**
   * @param {string} day       YYYY-MM-DD
   * @param {unknown} answers  { lineup: { play: [...], know: [...] } }: up to three game ids per act
   * @param {{ clientId: string, db: D1Database }} ctx
   */
  async checkAnswers(day, answers, { clientId, db }) {
    const lineup = answers?.lineup;
    if (!validLineup(lineup)) throw new HttpError(400, "answers.lineup must be up to three different games from each act.");
    const games = ACTS.flatMap((a) => lineup[a.id] ?? []);
    const { results } = await db
      .prepare(`SELECT game, score FROM plays WHERE day = ?1 AND client_id = ?2 AND game IN (${games.map((_, i) => `?${i + 3}`).join(", ")})`)
      .bind(day, clientId, ...games)
      .all();
    const scores = new Map(results.map((r) => [r.game, r.score]));
    const missing = games.filter((id) => !scores.has(id));
    if (missing.length) throw new HttpError(400, `No play recorded today for: ${missing.join(", ")}.`);
    const points = Object.fromEntries(games.map((id) => [id, pointsFromScore(id, scores.get(id))]));
    return {
      score: games.reduce((sum, id) => sum + points[id], 0),
      // One pick per game chosen, round 0 for Play and 1 for Know, so day stats show the most chosen games.
      picks: ACTS.flatMap((a, round) => (lineup[a.id] ?? []).map((answer) => ({ round, answer }))),
      detail: { lineup, points },
    };
  },
};
