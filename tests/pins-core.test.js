import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { handleApi } from "../api/src/index.js";
import { fakeD1 } from "./helpers/fake-d1.js";
import { LANE, SPOTS, BALL_R, dailyLane, posAt, hookAt, hookStart, aimPoint, createShot, stepShot, downed } from "../web/games/pins/core/sim.js";
import { MAX_SCORE, createGame, applyRoll, playGame, scoreGame, shareText } from "../web/games/pins/core/puzzle.js";

const dayAfter = (start, n) => { const d = new Date(`${start}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const TODAY = new Date().toISOString().slice(0, 10); // UTC today is always "today" somewhere
const ALL = Array(10).fill(true);
const roll = (lane, standing, pos, hook) => { const shot = createShot(lane, standing, pos, hook); while (!shot.done) stepShot(shot); return shot; };
const count = (shot) => downed(shot).filter(Boolean).length;
const knock = (n) => ALL.map((_, i) => i < n);

/** The first throw found that knocks down exactly `want` pins, as { pos, hook }, or null. */
function findThrow(lane, want, standing = ALL) {
  for (let pos = 0; pos < lane.posPeriod; pos++) {
    for (let hook = 0; hook < lane.hookPeriod; hook += 4) if (count(roll(lane, standing, pos, hook)) === want) return { pos, hook };
  }
  return null;
}

test("the same day always gives the same lane, and lanes are well formed", () => {
  assert.deepEqual(dailyLane("2026-10-05"), dailyLane("2026-10-05"));
  for (let i = 0; i < 730; i++) {
    const lane = dailyLane(dayAfter("2026-10-05", i));
    assert.equal(lane.posPeriod % 2, 0);
    assert.equal(lane.hookPeriod % 4, 0);
    assert.ok(lane.drift >= -3 && lane.drift <= 3);
    assert.equal(hookAt(lane, hookStart(lane)), 0, "the hook meter starts at straight");
    assert.ok(posAt(lane, 0) - BALL_R > LANE.left && posAt(lane, lane.posPeriod / 2) + BALL_R < LANE.right);
  }
});

test("the same two taps always knock down the same pins", () => {
  const lane = dailyLane("2026-10-05");
  assert.deepEqual(roll(lane, ALL, 40, 50), roll(lane, ALL, 40, 50));
});

test("the aim line follows the path the ball really takes", () => {
  const lane = { posPeriod: 160, hookPeriod: 140, drift: 2 };
  const shot = createShot(lane, ALL, 30, 100);
  for (let t = 1; t <= 30; t++) {
    stepShot(shot);
    const [x, y] = aimPoint(lane, 30, 100, t);
    assert.ok(Math.abs(x - shot.ball.x) < 1e-9 && Math.abs(y - shot.ball.y) < 1e-9, `tick ${t}`);
  }
});

test("every day has a strike in it, and a wild throw finds the gutter", () => {
  for (let i = 0; i < 60; i++) {
    const day = dayAfter("2026-10-05", i), lane = dailyLane(day);
    assert.ok(findThrow(lane, 10), `${day}: no strike possible`);
  }
  const lane = { posPeriod: 160, hookPeriod: 140, drift: 0 };
  const wide = roll(lane, ALL, 0, 0); // far left, hooking further left
  assert.ok(wide.gutter);
  assert.equal(count(wide), 0);
});

test("pins that are already down stay out of the way", () => {
  const lane = { posPeriod: 160, hookPeriod: 140, drift: 0 };
  const onlyHead = ALL.map((_, i) => i === 0);
  const hit = findThrow(lane, 1, onlyHead);
  assert.deepEqual(downed(roll(lane, onlyHead, hit.pos, hit.hook)), onlyHead);
  assert.equal(SPOTS.length, 10);
});

test("scoring follows bowling rules over three frames", () => {
  assert.equal(scoreGame([10, 10, 10, 10, 10]).total, MAX_SCORE);
  assert.deepEqual(scoreGame([10, 7, 3, 10, 9, 1]).frames, [{ marks: "X", score: 20 }, { marks: "7/", score: 40 }, { marks: "X9/", score: 60 }]);
  assert.deepEqual(scoreGame([0, 1, 10, 8, 2, 0]).frames.map((f) => f.marks), ["-1", "X", "8/-"]);
  assert.equal(scoreGame([3, 4, 5, 2, 0, 0]).total, 14);
  // Mid-game: a strike's score waits for the two balls after it.
  assert.deepEqual(scoreGame([7, 2, 10]).frames.map((f) => f.score), [9, null, null]);
});

test("frames: strikes skip the second ball, and the last frame earns extra balls", () => {
  const balls = (rolls) => { const g = createGame(); let n = 0; for (const r of rolls) { assert.ok(!g.done); applyRoll(g, g.standing.map((up, i) => up && g.standing.slice(0, i + 1).filter(Boolean).length <= r)); n++; } return [g.done, n]; };
  assert.deepEqual(balls([10, 10, 10, 10, 10]), [true, 5]);
  assert.deepEqual(balls([3, 4, 5, 2, 6, 1]), [true, 6]);
  assert.deepEqual(balls([3, 4, 5, 2, 6, 4, 9]), [true, 7], "a spare in the last frame earns one more ball");
  assert.deepEqual(balls([10, 10, 10, 4]), [false, 4], "a strike in the last frame earns two more");
  const g = createGame();
  applyRoll(g, knock(4));
  assert.deepEqual(g.standing, ALL.map((_, i) => i >= 4), "second ball faces what's left");
});

test("share text lines up marks and running scores", () => {
  assert.equal(shareText("Pins #7", [10, 7, 3, 10, 9, 1], false), "Pins #7 · 60/90\n🎳 X   7/  X9/\n   20  40  60");
  assert.match(shareText("Pins #7", [0, 0, 0, 0, 0, 0], true), /0\/90 🐢/);
});

/* ---------------- API ---------------- */
let env;
beforeEach(() => { env = { DB: fakeD1(), ALLOWED_ORIGINS: "" }; });
const post = (body) => handleApi(new Request("https://games.test/api/games/pins/plays", { method: "POST", body: JSON.stringify(body) }), env);

test("API: a game is rolled again and scored by the server", async () => {
  const lane = dailyLane(TODAY);
  const { pos, hook } = findThrow(lane, 10);
  const balls = Array(5).fill([pos, hook]); // the same strike five times
  assert.equal(playGame(lane, balls).rolls.length, 5);
  const res = await post({ day: TODAY, clientId: "client-pins-1", answers: { balls, assist: false } });
  assert.equal(res.status, 201);
  assert.equal((await res.json()).score, MAX_SCORE);

  const stats = await (await handleApi(new Request(`https://games.test/api/games/pins/days/${TODAY}/stats`), env)).json();
  assert.equal(stats.histogram[9], 1);
  assert.deepEqual(stats.rounds.map((r) => r.top[0].answer), ["X", "X", "XXX"]);
});

test("API: incomplete or malformed games are rejected with a 400", async () => {
  const lane = dailyLane(TODAY);
  const { pos, hook } = findThrow(lane, 10);
  const strike = [pos, hook];
  for (const answers of [
    [strike],
    { balls: Array(5).fill(strike) },
    { balls: Array(4).fill(strike), assist: false },
    { balls: Array(6).fill(strike), assist: false },
    { balls: [[lane.posPeriod, 0]], assist: false },
    { balls: [[1.5, 0]], assist: false },
    { balls: [[1, 2, 3]], assist: false },
  ]) {
    const res = await post({ day: TODAY, clientId: "client-pins-2", answers });
    assert.equal(res.status, 400, JSON.stringify(answers));
  }
});
