import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { handleApi } from "../api/src/index.js";
import { fakeD1 } from "./helpers/fake-d1.js";
import { SEEDS } from "../web/games/pegs/core/levels.js";
import { WORLD, BALLS, TARGETS, PEG_R, LAUNCH_Y, makeField, launcherX, dropBall, stepBall, createGame, playGame } from "../web/games/pegs/core/sim.js";
import { solve, isFair } from "../web/games/pegs/core/solver.js";
import { MAX_SCORE, dailyField, resultOf, resultLabel, shareText } from "../web/games/pegs/core/puzzle.js";

const dayAfter = (start, n) => { const d = new Date(`${start}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const TODAY = new Date().toISOString().slice(0, 10); // UTC today is always "today" somewhere

test("the same day always gives the same field, and the next day a different one", () => {
  assert.deepEqual(dailyField("2026-10-05"), dailyField("2026-10-05"));
  assert.equal(dailyField("2026-10-05").seed, SEEDS[0]);
  assert.equal(dailyField("2026-10-06").seed, SEEDS[1]);
  assert.equal(dailyField(dayAfter("2026-10-05", SEEDS.length)).seed, SEEDS[0], "the list wraps around");
});

test("every listed field is well formed and can be cleared with a ball to spare", () => {
  assert.equal(new Set(SEEDS).size, SEEDS.length, "no repeated seeds");
  for (const seed of SEEDS) {
    const field = makeField(seed);
    assert.ok(field, `seed ${seed} builds`);
    assert.equal(field.pegs.filter((p) => p.target).length, TARGETS);
    assert.equal(field.period % 2, 0);
    for (const p of field.pegs) {
      assert.ok(p.x > PEG_R && p.x < WORLD.w - PEG_R && p.y > LAUNCH_Y + 40 && p.y < WORLD.h - PEG_R, `seed ${seed}: peg on the field`);
    }
    assert.ok(isFair(field), `seed ${seed} is no longer fair; run npm run pegs:levels`);
  }
});

test("the launcher slides wall to wall and back", () => {
  const field = dailyField("2026-10-05");
  assert.equal(launcherX(field, 0), 30);
  assert.equal(launcherX(field, field.period / 2), WORLD.w - 30);
  assert.equal(launcherX(field, 1), launcherX(field, field.period - 1));
});

test("a ball dropped on the same tick always takes the same path, and struck pegs go", () => {
  const field = dailyField("2026-10-05");
  const run = (i) => { const alive = field.pegs.map(() => true), ball = dropBall(field, i); while (!ball.done) stepBall(field, alive, ball); return { ball, alive }; };
  assert.deepEqual(run(40), run(40));
  let any = false;
  for (let i = 0; i < field.period; i += 7) {
    const { ball, alive } = run(i);
    assert.ok(ball.y > WORLD.h, "the ball always falls out of the bottom");
    assert.equal(new Set(ball.hits).size, ball.hits.length, "no peg is struck twice");
    assert.deepEqual(alive.map((up, n) => (up ? null : n)).filter((n) => n !== null).sort((a, b) => a - b), [...ball.hits].sort((a, b) => a - b));
    any ||= ball.hits.length > 0;
  }
  assert.ok(any);
});

test("replaying a solution clears the field; scoring rewards spare balls", () => {
  const field = dailyField("2026-10-05");
  const drops = solve(field);
  const game = playGame(field, drops);
  assert.ok(game.done);
  const result = resultOf(game);
  assert.deepEqual([result.cleared, result.used], [TARGETS, drops.length]);
  assert.equal(result.total, TARGETS + 2 * (BALLS - drops.length));
  assert.ok(result.total <= MAX_SCORE);
  assert.equal(playGame(field, [...drops, 0]), null, "no drops after the field is clear");
  assert.equal(playGame(field, drops.slice(0, -1)), null, "an unfinished game is not a result");
  for (const bad of [null, [1.5], [-1], [field.period], [0, 0, 0, 0, 0, 0]]) assert.equal(playGame(field, bad), null, JSON.stringify(bad));
  assert.ok(createGame(field).alive.every(Boolean));
});

test("labels and share text", () => {
  assert.equal(resultLabel({ cleared: 10, used: 3 }), "10/10 in 3");
  assert.equal(resultLabel({ cleared: 7, used: 5, assist: true }), "7/10 🐢");
  assert.equal(shareText("Pegs #7", { cleared: 10, used: 3, perBall: [4, 3, 3], assist: false }), "Pegs #7 · 10/10 pegs · 3 balls\n🟡 4 · 3 · 3");
});

/* ---------------- API ---------------- */
let env;
beforeEach(() => { env = { DB: fakeD1(), ALLOWED_ORIGINS: "" }; });
const post = (body) => handleApi(new Request("https://games.test/api/games/pegs/plays", { method: "POST", body: JSON.stringify(body) }), env);

test("API: every ball is dropped again and the game scored by the server", async () => {
  const field = dailyField(TODAY), drops = solve(field);
  const res = await post({ day: TODAY, clientId: "client-pegs-1", answers: { drops, assist: false } });
  assert.equal(res.status, 201);
  assert.equal((await res.json()).score, TARGETS + 2 * (BALLS - drops.length));
  for (const answers of [drops, { drops }, { drops: drops.slice(0, -1), assist: false }, { drops: [field.period], assist: false }]) {
    assert.equal((await post({ day: TODAY, clientId: "client-pegs-2", answers })).status, 400, JSON.stringify(answers));
  }
});
