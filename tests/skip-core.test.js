import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { handleApi } from "../api/src/index.js";
import { fakeD1 } from "./helpers/fake-d1.js";
import { MAX_SKIPS, STONES, FIRST_TOUCH, dailyWater, touches, windowAt, countSkips, playGame, bestOf, resultLabel, shareText } from "../web/games/skip/core/sim.js";

const dayAfter = (start, n) => { const d = new Date(`${start}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const TODAY = new Date().toISOString().slice(0, 10); // UTC today is always "today" somewhere

test("the same day always gives the same water", () => {
  assert.deepEqual(dailyWater("2026-10-05"), dailyWater("2026-10-05"));
  assert.deepEqual(touches(dailyWater("2026-10-05")), touches(dailyWater("2026-10-05")));
});

test("every day for two years is playable: touches never crowd each other", () => {
  for (let i = 0; i < 730; i++) {
    const day = dayAfter("2026-10-05", i), ticks = touches(dailyWater(day));
    assert.equal(ticks.length, MAX_SKIPS + 1);
    assert.equal(ticks[0], FIRST_TOUCH);
    for (let n = 1; n < ticks.length; n++) {
      const gap = ticks[n] - ticks[n - 1];
      assert.ok(gap >= 14, `${day}: hop ${n} is only ${gap} ticks`);
      assert.ok(windowAt(n - 1) + windowAt(n) < gap, `${day}: the windows around touches ${n - 1} and ${n} overlap`);
    }
  }
});

test("the window shrinks with every skip, down to a floor", () => {
  assert.equal(windowAt(0), 9);
  for (let n = 1; n < MAX_SKIPS; n++) assert.ok(windowAt(n) <= windowAt(n - 1));
  assert.ok(windowAt(5) < 7 && windowAt(MAX_SKIPS - 1) >= 1.5);
});

test("counting skips", () => {
  const water = dailyWater("2026-10-05"), ticks = touches(water);
  assert.equal(countSkips(water, ticks.slice(0, MAX_SKIPS)), MAX_SKIPS, "perfect timing skips all the way");
  assert.equal(countSkips(water, ticks.slice(0, 7)), 7, "stops tapping after seven");
  assert.equal(countSkips(water, []), 0);
  assert.equal(countSkips(water, [ticks[0] + 9, ticks[1] - 8]), 2, "inside the window, early or late");
  assert.equal(countSkips(water, [ticks[0] + 10]), 0, "just outside it");
  assert.equal(countSkips(water, [ticks[0], ticks[1], ticks[2] - 20, ticks[2], ticks[3]]), 2, "one wild tap sinks the stone");
  assert.equal(countSkips(water, [ticks[20] + 5]), 0, "can't join in halfway");
});

test("a day is three stones, best one counts", () => {
  const water = dailyWater("2026-10-05"), ticks = touches(water);
  const counts = playGame(water, [ticks.slice(0, 3), [], ticks.slice(0, 11)]);
  assert.deepEqual(counts, [3, 0, 11]);
  assert.equal(bestOf(counts), 11);
  assert.equal(resultLabel(1, false), "1 skip");
  assert.equal(shareText("Skip #7", counts, true), "Skip #7 · 11 skips 🐢\n🪨 3 · 0 · 11");
  for (const bad of [null, [[], []], [[], [], [], []], [[5, 5], [], []], [[0], [], []], [[1.5], [], []], [["9"], [], []], [[], [], [99999]]]) {
    assert.equal(playGame(water, bad), null, JSON.stringify(bad));
  }
});

/* ---------------- API ---------------- */
let env;
beforeEach(() => { env = { DB: fakeD1(), ALLOWED_ORIGINS: "" }; });
const post = (body) => handleApi(new Request("https://games.test/api/games/skip/plays", { method: "POST", body: JSON.stringify(body) }), env);

test("API: skips are counted by the server", async () => {
  const ticks = touches(dailyWater(TODAY));
  const throws = [ticks.slice(0, 4), ticks.slice(0, 9), [ticks[0] + 30]];
  const res = await post({ day: TODAY, clientId: "client-skip-1", answers: { throws, assist: false } });
  assert.equal(res.status, 201);
  assert.equal((await res.json()).score, 9);
  assert.equal(STONES, 3);

  for (const answers of [throws, { throws }, { throws: throws.slice(1), assist: false }, { throws: [[3, 2], [], []], assist: false }]) {
    assert.equal((await post({ day: TODAY, clientId: "client-skip-2", answers })).status, 400, JSON.stringify(answers));
  }
});
