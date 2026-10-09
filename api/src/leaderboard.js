// The leaderboard for everyone: the best day's scores (0 to 600, before Risk), for one day or
// added up over the seven days ending on it. Players appear under a name made from their
// client id (web/shared/names.js); ids themselves are never sent out. Hidden plays (see
// 0003_trust.sql) only appear to the player who sent them, so the board looks normal to them.
import { nameFor } from "../../web/shared/names.js";
import { HttpError, json } from "./lib/http.js";
import { isRevealed } from "./lib/days.js";

const CLIENT_ID_RE = /^[A-Za-z0-9-]{8,64}$/;
const TOP = 20;
const daysBefore = (day, n) => { const d = new Date(`${day}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };

/**
 * GET /api/leaderboard/:day[?scope=week]
 * Send the player's client id in an `x-client-id` header to have their row marked and their
 * place returned even when they aren't in the top twenty.
 */
export async function leaderboard(request, env, day) {
  if (!isRevealed(day)) throw new HttpError(400, "day must be a valid date that isn't in the future.");
  const week = new URL(request.url).searchParams.get("scope") === "week";
  const from = week ? daysBefore(day, 6) : day;
  const me = request.headers.get("x-client-id");
  const you = me && CLIENT_ID_RE.test(me) ? me : null;

  // Every player's total over the range, best first; ties go to whoever finished first.
  const seen = "game = 'series' AND day BETWEEN ?1 AND ?2 AND (hidden = 0 OR client_id IS ?3)";
  const totals = `SELECT client_id, SUM(score) AS score, COUNT(*) AS days, MIN(created_at) AS first
    FROM plays WHERE ${seen} GROUP BY client_id`;
  const [top, count] = await env.DB.batch([
    env.DB.prepare(`${totals} ORDER BY score DESC, first ASC LIMIT ${TOP}`).bind(from, day, you),
    env.DB.prepare(`SELECT COUNT(DISTINCT client_id) AS players FROM plays WHERE ${seen}`).bind(from, day, you),
  ]);
  const rows = top.results.map((r, i) => ({ rank: i + 1, name: nameFor(r.client_id), score: r.score, days: r.days, ...(r.client_id === you ? { you: true } : {}) }));

  let mine = null;
  if (you) {
    const row = await env.DB.prepare(`SELECT score, days, first FROM (${totals}) WHERE client_id = ?3`).bind(from, day, you).first();
    if (row) {
      const ahead = await env.DB.prepare(`SELECT COUNT(*) AS n FROM (${totals}) WHERE score > ?4 OR (score = ?4 AND first < ?5)`).bind(from, day, you, row.score, row.first).first();
      mine = { rank: (ahead?.n ?? 0) + 1, name: nameFor(you), score: row.score, days: row.days };
    } else mine = { rank: null, name: nameFor(you), score: null };
  }
  return json({ day, scope: week ? "week" : "day", from, players: count.results[0]?.players ?? 0, top: rows, you: mine }, 200, { "cache-control": "no-store" });
}
