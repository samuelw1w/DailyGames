import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { handleApi } from "../api/src/index.js";
import { fakeD1 } from "./helpers/fake-d1.js";
import { dailyRounds, closest } from "../web/games/middleman/core/puzzle.js";
import { nameFor } from "../web/shared/names.js";
import { timingFlags } from "../api/src/games/series.js";

const TODAY = new Date().toISOString().slice(0, 10); // UTC today is always "today" somewhere
let env;
beforeEach(() => { env = { DB: fakeD1(), ALLOWED_ORIGINS: "https://example.com" }; });

const post = (path, body, headers = {}) =>
  handleApi(new Request(`https://games.test/api${path}`, { method: "POST", body: JSON.stringify(body), headers }), env);
const get = (path) => handleApi(new Request(`https://games.test/api${path}`), env);
const bestAnswers = (day) => dailyRounds(day).map((r) => closest(r, 1)[0].item.id);

test("health check", async () => {
  const res = await get("/health");
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
});

test("a valid play is scored by the server and stored once", async () => {
  const answers = bestAnswers(TODAY);
  const res = await post("/games/middleman/plays", { day: TODAY, clientId: "client-aaaa-1", answers });
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.ok(body.score > 300 && body.score <= 500, `score ${body.score}`);
  assert.deepEqual(body.rank, { players: 1, betterThan: 0 });

  const again = await post("/games/middleman/plays", { day: TODAY, clientId: "client-aaaa-1", answers: [null, null, null, null, null] });
  assert.equal(again.status, 409);
  assert.equal((await again.json()).score, body.score, "first result is kept");
});

test("bad input is rejected with a 400", async () => {
  const ok = { day: TODAY, clientId: "client-bbbb-1", answers: bestAnswers(TODAY) };
  const endpoint = dailyRounds(TODAY)[0].a.id;
  for (const bad of [
    { ...ok, day: "2001-01-01" },
    { ...ok, day: "2026-02-31" },
    { ...ok, clientId: "x" },
    { ...ok, answers: ["beagle"] },
    { ...ok, answers: [endpoint, null, null, null, null] },
    { ...ok, answers: [42, null, null, null, null] },
  ]) {
    const res = await post("/games/middleman/plays", bad);
    assert.equal(res.status, 400, JSON.stringify(bad));
    assert.ok((await res.json()).error);
  }
  assert.equal((await post("/games/nope/plays", ok)).status, 404);
});

test("stats aggregate picks, histogram and rank", async () => {
  const best = bestAnswers(TODAY);
  await post("/games/middleman/plays", { day: TODAY, clientId: "client-1111-a", answers: best });
  await post("/games/middleman/plays", { day: TODAY, clientId: "client-2222-b", answers: best });
  await post("/games/middleman/plays", { day: TODAY, clientId: "client-3333-c", answers: [null, null, null, null, null] });

  const res = await get(`/games/middleman/days/${TODAY}/stats?score=250`);
  assert.equal(res.status, 200);
  const s = await res.json();
  assert.equal(s.players, 3);
  assert.equal(s.histogram.reduce((a, b) => a + b, 0), 3);
  assert.equal(s.histogram[0], 1, "the all-timeout play is in the lowest bucket");
  assert.equal(s.rounds.length, 5);
  assert.deepEqual(s.rounds[0].top[0], { answer: best[0], n: 2 });
  assert.equal(s.rounds[0].total, 2, "timeouts are not counted as picks");
  // 250 isn't any stored play, so the asker is a 4th player who beat 1 of the 3 others.
  assert.deepEqual(s.rank, { players: 4, betterThan: 33 });

  assert.equal((await get("/games/middleman/days/2999-01-01/stats")).status, 400, "future days stay hidden");
  assert.equal((await get(`/games/middleman/days/${TODAY}/stats?score=1&clientId=x`)).status, 400, "malformed clientId");
});

