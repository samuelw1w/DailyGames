// Request handlers for plays and stats. Game-agnostic: game rules come from ./games.
import { GAMES } from "./games/index.js";
import { HttpError, json, readJson } from "./lib/http.js";
import { isPlayableToday, isRevealed } from "./lib/days.js";

const CLIENT_ID_RE = /^[A-Za-z0-9-]{8,64}$/;
const TOP_ANSWERS = 5;

function gameOr404(id) {
  const game = GAMES.get(id);
  if (!game) throw new HttpError(404, `Unknown game "${id}".`);
  return game;
}

/** How a score compares with everyone else's for that day. */
async function rankFor(db, game, day, score) {
  const row = await db
    .prepare("SELECT COUNT(*) AS players, SUM(CASE WHEN score < ?1 THEN 1 ELSE 0 END) AS below FROM plays WHERE game = ?2 AND day = ?3")
    .bind(score, game, day)
    .first();
  const players = row?.players ?? 0;
  const below = row?.below ?? 0;
  const others = Math.max(0, players - 1);
  return { players, betterThan: others ? Math.round((100 * below) / others) : 0 };
}

/** POST /api/games/:game/plays  { day, clientId, answers } */
export async function submitPlay(request, env, gameId) {
  const game = gameOr404(gameId);
  const body = await readJson(request);
  const { day, clientId, answers } = body ?? {};
  if (!isPlayableToday(day)) throw new HttpError(400, "day must be today's date (YYYY-MM-DD) in your time zone.");
  if (typeof clientId !== "string" || !CLIENT_ID_RE.test(clientId)) throw new HttpError(400, "clientId is missing or malformed.");

  const { score, picks, detail } = await game.checkAnswers(day, answers, { clientId, db: env.DB });

  const inserted = await env.DB
    .prepare("INSERT INTO plays (game, day, client_id, score, detail) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT (game, day, client_id) DO NOTHING")
    .bind(game.id, day, clientId, score, JSON.stringify(detail))
    .run();

  if (!inserted.meta?.changes) {
    // Already played today from this browser: keep the first result, report it.
    const prior = await env.DB.prepare("SELECT score FROM plays WHERE game = ?1 AND day = ?2 AND client_id = ?3").bind(game.id, day, clientId).first();
    const rank = await rankFor(env.DB, game.id, day, prior.score);
    return json({ alreadyPlayed: true, score: prior.score, rank }, 409);
  }

  if (picks.length) {
    const upsert = env.DB.prepare(
      "INSERT INTO picks (game, day, round, answer, n) VALUES (?1, ?2, ?3, ?4, 1) ON CONFLICT (game, day, round, answer) DO UPDATE SET n = n + 1",
    );
    await env.DB.batch(picks.map((p) => upsert.bind(game.id, day, p.round, p.answer)));
  }

  const rank = await rankFor(env.DB, game.id, day, score);
  return json({ score, rank }, 201);
}

/** GET /api/games/:game/days/:day/stats[?score=N] */
export async function dayStats(request, env, gameId, day) {
  const game = gameOr404(gameId);
  if (!isRevealed(day)) throw new HttpError(400, "day must be a valid date that isn't in the future.");

  const [scores, picks] = await env.DB.batch([
    env.DB.prepare("SELECT score, COUNT(*) AS n FROM plays WHERE game = ?1 AND day = ?2 GROUP BY score").bind(game.id, day),
    env.DB.prepare("SELECT round, answer, n FROM picks WHERE game = ?1 AND day = ?2 ORDER BY round, n DESC, answer").bind(game.id, day),
  ]);

  // Score histogram in 10 equal buckets (the max score lands in the last one).
  const histogram = Array(10).fill(0);
  let players = 0, sum = 0, squares = 0;
  for (const { score, n } of scores.results) {
    histogram[Math.min(9, Math.floor((score / game.maxScore) * 10))] += n;
    players += n;
    sum += score * n;
    squares += score * score * n;
  }
  const mean = players ? sum / players : 0;

  const rounds = new Map();
  for (const { round, answer, n } of picks.results) {
    const r = rounds.get(round) ?? { round, total: 0, top: [] };
    r.total += n;
    if (r.top.length < TOP_ANSWERS) r.top.push({ answer, n });
    rounds.set(round, r);
  }

  const out = {
    game: game.id,
    day,
    players,
    maxScore: game.maxScore,
    averageScore: players ? Math.round(mean) : null,
    // The standard deviation of the scores, so a page can draw the day's bell curve.
    spread: players ? Math.round(Math.sqrt(Math.max(0, squares / players - mean * mean))) : null,
    histogram,
    rounds: [...rounds.values()],
  };
  const url = new URL(request.url);
  if (url.searchParams.has("score")) {
    const s = Number(url.searchParams.get("score"));
    if (Number.isFinite(s)) out.rank = await rankFor(env.DB, game.id, day, s);
  }
  return json(out, 200, { "cache-control": "public, max-age=30" });
}
