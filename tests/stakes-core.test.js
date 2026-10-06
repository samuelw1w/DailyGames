import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { handleApi } from "../api/src/index.js";
import { fakeD1 } from "./helpers/fake-d1.js";
import {
  START, TABLES, rouletteSpin, rouletteColor, handTotal, blackjack, baccarat, rank3, pokerDeal, pokerResult, craps,
  playTable, playDay, multiple, resultLabel, shareText,
} from "../web/games/stakes/core/tables.js";

const dayAfter = (start, n) => { const d = new Date(`${start}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const TODAY = new Date().toISOString().slice(0, 10); // UTC today is always "today" somewhere
const C = (r, s = 0) => ({ r, s });
const DAYS = Array.from({ length: 730 }, (_, i) => dayAfter("2026-10-05", i));
/** Play blackjack by the simplest rule there is: hit below 17. Returns the moves. */
function basicMoves(day) {
  let moves = "";
  for (let h = blackjack(day); !h.done; h = blackjack(day, moves)) moves += handTotal(h.player) < 17 ? "H" : "S";
  return moves;
}
/** A legal, cautious day: the smallest bet at every table. */
const cautious = (day) => [{ bet: 1, pick: "red" }, { bet: 1, moves: basicMoves(day) }, { bet: 1, pick: "banker" }, { bet: 1, play: true }, { bet: 1, pick: "pass" }];

test("the same day always deals the same five tables", () => {
  const day = "2026-10-05";
  assert.equal(rouletteSpin(day), rouletteSpin(day));
  assert.deepEqual(blackjack(day), blackjack(day));
  assert.deepEqual(baccarat(day), baccarat(day));
  assert.deepEqual(pokerDeal(day), pokerDeal(day));
  assert.deepEqual(craps(day), craps(day));
  assert.deepEqual(TABLES, ["roulette", "blackjack", "baccarat", "poker", "craps"]);
});

test("roulette: single zero, and every pocket comes up over two years", () => {
  const seen = new Set(DAYS.map(rouletteSpin));
  assert.equal(seen.size, 37);
  assert.deepEqual([rouletteColor(0), rouletteColor(1), rouletteColor(2), rouletteColor(36)], ["green", "red", "black", "red"]);
  const day = DAYS[0], n = rouletteSpin(day), color = rouletteColor(n);
  assert.equal(playTable(day, 0, 100, { bet: 10, pick: `n${n}` }).delta, 350);
  assert.equal(playTable(day, 0, 100, { bet: 10, pick: `n${(n + 1) % 37}` }).delta, -10);
  if (color !== "green") assert.equal(playTable(day, 0, 100, { bet: 10, pick: color }).delta, 10);
  assert.equal(playTable(day, 0, 100, { bet: 10, pick: color === "red" ? "black" : "red" }).delta, -10);
});

test("blackjack: totals, the dealer's rule, and which moves are allowed", () => {
  assert.equal(handTotal([C(14), C(13)]), 21);
  assert.equal(handTotal([C(14), C(14), C(9)]), 21);
  assert.equal(handTotal([C(10), C(9), C(5)]), 24);
  for (const day of DAYS) {
    const moves = basicMoves(day), h = blackjack(day, moves);
    assert.ok(h.done, day);
    assert.ok([-1, 0, 1, 1.5].includes(h.units), `${day}: ${h.units}`);
    if (handTotal(h.player) <= 21 && h.player.length + h.dealer.length > 4) assert.ok(handTotal(h.dealer) >= 17 || h.dealer.length === 2, `${day}: dealer stops short of 17`);
    assert.equal(blackjack(day, moves + "H"), null, "no moves after the hand is over");
    assert.equal(blackjack(day, "X"), null);
    if (!blackjack(day).done) {
      assert.equal(blackjack(day).dealer.length, 1, "the hole card stays hidden while the hand is open");
      assert.equal(blackjack(day, "HD"), null, "doubling is only a first move");
      assert.equal(Math.abs(blackjack(day, "D").units) % 2, 0, "a double wins or loses two bets");
      assert.equal(playTable(day, 1, 15, { bet: 10, moves: "D" }), null, "can't double without the money");
    }
  }
});

test("baccarat: third-card rules give legal hands and sensible odds", () => {
  const wins = { player: 0, banker: 0, tie: 0 };
  for (const day of DAYS) {
    const b = baccarat(day);
    assert.ok(b.player.length >= 2 && b.player.length <= 3 && b.banker.length >= 2 && b.banker.length <= 3);
    assert.ok(b.totals.every((t) => t >= 0 && t <= 9));
    if (b.player.length === 2 && b.banker.length === 2) assert.ok(Math.max(...b.totals) >= 6, `${day}: nobody drew on low totals`);
    wins[b.winner]++;
  }
  assert.ok(wins.tie > 30 && wins.tie < 110 && wins.player > 280 && wins.banker > 280, JSON.stringify(wins));
  const day = DAYS[0], { winner } = baccarat(day);
  assert.equal(playTable(day, 2, 100, { bet: 20, pick: "tie" }).delta, winner === "tie" ? 160 : -20);
  assert.equal(playTable(day, 2, 100, { bet: 20, pick: "banker" }).delta, winner === "banker" ? 19 : winner === "tie" ? 0 : -20);
});

test("three card poker: hand ranks and how the bets settle", () => {
  const cat = (...cards) => rank3(cards)[0];
  assert.deepEqual([cat(C(14, 0), C(2, 0), C(3, 0)), cat(C(9, 0), C(9, 1), C(9, 2)), cat(C(5, 0), C(6, 1), C(7, 2)), cat(C(5, 0), C(9, 0), C(13, 0)), cat(C(5, 0), C(5, 1), C(13, 0)), cat(C(5, 0), C(8, 1), C(13, 0))], [5, 4, 3, 2, 1, 0]);
  for (const day of DAYS) {
    const played = pokerResult(day, 10, 10, true);
    assert.equal(pokerResult(day, 10, 10, false).delta, -10, "folding loses the first bet");
    assert.ok({ win: 20, lose: -20, tie: 0, unqualified: 10 }[played.outcome] === played.delta, `${day}: ${played.outcome} ${played.delta}`);
    assert.equal(played.outcome === "unqualified", !played.qualifies);
    assert.equal(playTable(day, 3, 15, { bet: 10, play: true }).delta, { win: 15, lose: -15, tie: 0, unqualified: 10 }[played.outcome], "short of the second bet, you play for what you have");
  }
});

test("craps: the pass line is settled by the rules, and don't pass mirrors it", () => {
  let passes = 0;
  for (const day of DAYS) {
    const c = craps(day), first = c.rolls[0][0] + c.rolls[0][1], last = c.rolls.at(-1)[0] + c.rolls.at(-1)[1];
    assert.ok(c.rolls.every(([a, b]) => a >= 1 && a <= 6 && b >= 1 && b <= 6));
    if (c.point === null) assert.deepEqual([c.rolls.length, c.pass], [1, first === 7 || first === 11]);
    else assert.equal(last, c.pass ? c.point : 7);
    if (c.pass) passes++;
    const pass = playTable(day, 4, 100, { bet: 10, pick: "pass" }).delta, dont = playTable(day, 4, 100, { bet: 10, pick: "dont" }).delta;
    assert.equal(dont, c.point === null && first === 12 ? 0 : -pass);
  }
  assert.ok(passes > 310 && passes < 410, `pass won ${passes} of 730`);
});

test("a day: the bankroll carries on, bets must be affordable, and going bust ends it", () => {
  const day = DAYS[0];
  const full = playDay(day, cautious(day));
  assert.equal(full.results.length, 5);
  assert.equal(full.bankroll, START + full.results.reduce((sum, r) => sum + r.delta, 0));
  assert.equal(playDay(day, cautious(day).slice(0, 4)), null, "four tables is not a day");
  for (const bad of [null, [], [{ bet: 101, pick: "red" }], [{ bet: 0, pick: "red" }], [{ bet: 1.5, pick: "red" }], [{ bet: 10, pick: "n37" }], [{ bet: 10, pick: "purple" }], [{ bet: 10 }]]) {
    assert.equal(playDay(day, bad), null, JSON.stringify(bad));
  }
  const loser = rouletteColor(rouletteSpin(day)) === "red" ? "black" : "red";
  assert.deepEqual(playDay(day, [{ bet: START, pick: loser }]), { bankroll: 0, bust: true, results: playDay(day, [{ bet: START, pick: loser }]).results });
  assert.equal(playDay(day, [{ bet: START, pick: loser }, { bet: 1, moves: "S" }]), null, "nothing to bet after going bust");
});

test("labels and share text", () => {
  assert.deepEqual([multiple(240), multiple(100), multiple(3600), multiple(55)], ["2.4×", "1×", "36×", "0.5×"]);
  assert.equal(resultLabel({ bankroll: 0, bust: true }), "Bust");
  assert.equal(shareText("Stakes #7", { bankroll: 240, deltas: [10, -5, 0, 100, 35], bust: false }), "Stakes #7 · 2.4×\n🎲 🟩🟥⬜🟩🟩 100 → 240");
});

/* ---------------- API ---------------- */
let env;
beforeEach(() => { env = { DB: fakeD1(), ALLOWED_ORIGINS: "" }; });
const post = (body) => handleApi(new Request("https://games.test/api/games/stakes/plays", { method: "POST", body: JSON.stringify(body) }), env);

test("API: the day is dealt again and the bankroll worked out by the server", async () => {
  const plays = cautious(TODAY);
  const res = await post({ day: TODAY, clientId: "client-stakes-1", answers: { plays } });
  assert.equal(res.status, 201);
  assert.equal((await res.json()).score, playDay(TODAY, plays).bankroll);
  for (const answers of [plays, { plays: plays.slice(0, 3) }, { plays: [{ bet: 500, pick: "red" }] }]) {
    assert.equal((await post({ day: TODAY, clientId: "client-stakes-2", answers })).status, 400, JSON.stringify(answers));
  }
});
