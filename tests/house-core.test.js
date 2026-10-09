import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { handleApi } from "../api/src/index.js";
import { riskSeed } from "../api/src/risk.js";
import { fakeD1 } from "./helpers/fake-d1.js";
import {
  HANDS, STEP, TABLES, rouletteSpin, rouletteColor, handTotal, blackjack, baccarat, sicbo, craps,
  playTable, playDay, tenthsAfter, scoreAt, multiple, stepText, shareText,
} from "../web/games/house/core/tables.js";

const dayAfter = (start, n) => { const d = new Date(`${start}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const TODAY = new Date().toISOString().slice(0, 10); // UTC today is always "today" somewhere
const C = (r, s = 0) => ({ r, s });
const DAYS = Array.from({ length: 730 }, (_, i) => dayAfter("2026-10-05", i));
/** Play blackjack by the simplest rule there is: hit below 17. Returns the moves. */
function basicMoves(day, hand = 0) {
  let moves = "";
  for (let h = blackjack(day, "", hand); !h.done; h = blackjack(day, moves, hand)) moves += handTotal(h.player) < 17 ? "H" : "S";
  return moves;
}
const outcome = (day, play, hand = 0) => playTable(day, hand, play)?.outcome;

test("the same day always deals the same hands, and each hand of the day is its own", () => {
  const day = DAYS[0];
  assert.deepEqual([rouletteSpin(day, 2), blackjack(day, "", 2), baccarat(day, 2), sicbo(day, 2), craps(day, 2)], [rouletteSpin(day, 2), blackjack(day, "", 2), baccarat(day, 2), sicbo(day, 2), craps(day, 2)]);
  assert.ok(new Set([0, 1, 2, 3, 4].map((hand) => rouletteSpin(day, hand))).size > 1);
  assert.deepEqual(TABLES, ["roulette", "blackjack", "sicbo", "baccarat", "craps"]);
  assert.deepEqual([HANDS, STEP], [5, 2]);
});

test("the multiplier: 0.2 a hand, from nothing to double", () => {
  assert.deepEqual([[], [1], [-1], [0], [1, 1, 1, 1, 1], [-1, -1, -1, -1, -1], [1, -1, 0, 1, 1]].map(tenthsAfter), [10, 12, 8, 10, 20, 0, 14]);
  assert.deepEqual([scoreAt(638, 10), scoreAt(638, 12), scoreAt(638, 20), scoreAt(638, 0), scoreAt(333, 14)], [638, 766, 1276, 0, 466]);
  assert.deepEqual([multiple(10), multiple(14), multiple(0), multiple(20)], ["1.0×", "1.4×", "0.0×", "2.0×"]);
  assert.deepEqual([stepText(1), stepText(-1), stepText(0)], ["+0.2×", "−0.2×", "Push"]);
  assert.equal(shareText("Risk #7", [1, -1, 0, 1]), "Risk #7 · 1.2×\n🎲 🟩🟥⬜🟩");
});

test("roulette: even-money sides only, and zero beats them all", () => {
  assert.equal(new Set(DAYS.map((d) => rouletteSpin(d))).size, 37, "every pocket comes up over two years");
  assert.deepEqual([rouletteColor(0), rouletteColor(1), rouletteColor(2), rouletteColor(36)], ["green", "red", "black", "red"]);
  for (const day of DAYS) {
    const n = rouletteSpin(day), pick = (p) => outcome(day, { table: "roulette", pick: p });
    if (n === 0) { assert.deepEqual(["red", "black", "odd", "even", "low", "high"].map(pick), [-1, -1, -1, -1, -1, -1]); continue; }
    assert.equal(pick("red"), rouletteColor(n) === "red" ? 1 : -1);
    assert.equal(pick("red") + pick("black"), 0);
    assert.equal(pick("odd"), n % 2 ? 1 : -1);
    assert.equal(pick("low"), n <= 18 ? 1 : -1);
    assert.equal(pick("odd") + pick("even") + pick("low") + pick("high"), 0);
  }
  for (const bad of ["n17", "green", "d1", "toString", undefined]) assert.equal(playTable(DAYS[0], 0, { table: "roulette", pick: bad }), null);
});

test("blackjack: totals, the dealer's rule, and only hit or stand", () => {
  assert.deepEqual([handTotal([C(14), C(13)]), handTotal([C(14), C(14), C(9)]), handTotal([C(10), C(9), C(5)])], [21, 21, 24]);
  for (const day of DAYS) {
    const moves = basicMoves(day), h = blackjack(day, moves);
    assert.ok(h.done && [-1, 0, 1].includes(h.outcome), day);
    if (handTotal(h.player) <= 21 && h.player.length + h.dealer.length > 4) assert.ok(handTotal(h.dealer) >= 17 || h.dealer.length === 2, `${day}: dealer stops short of 17`);
    const p = handTotal(h.player), d = handTotal(h.dealer);
    if (p > 21) assert.equal(h.outcome, -1);
    else if (h.player.length > 2 || h.dealer.length > 2 || (p !== 21 && d !== 21)) assert.equal(h.outcome, d > 21 || p > d ? 1 : p < d ? -1 : 0, day);
    assert.equal(outcome(day, { table: "blackjack", moves }), h.outcome);
    assert.equal(blackjack(day, moves + "H"), null, "no moves after the hand is over");
    assert.equal(blackjack(day, "D"), null, "no doubling");
    if (!blackjack(day).done) {
      assert.equal(blackjack(day).dealer.length, 1, "the hole card stays hidden while the hand is open");
      assert.equal(playTable(day, 0, { table: "blackjack", moves: "" }), null, "an unfinished hand is not a result");
    }
  }
});

test("sic bo: small or big, and a triple beats both", () => {
  let triples = 0;
  for (const day of DAYS) {
    const dice = sicbo(day), total = dice[0] + dice[1] + dice[2], triple = dice[0] === dice[1] && dice[1] === dice[2];
    assert.ok(dice.length === 3 && dice.every((d) => d >= 1 && d <= 6));
    const small = outcome(day, { table: "sicbo", pick: "small" }), big = outcome(day, { table: "sicbo", pick: "big" });
    if (triple) { triples++; assert.deepEqual([small, big], [-1, -1]); }
    else assert.deepEqual([small, big], total <= 10 ? [1, -1] : [-1, 1]);
  }
  assert.ok(triples > 5 && triples < 45, `${triples} triples`);
  assert.equal(playTable(DAYS[0], 0, { table: "sicbo", pick: "t10" }), null);
});

test("baccarat: third-card rules, player or banker, and a tie is a push", () => {
  const wins = { player: 0, banker: 0, tie: 0 };
  for (const day of DAYS) {
    const b = baccarat(day);
    assert.ok(b.player.length >= 2 && b.player.length <= 3 && b.banker.length >= 2 && b.banker.length <= 3);
    if (b.player.length === 2 && b.banker.length === 2) assert.ok(Math.max(...b.totals) >= 6, `${day}: nobody drew on low totals`);
    wins[b.winner]++;
    const player = outcome(day, { table: "baccarat", pick: "player" }), banker = outcome(day, { table: "baccarat", pick: "banker" });
    assert.deepEqual([player, banker], b.winner === "tie" ? [0, 0] : b.winner === "player" ? [1, -1] : [-1, 1]);
  }
  assert.ok(wins.tie > 30 && wins.tie < 110 && wins.player > 280 && wins.banker > 280, JSON.stringify(wins));
  assert.equal(playTable(DAYS[0], 0, { table: "baccarat", pick: "tie" }), null, "no betting on the tie");
});

test("craps: the pass line is settled by the rules, and don't pass mirrors it", () => {
  let passes = 0;
  for (const day of DAYS) {
    const c = craps(day), first = c.rolls[0][0] + c.rolls[0][1], last = c.rolls.at(-1)[0] + c.rolls.at(-1)[1];
    if (c.point === null) assert.deepEqual([c.rolls.length, c.pass], [1, first === 7 || first === 11]);
    else assert.equal(last, c.pass ? c.point : 7);
    if (c.pass) passes++;
    const pass = outcome(day, { table: "craps", pick: "pass" }), dont = outcome(day, { table: "craps", pick: "dont" });
    assert.equal(pass, c.pass ? 1 : -1);
    assert.equal(dont, c.point === null && first === 12 ? 0 : -pass);
  }
  assert.ok(passes > 310 && passes < 410, `pass won ${passes} of 730`);
});

test("a day: one to five hands at any tables, in any order", () => {
  const day = DAYS[0];
  const red = { table: "roulette", pick: "red" };
  const five = playDay(day, [red, red, red, red, red]);
  assert.deepEqual(five.outcomes, [0, 1, 2, 3, 4].map((hand) => (rouletteColor(rouletteSpin(day, hand)) === "red" ? 1 : -1)));
  assert.equal(five.tenths, tenthsAfter(five.outcomes));
  assert.equal(playDay(day, [red]).outcomes.length, 1, "one hand and out is a day");
  const mixed = playDay(day, [{ table: "craps", pick: "pass" }, { table: "blackjack", moves: basicMoves(day, 1) }, { table: "sicbo", pick: "big" }]);
  assert.deepEqual(mixed.results.map((r) => r.table), ["craps", "blackjack", "sicbo"]);
  for (const bad of [null, [], Array(6).fill(red), [{ pick: "red" }], [{ table: "poker", pick: "red" }], [{ table: "baccarat", pick: "red" }], [red, null]]) {
    assert.equal(playDay(day, bad), null, JSON.stringify(bad));
  }
});

/* ---------------- API: Risk dealt by the server ---------------- */
const SECRET = "test-secret";
let env;
beforeEach(() => { env = { DB: fakeD1(), ALLOWED_ORIGINS: "", RISK_SECRET: SECRET }; });
const api = (path, body) => handleApi(new Request(`https://games.test/api${path}`, { method: "POST", body: JSON.stringify(body) }), env);
const riskCall = async (action, clientId, extra = {}) => { const res = await api(`/risk/${action}`, { day: TODAY, clientId, ...extra }); return { status: res.status, body: await res.json() }; };
/** The day's score as the server holds it: what the 'series' play would have stored. */
const seriesScore = (clientId, score) => env.DB.prepare("INSERT INTO plays (game, day, client_id, score, detail) VALUES ('series', ?1, ?2, ?3, '{}')").bind(TODAY, clientId, score).run();

test("API: Risk needs the server's secret and the day's score first", async () => {
  delete env.RISK_SECRET;
  assert.equal((await riskCall("state", "client-risk-1")).status, 503);
  env.RISK_SECRET = SECRET;
  assert.equal((await riskCall("state", "client-risk-1")).status, 409, "no series play yet");
  await seriesScore("client-risk-1", 420);
  const { status, body } = await riskCall("state", "client-risk-1");
  assert.equal(status, 200);
  assert.deepEqual(body, { base: 420, hands: [], tenths: 10, points: 420, open: null, done: false }, "the points come from the server's score, not the browser");
  assert.equal((await riskCall("state", "x")).status, 400);
});

test("API: every player gets their own hands, dealt from a secret seed", async () => {
  const a = await riskSeed(SECRET, TODAY, "client-risk-a"), b = await riskSeed(SECRET, TODAY, "client-risk-b");
  assert.notEqual(a, b, "two players, two seeds");
  assert.equal(a, await riskSeed(SECRET, TODAY, "client-risk-a"), "the same player always gets the same seed");
  assert.notEqual(a, await riskSeed("another-secret", TODAY, "client-risk-a"), "without the secret the seed can't be worked out");
  const spins = (seed) => [0, 1, 2, 3, 4].map((hand) => rouletteSpin(seed, hand)).join(",");
  assert.notEqual(spins(a), spins(b));
  assert.notEqual(spins(a), spins(TODAY), "and nobody's hands are the day's public ones");

  await seriesScore("client-risk-a", 500);
  const { status, body } = await riskCall("play", "client-risk-a", { table: "roulette", pick: "red" });
  assert.equal(status, 200);
  assert.equal(body.hands[0].number, rouletteSpin(a, 0));
  assert.equal(body.hands[0].outcome, playTable(a, 0, { table: "roulette", pick: "red" }).outcome);
});

test("API: a hand is dealt once, in order, and can't be taken back", async () => {
  await seriesScore("client-risk-c", 300);
  const seed = await riskSeed(SECRET, TODAY, "client-risk-c");
  await riskCall("play", "client-risk-c", { table: "sicbo", pick: "small" });
  const second = await riskCall("play", "client-risk-c", { table: "sicbo", pick: "big" });
  assert.equal(second.body.hands.length, 2, "asking again plays the next hand, not the same one");
  assert.deepEqual(second.body.hands[1].dice, sicbo(seed, 1));
  assert.equal((await riskCall("play", "client-risk-c", { table: "roulette", pick: "n17" })).status, 400);
  assert.equal((await riskCall("play", "client-risk-c", { table: "poker", pick: "red" })).status, 400);
  // The old way, posting a whole day of picks, is closed.
  assert.equal((await api("/games/house/plays", { day: TODAY, clientId: "client-risk-c", answers: { start: 600, plays: [{ table: "roulette", pick: "red" }] } })).status, 400);
});

test("API: blackjack is dealt card by card, and only the dealer's up card shows", async () => {
  // Find a player whose first hand isn't a natural, so there is a choice to make.
  let id = null, seed = null;
  for (let n = 0; !id; n++) { const c = `client-bj-${n}x`; const sd = await riskSeed(SECRET, TODAY, c); if (!blackjack(sd, "", 0).done) { id = c; seed = sd; } }
  await seriesScore(id, 400);
  assert.equal((await riskCall("play", id, { table: "blackjack", move: "H" })).status, 400, "deal before hitting");
  const dealt = await riskCall("play", id, { table: "blackjack" });
  assert.deepEqual(dealt.body.open.player, blackjack(seed, "", 0).player);
  assert.equal(dealt.body.open.dealer.length, 1, "the hole card stays hidden");
  assert.equal(dealt.body.hands.length, 0);
  assert.equal((await riskCall("play", id, { table: "roulette", pick: "red" })).status, 409, "finish the hand first");
  assert.equal((await riskCall("stop", id)).status, 409, "can't walk away mid-hand");
  assert.equal((await riskCall("play", id, { table: "blackjack", move: "X" })).status, 400);
  const stood = await riskCall("play", id, { table: "blackjack", move: "S" });
  assert.equal(stood.body.open, null);
  assert.equal(stood.body.hands[0].outcome, blackjack(seed, "S", 0).outcome);
});

test("API: stopping (or five hands) ends the run and records the points it made", async () => {
  await seriesScore("client-risk-d", 450);
  assert.equal((await riskCall("stop", "client-risk-d")).status, 409, "play a hand before stopping");
  const played = await riskCall("play", "client-risk-d", { table: "craps", pick: "pass" });
  const stopped = await riskCall("stop", "client-risk-d");
  assert.equal(stopped.status, 200);
  assert.equal(stopped.body.done, true);
  assert.equal(stopped.body.points, scoreAt(450, tenthsAfter(played.body.hands.map((h) => h.outcome))));
  assert.equal((await riskCall("play", "client-risk-d", { table: "craps", pick: "pass" })).status, 409, "the tables are closed");
  const row = await env.DB.prepare("SELECT score FROM plays WHERE game = 'house' AND day = ?1 AND client_id = ?2").bind(TODAY, "client-risk-d").first();
  assert.equal(row.score, stopped.body.points);

  await seriesScore("client-risk-e", 200);
  let last;
  for (let i = 0; i < HANDS; i++) last = await riskCall("play", "client-risk-e", { table: "baccarat", pick: "banker" });
  assert.equal(last.body.done, true, "five hands and the run is over");
  assert.equal(last.body.hands.length, HANDS);
});