test("rank stays within 0-100% whether or not the asker's play is stored", async () => {
  const best = bestAnswers(TODAY);
  const first = await (await post("/games/middleman/plays", { day: TODAY, clientId: "client-1111-a", answers: best })).json();
  await post("/games/middleman/plays", { day: TODAY, clientId: "client-2222-b", answers: [null, null, null, null, null] });
  const rank = async (q) => (await (await get(`/games/middleman/days/${TODAY}/stats?${q}`)).json()).rank;

  // A score above every stored play from a browser with no stored play (e.g. the submit failed).
  assert.deepEqual(await rank("score=500&clientId=client-9999-z"), { players: 3, betterThan: 100 });
  assert.deepEqual(await rank("score=500"), { players: 3, betterThan: 100 });
  // A stored player asking about their own score isn't compared with themselves.
  assert.deepEqual(await rank(`score=${first.score}&clientId=client-1111-a`), { players: 2, betterThan: 100 });
  assert.deepEqual(await rank(`score=${first.score}`), { players: 2, betterThan: 100 });
  assert.deepEqual(await rank("score=0&clientId=client-2222-b"), { players: 2, betterThan: 0 });
});

/** A play the server already scored, as if the game had been posted. `at` is when it arrived (default: now). */
const stored = (game, clientId, score, day = TODAY, at = new Date()) =>
  env.DB.prepare("INSERT INTO plays (game, day, client_id, score, detail, created_at) VALUES (?1, ?2, ?3, ?4, '{}', ?5)").bind(game, day, clientId, score, at.toISOString()).run();
const LINEUP = { play: ["orbit", "pins", "stop"], know: ["middleman", "year", "jot"] };
/**
 * Store a whole day for a player: orbit in `jumps`, and the rest by score, finished a minute
 * apart like a real player (`gapMs` to change that). Returns the day's score.
 */
async function storeDay(clientId, { orbit = 5, pins = 70, stop = 80, middleman = 400, year = 90, jot = 60 } = {}, day = TODAY, { gapMs = 60_000, human } = {}) {
  const start = Date.now() - 6 * gapMs;
  let i = 0;
  for (const [game, score] of Object.entries({ orbit, pins, stop, middleman, year, jot })) await stored(game, clientId, score, day, new Date(start + gapMs * i++));
  return (await post("/games/series/plays", { day, clientId, answers: { lineup: LINEUP }, human })).json();
}

test("the day's score is added up by the server from the plays it holds", async () => {
  const body = await storeDay("client-day-1");
  // orbit 5 = one jump (100), pins 70 (100), stop 80, middleman 400 (80), year 90, jot 60.
  assert.equal(body.score, 100 + 100 + 80 + 80 + 90 + 60);
  const again = await post("/games/series/plays", { day: TODAY, clientId: "client-day-1", answers: { lineup: { play: ["orbit"], know: [] } } });
  assert.equal(again.status, 409, "one day's score per player");

  await stored("orbit", "client-day-2", 3);
  const missing = await post("/games/series/plays", { day: TODAY, clientId: "client-day-2", answers: { lineup: LINEUP } });
  assert.equal(missing.status, 400, "a game the server never saw can't count");
  assert.match((await missing.json()).error, /pins/);
  for (const lineup of [{ play: ["orbit", "orbit"] }, { play: ["orbit", "pins", "stop", "skip"] }, { know: ["orbit"] }, {}]) {
    assert.equal((await post("/games/series/plays", { day: TODAY, clientId: "client-day-2", answers: { lineup } })).status, 400, JSON.stringify(lineup));
  }
});

test("day stats give the spread of scores, for the bell curve", async () => {
  await storeDay("client-curve-1", { year: 100 });
  await storeDay("client-curve-2", { year: 0 });
  const s = await (await get(`/games/series/days/${TODAY}/stats?score=520`)).json();
  assert.equal(s.players, 2);
  assert.equal(s.maxScore, 600);
  assert.equal(s.averageScore, 470);
  assert.equal(s.spread, 50);
  assert.deepEqual(s.rank, { players: 2, betterThan: 100 });
});

