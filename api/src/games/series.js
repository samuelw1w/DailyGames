// The day's score, for the bell curve and the leaderboards. The client sends only its lineup;
// the server adds up the plays it already holds for those games, so a score can't be made up.
import { ACTS, DAY_POINTS, pointsFromScore, validLineup } from "../../../web/shared/scoring.js";
import { HttpError } from "../lib/http.js";

// The fastest a person could get through a lineup, judged from when the server received each
// game. Plays quicker than this are kept but hidden from everyone else (see 0003_trust.sql).
// Deliberately loose for now: tune once there's real timing data (TASKS.md, "Measure how long
// a day takes").
const MIN_GAP_MS = 5_000;   // between two games finishing, i.e. the second one took at least this long
const MIN_GAME_MS = 18_000; // on average per game after the first, so six games span at least 90 s

/** Why the lineup's plays look automated: [] for a believable day, ["too-fast"] otherwise. */
export function timingFlags(times) {
  const t = times.toSorted((a, b) => a - b);
  const gaps = t.slice(1).map((x, i) => x - t[i]);
  if (!gaps.length) return [];
  const fast = gaps.some((g) => g < MIN_GAP_MS) || t.at(-1) - t[0] < MIN_GAME_MS * gaps.length;
  return fast ? ["too-fast"] : [];
}

export default {
  id: "series",
  maxScore: DAY_POINTS,
  // Carries a Turnstile token, since this is the play the leaderboards rank (see plays.js).
  gated: true,

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
      .prepare(`SELECT game, score, created_at FROM plays WHERE day = ?1 AND client_id = ?2 AND game IN (${games.map((_, i) => `?${i + 3}`).join(", ")})`)
      .bind(day, clientId, ...games)
      .all();
    const scores = new Map(results.map((r) => [r.game, r.score]));
    const times = results.map((r) => Date.parse(r.created_at));
    const missing = games.filter((id) => !scores.has(id));
    if (missing.length) throw new HttpError(400, `No play recorded today for: ${missing.join(", ")}.`);
    const points = Object.fromEntries(games.map((id) => [id, pointsFromScore(id, scores.get(id))]));
    return {
      score: games.reduce((sum, id) => sum + points[id], 0),
      // One pick per game chosen, round 0 for Play and 1 for Know, so day stats show the most chosen games.
      picks: ACTS.flatMap((a, round) => (lineup[a.id] ?? []).map((answer) => ({ round, answer }))),
      detail: { lineup, points },
      flags: timingFlags(times),
    };
  },
};
