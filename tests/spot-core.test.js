import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { handleApi } from "../api/src/index.js";
import { fakeD1 } from "./helpers/fake-d1.js";
import { GOAL, KICKS, CLOCK, dailyGame, reticleAt, keeperAt, shoot, playGame, scoreOf, shareText } from "../web/games/spot/core/sim.js";

const dayAfter = (start, n) => { const d = new Date(`${start}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const TODAY = new Date().toISOString().slice(0, 10); // UTC today is always "today" somewhere
/** For each kick, the first tick that gives `outcome` (or null). */
const ticksFor = (game, outcome) => Array.from({ length: KICKS }, (_, k) => {
  for (let t = 1; t <= CLOCK; t++) if (shoot(game, k, t).outcome === outcome) return t;
  return null;
});

test("the same day always gives the same shootout", () => {
  assert.deepEqual(dailyGame("2026-10-05"), dailyGame("2026-10-05"));
  assert.notDeepEqual(dailyGame("2026-10-05"), dailyGame("2026-10-06"));
});

test("every day for two years is fair: each kick can be scored and can be saved", () => {
  for (let i = 0; i < 730; i++) {
    const day = dayAfter("2026-10-05", i), game = dailyGame(day);
    assert.ok(game.keeper.period <= 300, `${day}: the keeper's routine is short enough to watch through`);
    for (let k = 0; k < KICKS; k++) {
      let goals = 0, saves = 0, widest = 0, run = 0;
      for (let t = 1; t <= CLOCK; t++) {
        const { outcome } = shoot(game, k, t);
        if (outcome === "goal") { goals++; run++; widest = Math.max(widest, run); } else run = 0;
        if (outcome === "saved") saves++;
      }
      assert.ok(widest >= 7, `${day} kick ${k + 1}: no scoring chance lasts a tenth of a second`);
      assert.ok(goals / CLOCK < 0.5 && saves > 0, `${day} kick ${k + 1}: the keeper is no obstacle`);
    }
  }
});

test("the keeper repeats his routine and stays on his line", () => {
  const game = dailyGame("2026-10-05");
  for (let t = 0; t < CLOCK; t++) {
    const a = keeperAt(game, t), b = keeperAt(game, t + game.keeper.period);
    assert.deepEqual(a, b);
    assert.ok(a.x > GOAL.left && a.x < GOAL.right);
    assert.ok(Math.abs(keeperAt(game, t + 1).x - a.x) <= 7, "no teleporting");
  }
});

test("shots: at the keeper is saved, outside the frame misses, and the reticle moves smoothly", () => {
  const game = dailyGame("2026-10-05");
  const seen = new Set();
  for (let k = 0; k < KICKS; k++) {
    for (let t = 1; t <= CLOCK; t++) {
      const { outcome, aim, target, keeper } = shoot(game, k, t);
      seen.add(outcome);
      const inFrame = target[0] >= GOAL.left && target[0] <= GOAL.right && target[1] >= GOAL.top;
      assert.equal(outcome === "wide" || outcome === "over", !inFrame);
      if (inFrame && Math.abs(target[0] - keeper.x) < 60 && target[1] > GOAL.top + 40) assert.equal(outcome, "saved", "straight at him");
      const next = reticleAt(game, k, t + 1);
      assert.ok(Math.abs(next[0] - aim[0]) < 20 && Math.abs(next[1] - aim[1]) < 20);
      assert.equal(target[0] - aim[0], game.wind * 16, "the wind carries the ball");
    }
  }
  assert.deepEqual([...seen].sort(), ["goal", "over", "saved", "wide"]);
});

test("replay, score and share text", () => {
  const game = dailyGame("2026-10-05");
  const goals = ticksFor(game, "goal"), saves = ticksFor(game, "saved");
  assert.deepEqual(playGame(game, goals), Array(KICKS).fill("goal"));
  const mixed = playGame(game, [goals[0], saves[1], goals[2], saves[3], goals[4]]);
  assert.equal(scoreOf(mixed), 3);
  assert.equal(shareText("Spot #7", mixed, false), "Spot #7 · 3/5\n⚽ 🟩🟥🟩🟥🟩");
  assert.match(shareText("Spot #7", mixed, true), /3\/5 🐢/);
  for (const bad of [null, goals.slice(1), [...goals, 5], [0, 1, 1, 1, 1], [1.5, 1, 1, 1, 1], [CLOCK + 1, 1, 1, 1, 1]]) assert.equal(playGame(game, bad), null);
});

/* ---------------- API ---------------- */
let env;
beforeEach(() => { env = { DB: fakeD1(), ALLOWED_ORIGINS: "" }; });
const post = (body) => handleApi(new Request("https://games.test/api/games/spot/plays", { method: "POST", body: JSON.stringify(body) }), env);

test("API: kicks are decided and scored by the server", async () => {
  const game = dailyGame(TODAY);
  const goals = ticksFor(game, "goal"), saves = ticksFor(game, "saved");
  const res = await post({ day: TODAY, clientId: "client-spot-1", answers: { ticks: [goals[0], goals[1], saves[2], goals[3], goals[4]], assist: true } });
  assert.equal(res.status, 201);
  assert.equal((await res.json()).score, 4);

  const stats = await (await handleApi(new Request(`https://games.test/api/games/spot/days/${TODAY}/stats`), env)).json();
  assert.deepEqual(stats.rounds.map((r) => r.top[0].answer), ["goal", "goal", "saved", "goal", "goal"]);

  for (const answers of [goals, { ticks: goals }, { ticks: goals.slice(1), assist: false }, { ticks: [0, 1, 1, 1, 1], assist: false }]) {
    assert.equal((await post({ day: TODAY, clientId: "client-spot-2", answers })).status, 400, JSON.stringify(answers));
  }
});