test("the leaderboard ranks everyone on the day's score, by name, never by id", async () => {
  await storeDay("client-lb-1", { jot: 100 });
  await storeDay("client-lb-2", { jot: 0 });
  await storeDay("client-lb-3", { jot: 50 });
  const res = await handleApi(new Request(`https://games.test/api/leaderboard/${TODAY}`, { headers: { "x-client-id": "client-lb-3" } }), env);
  assert.equal(res.status, 200);
  const lb = await res.json();
  assert.equal(lb.players, 3);
  assert.deepEqual(lb.top.map((p) => p.score), [550, 500, 450]);
  assert.deepEqual(lb.top.map((p) => p.name), ["client-lb-1", "client-lb-3", "client-lb-2"].map(nameFor));
  assert.equal(lb.top[1].you, true);
  assert.deepEqual(lb.you, { rank: 2, name: nameFor("client-lb-3"), score: 500, days: 1 });
  assert.ok(!JSON.stringify(lb).includes("client-lb"), "client ids never leave the server");

  const yesterday = new Date(Date.parse(`${TODAY}T00:00:00Z`) - 864e5).toISOString().slice(0, 10);
  await storeDay("client-lb-2", { jot: 0 }, yesterday);
  const week = await (await get(`/leaderboard/${TODAY}?scope=week`)).json();
  assert.equal(week.top[0].name, nameFor("client-lb-2"), "two days beat one");
  assert.equal(week.top[0].score, 900);
  assert.equal(week.top[0].days, 2);
  assert.equal((await get("/leaderboard/2999-01-01")).status, 400);
});

test("CORS headers only for allowed origins", async () => {
  const allowed = await handleApi(new Request("https://games.test/api/health", { headers: { origin: "https://example.com" } }), env);
  assert.equal(allowed.headers.get("access-control-allow-origin"), "https://example.com");
  const other = await handleApi(new Request("https://games.test/api/health", { headers: { origin: "https://evil.test" } }), env);
  assert.equal(other.headers.get("access-control-allow-origin"), null);
});

/* ---------------- Abuse protection ---------------- */

const board = async (clientId) =>
  (await handleApi(new Request(`https://games.test/api/leaderboard/${TODAY}`, { headers: clientId ? { "x-client-id": clientId } : {} }), env)).json();
const flagsOf = async (clientId) => JSON.parse((await env.DB.prepare("SELECT detail FROM plays WHERE game = 'series' AND client_id = ?1").bind(clientId).first()).detail).flags;

/** Answer Turnstile's siteverify like Cloudflare would: only the token "good" passes. */
function fakeTurnstile(t, answer = async (form) => Response.json({ success: form.get("response") === "good" })) {
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "https://challenges.cloudflare.com/turnstile/v0/siteverify");
    assert.equal(init.body.get("secret"), "turnstile-secret");
    return answer(init.body);
  };
  t.after(() => { globalThis.fetch = real; });
  env.TURNSTILE_SECRET = "turnstile-secret";
}

test("writes are rate limited per IP, reads aren't", async () => {
  const keys = [];
  env.WRITE_LIMITER = { limit: async ({ key }) => { keys.push(key); return { success: false }; } };
  const res = await post("/games/middleman/plays", { day: TODAY, clientId: "client-rate-1", answers: bestAnswers(TODAY) }, { "cf-connecting-ip": "203.0.113.9" });
  assert.equal(res.status, 429);
  assert.equal(res.headers.get("retry-after"), "60");
  assert.ok((await res.json()).error);
  assert.deepEqual(keys, ["203.0.113.9"]);
  assert.equal((await get("/health")).status, 200, "GETs don't count");

  env.WRITE_LIMITER = { limit: async () => ({ success: true }) };
  assert.equal((await post("/games/middleman/plays", { day: TODAY, clientId: "client-rate-1", answers: bestAnswers(TODAY) })).status, 201);
});

