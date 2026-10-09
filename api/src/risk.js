// Risk, dealt by the server. The browser never knows a hand before the player has committed to
// it: it sends a table and a side (or, at blackjack, asks for cards and then hits or stands),
// and the server deals from a seed only it can make, kept per player and per day.
//
//   POST /api/risk/state  { day, clientId }                  where the day's run stands
//   POST /api/risk/play   { day, clientId, table, pick }     play a hand at roulette, sic bo, baccarat or craps
//                         { day, clientId, table: "blackjack" }            deal a blackjack hand
//                         { day, clientId, table: "blackjack", move }      then "H" (hit) or "S" (stand)
//   POST /api/risk/stop   { day, clientId }                  keep the multiplier reached
//
// Each answers with the run: { base, hands, tenths, points, open, done }. The points it is
// played for come from the day's 'series' play, so Risk opens once that has been sent.
import { HANDS, MAX_SCORE, TABLES, blackjack, handTotal, playTable, scoreAt, tenthsAfter } from "../../web/games/house/core/tables.js";
import { HttpError, json, readJson } from "./lib/http.js";
import { isPlayableToday } from "./lib/days.js";

const CLIENT_ID_RE = /^[A-Za-z0-9-]{8,64}$/;
const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

/**
 * The seed for a player's day: an HMAC of the day and client id under RISK_SECRET. Without
 * the secret nobody can work out a hand in advance, and no two players share one.
 */
export async function riskSeed(secret, day, clientId) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return `${day}:${toHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`risk:${day}:${clientId}`)))}`;
}

async function readRun(db, day, clientId) {
  const row = await db.prepare("SELECT base, state, version FROM risk_runs WHERE day = ?1 AND client_id = ?2").bind(day, clientId).first();
  return row && { base: row.base, state: JSON.parse(row.state), version: row.version };
}

/** The day's run, started on first use. Needs the day's score, which the 'series' play holds. */
async function loadRun(db, day, clientId) {
  const run = await readRun(db, day, clientId);
  if (run) return run;
  const series = await db.prepare("SELECT score FROM plays WHERE game = 'series' AND day = ?1 AND client_id = ?2").bind(day, clientId).first();
  if (!series) throw new HttpError(409, "Finish the day's series first: Risk plays for the score the server has for you.");
  const state = { hands: [], open: null, done: series.score === 0 };
  await db.prepare("INSERT INTO risk_runs (day, client_id, base, state) VALUES (?1, ?2, ?3, ?4) ON CONFLICT (day, client_id) DO NOTHING")
    .bind(day, clientId, series.score, JSON.stringify(state)).run();
  return readRun(db, day, clientId);
}

/** Save a changed run, unless another request changed it first. */
async function saveRun(db, day, clientId, run) {
  const res = await db.prepare("UPDATE risk_runs SET state = ?1, version = version + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE day = ?2 AND client_id = ?3 AND version = ?4")
    .bind(JSON.stringify(run.state), day, clientId, run.version).run();
  if (!res.meta?.changes) throw new HttpError(409, "That hand was already played. Reload to see where you are.");
}

/** Once the run is over, record the points it ended on as the day's 'house' play, for the stats. */
async function recordFinish(db, day, clientId, run) {
  const outcomes = run.state.hands.map((h) => h.outcome), tenths = tenthsAfter(outcomes);
  await db.prepare("INSERT INTO plays (game, day, client_id, score, detail) VALUES ('house', ?1, ?2, ?3, ?4) ON CONFLICT (game, day, client_id) DO NOTHING")
    .bind(day, clientId, Math.min(MAX_SCORE, scoreAt(run.base, tenths)), JSON.stringify({ start: run.base, tenths, outcomes, plays: run.state.hands.map(({ table, pick, moves }) => ({ table, pick, moves })) }))
    .run();
}

/** What the browser is shown: every settled hand in full, but only the cards already face up in an open one. */
function view(run) {
  const outcomes = run.state.hands.map((h) => h.outcome), tenths = tenthsAfter(outcomes);
  return { base: run.base, hands: run.state.hands, tenths, points: scoreAt(run.base, tenths), open: run.state.open, done: run.state.done };
}

async function begin(request, env) {
  const body = await readJson(request);
  const { day, clientId } = body ?? {};
  if (!isPlayableToday(day)) throw new HttpError(400, "day must be today's date (YYYY-MM-DD) in your time zone.");
  if (typeof clientId !== "string" || !CLIENT_ID_RE.test(clientId)) throw new HttpError(400, "clientId is missing or malformed.");
  if (!env.RISK_SECRET) throw new HttpError(503, "Risk isn't set up on this server yet (RISK_SECRET is missing).");
  return { body, day, clientId, run: await loadRun(env.DB, day, clientId) };
}

/** POST /api/risk/state */
export async function riskState(request, env) {
  const { run } = await begin(request, env);
  return json(view(run));
}

/** POST /api/risk/play */
export async function riskPlay(request, env) {
  const { body, day, clientId, run } = await begin(request, env);
  const s = run.state, hand = s.hands.length;
  if (s.done || hand >= HANDS) throw new HttpError(409, "Today's hands are over.");
  if (!TABLES.includes(body.table)) throw new HttpError(400, "table must be one of the five tables.");
  const seed = await riskSeed(env.RISK_SECRET, day, clientId);

  if (s.open && body.table !== "blackjack") throw new HttpError(409, "Finish the blackjack hand first.");
  if (body.table === "blackjack") {
    if (!s.open && body.move !== undefined) throw new HttpError(400, "Deal the hand before hitting or standing.");
    if (s.open && body.move !== "H" && body.move !== "S") throw new HttpError(400, 'move must be "H" (hit) or "S" (stand).');
    const moves = (s.open?.moves ?? "") + (body.move ?? "");
    const h = blackjack(seed, moves, hand);
    if (!h) throw new HttpError(400, "That move isn't allowed.");
    if (h.done) { s.hands.push({ table: "blackjack", moves, outcome: h.outcome, player: h.player, dealer: h.dealer }); s.open = null; }
    else s.open = { table: "blackjack", moves, player: h.player, dealer: h.dealer, total: handTotal(h.player) };
  } else {
    const r = playTable(seed, hand, { table: body.table, pick: body.pick });
    if (!r) throw new HttpError(400, "pick isn't a choice at that table.");
    s.hands.push(r);
  }
  if (s.hands.length === HANDS) s.done = true;
  await saveRun(env.DB, day, clientId, run);
  if (s.done) await recordFinish(env.DB, day, clientId, run);
  return json(view(run));
}

/** POST /api/risk/stop */
export async function riskStop(request, env) {
  const { day, clientId, run } = await begin(request, env);
  const s = run.state;
  if (s.open) throw new HttpError(409, "Finish the blackjack hand first.");
  if (!s.hands.length) throw new HttpError(409, "Play at least one hand, or bank your points on the hub instead.");
  if (!s.done) {
    s.done = true;
    await saveRun(env.DB, day, clientId, run);
    await recordFinish(env.DB, day, clientId, run);
  }
  return json(view(run));
}
