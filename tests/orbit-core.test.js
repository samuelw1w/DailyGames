import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { handleApi } from "../api/src/index.js";
import { fakeD1 } from "./helpers/fake-d1.js";
import { SEEDS } from "../web/games/orbit/core/levels.js";
import { WORLD, MAX_JUMPS, MAX_TICKS, makeLevel, createRun, step, replay } from "../web/games/orbit/core/sim.js";
import { solve, rate } from "../web/games/orbit/core/solver.js";
import { dailyLevel, scoreRun, resultLabel, shareText } from "../web/games/orbit/core/puzzle.js";

const dayAfter = (start, n) => { const d = new Date(`${start}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const TODAY = new Date().toISOString().slice(0, 10); // UTC today is always "today" somewhere

test("the same day always gives the same level, and the next day a different one", () => {
  assert.deepEqual(dailyLevel("2026-10-05"), dailyLevel("2026-10-05"));
  assert.equal(dailyLevel("2026-10-05").seed, SEEDS[0]);
  assert.equal(dailyLevel("2026-10-06").seed, SEEDS[1]);
  assert.equal(dailyLevel(dayAfter("2026-10-05", SEEDS.length)).seed, SEEDS[0], "the list wraps around");
});

test("every listed level is well formed", () => {
  assert.equal(new Set(SEEDS).size, SEEDS.length, "no repeated seeds");
  for (const seed of SEEDS) {
    const level = makeLevel(seed);
    assert.ok(level, `seed ${seed} builds`);
    assert.ok(level.planets.length >= 5 && level.planets.length <= 7, `seed ${seed}: planet count`);
    assert.equal(level.planets.filter((p) => p.goal).length, 1);
    assert.ok(level.planets[level.goal].goal);
    level.planets.forEach((p, i) => {
      assert.ok(p.x - p.r >= 0 && p.x + p.r <= WORLD.w && p.y - p.r >= 0 && p.y + p.r <= WORLD.h, `seed ${seed}: planet ${i} on the map`);
      for (const q of level.planets.slice(i + 1)) assert.ok(Math.hypot(p.x - q.x, p.y - q.y) > p.r + q.r, `seed ${seed}: rings overlap`);
    });
  }
});

test("every listed level is fair: winnable in 3 or 4 jumps through generous windows", () => {
  for (const seed of SEEDS) {
    const rating = rate(makeLevel(seed));
    assert.ok(rating, `seed ${seed} is no longer fair; run npm run orbit:levels`);
    assert.ok(rating.par >= 3 && rating.par <= 4 && rating.best >= 2);
  }
});

test("replaying a solution wins, and the same taps always give the same run", () => {
  const level = dailyLevel("2026-10-05");
  const { taps, jumps } = solve(level);
  const a = replay(level, taps), b = replay(level, taps);
  assert.deepEqual(a, b);
  assert.equal(a.done, "win");
  assert.equal(a.jumps, jumps);
  assert.equal(a.outcomes.at(-1), "goal");
  assert.equal(scoreRun(a), MAX_JUMPS + 1 - jumps);
});

test("a miss costs a jump and puts the ship back; five misses lose", () => {
  const level = dailyLevel("2026-10-05");
  const run = createRun(level);
  // Find a launch tick that misses everything, then use it.
  let missTick = 0;
  for (let t = 1; t <= 300 && !missTick; t++) if (replay(level, [t])?.outcomes[0] === "miss") missTick = t;
  assert.ok(missTick, "some launch misses");
  for (let t = 1; t < missTick; t++) step(level, run, false);
  const spot = [run.x, run.y];
  assert.equal(step(level, run, true), "launch");
  assert.equal(step(level, run, true), null, "a tap in flight does nothing");
  while (run.at < 0) step(level, run, false);
  assert.deepEqual([run.x, run.y, run.jumps, run.outcomes], [...spot, 1, ["miss"]]);

  while (!run.done) step(level, run, run.at >= 0);
  assert.equal(run.done, "fail");
  assert.equal(run.jumps, MAX_JUMPS);
  assert.equal(scoreRun(run), 0);
});

test("replay rejects taps that could not have happened", () => {
  const level = dailyLevel("2026-10-05");
  const { taps } = solve(level);
  assert.equal(replay(level, [taps[0], taps[0] + 1]), null, "second tap lands mid-flight");
  assert.equal(replay(level, [...taps, taps.at(-1) + 500]), null, "tap after the run was over");
  const idle = replay(level, []);
  assert.deepEqual([idle.done, idle.tick, idle.jumps], ["fail", MAX_TICKS, 0], "never tapping runs out the clock");
});

test("labels and share text", () => {
  assert.equal(resultLabel({ won: true, jumps: 3 }), "3 jumps");
  assert.equal(resultLabel({ won: true, jumps: 1, assist: true }), "1 jump 🐢");
  assert.equal(resultLabel({ won: false, jumps: 5 }), "Lost");
  assert.equal(shareText("Orbit #7", { won: true, jumps: 3, outcomes: ["hop", "miss", "goal"], assist: false }), "Orbit #7 · 3/5 jumps\n🪐💨🏁");
  assert.match(shareText("Orbit #7", { won: false, jumps: 5, outcomes: ["miss"], assist: true }), /X\/5 jumps 🐢/);
});

/* ---------------- API ---------------- */
let env;
beforeEach(() => { env = { DB: fakeD1(), ALLOWED_ORIGINS: "" }; });
const post = (body) => handleApi(new Request("https://games.test/api/games/orbit/plays", { method: "POST", body: JSON.stringify(body) }), env);

test("API: a play is replayed and scored by the server", async () => {
  const { taps, jumps } = solve(dailyLevel(TODAY));
  const res = await post({ day: TODAY, clientId: "client-orbit-1", answers: { taps, assist: false } });
  assert.equal(res.status, 201);
  assert.equal((await res.json()).score, MAX_JUMPS + 1 - jumps);

  const stats = await (await handleApi(new Request(`https://games.test/api/games/orbit/days/${TODAY}/stats`), env)).json();
  assert.equal(stats.players, 1);
  assert.equal(stats.rounds.at(-1).top[0].answer, "goal");
});

test("API: bad taps are rejected with a 400", async () => {
  const { taps } = solve(dailyLevel(TODAY));
  for (const answers of [
    taps,
    { taps },
    { taps: [taps[0], taps[0]], assist: false },
    { taps: [1.5], assist: false },
    { taps: [1, 2, 3, 4, 5, 6], assist: false },
    { taps: [taps[0], taps[0] + 1], assist: false },
    { taps: [MAX_TICKS + 1], assist: false },
  ]) {
    const res = await post({ day: TODAY, clientId: "client-orbit-2", answers });
    assert.equal(res.status, 400, JSON.stringify(answers));
  }
});