test("a series without a Turnstile pass still counts for its player, but nobody else sees it", async (t) => {
  fakeTurnstile(t);
  env.RISK_SECRET = "risk-secret";
  const human = await storeDay("client-human-1", { jot: 0 }, TODAY, { human: "good" });
  const bot = await storeDay("client-bot-1", { jot: 100 }, TODAY, { human: "forged" });
  await storeDay("client-bot-2", { jot: 100 }); // no token at all
  assert.equal(bot.score, 550, "scored as usual");
  assert.deepEqual(await flagsOf("client-bot-1"), ["no-human"]);
  assert.deepEqual(await flagsOf("client-bot-2"), ["no-human"]);
  assert.equal(await flagsOf("client-human-1"), undefined);

  const everyone = await board();
  assert.equal(everyone.players, 1);
  assert.deepEqual(everyone.top.map((p) => p.score), [human.score]);

  // The hidden player sees a normal board with themselves on it.
  const theirs = await board("client-bot-1");
  assert.equal(theirs.players, 2);
  assert.deepEqual(theirs.top.map((p) => p.score), [550, human.score]);
  assert.equal(theirs.top[0].you, true);
  assert.deepEqual(theirs.you, { rank: 1, name: nameFor("client-bot-1"), score: 550, days: 1 });

  // The bell curve and the most chosen games leave it out too, except in its own rank.
  const s = await (await get(`/games/series/days/${TODAY}/stats?score=550&clientId=client-bot-1`)).json();
  assert.equal(s.players, 1);
  assert.equal(s.rounds[0].total, 3, "only the visible lineup is counted");
  assert.deepEqual(s.rank, { players: 2, betterThan: 100 });

  // Risk still plays for the hidden day's score.
  const risk = await post("/risk/state", { day: TODAY, clientId: "client-bot-1" });
  assert.equal(risk.status, 200);
  assert.equal((await risk.json()).base, 550);
});

test("without TURNSTILE_SECRET, or when Cloudflare can't be reached, nothing is hidden", async (t) => {
  await storeDay("client-open-1");
  assert.equal(await flagsOf("client-open-1"), undefined, "no secret: not checked");

  fakeTurnstile(t, async () => { throw new TypeError("fetch failed"); });
  t.mock.method(console, "error", () => {});
  await storeDay("client-open-2", {}, TODAY, { human: "good" });
  assert.equal(await flagsOf("client-open-2"), undefined);
  assert.equal((await board()).players, 2);
});

test("a day finished faster than anyone could play it is hidden", async () => {
  await storeDay("client-quick-1", {}, TODAY, { gapMs: 2_000 });
  await storeDay("client-steady-1", { jot: 0 });
  assert.deepEqual(await flagsOf("client-quick-1"), ["too-fast"]);
  assert.equal(await flagsOf("client-steady-1"), undefined);
  assert.equal((await board()).players, 1);
  assert.equal((await board("client-quick-1")).players, 2);
});

test("timing flags: a minimum per game and between any two games", () => {
  const at = (...s) => s.map((x) => x * 1000);
  assert.deepEqual(timingFlags(at(0)), [], "one game can't be timed");
  assert.deepEqual(timingFlags(at(0, 60, 120, 180, 240, 300)), []);
  assert.deepEqual(timingFlags(at(300, 0, 240, 60, 180, 120)), [], "order doesn't matter");
  assert.deepEqual(timingFlags(at(0, 10, 20, 30, 40, 50)), ["too-fast"], "six games in 50 s");
  assert.deepEqual(timingFlags(at(0, 2, 100, 200, 300, 400)), ["too-fast"], "two games 2 s apart");
  assert.deepEqual(timingFlags(at(0, 20)), [], "two games 20 s apart");
});
