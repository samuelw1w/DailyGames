import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { handleApi } from "../api/src/index.js";
import { fakeD1 } from "./helpers/fake-d1.js";
import { dailyRounds, closest } from "../web/games/middleman/core/puzzle.js";

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
  assert.deepEqual(s.rank, { players: 3, betterThan: 50 });

  assert.equal((await get("/games/middleman/days/2999-01-01/stats")).status, 400, "future days stay hidden");
});

test("CORS headers only for allowed origins", async () => {
  const allowed = await handleApi(new Request("https://games.test/api/health", { headers: { origin: "https://example.com" } }), env);
  assert.equal(allowed.headers.get("access-control-allow-origin"), "https://example.com");
  const other = await handleApi(new Request("https://games.test/api/health", { headers: { origin: "https://evil.test" } }), env);
  assert.equal(other.headers.get("access-control-allow-origin"), null);
});
