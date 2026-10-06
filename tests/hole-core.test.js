import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { handleApi } from "../api/src/index.js";
import { fakeD1 } from "./helpers/fake-d1.js";
import {
  GREEN, AIM_PERIOD, POWER_PERIOD, PUTT_AIM_PERIOD, CLUBS, clubFor, dailyCourse, groundY, aimAt, powerAt, puttAimAt, puttLine, puttReach,
  createRound, startShot, stepShot, endShot, putt, playHole, scoreName, pointsFor, versusPar, shareText,
} from "../web/games/hole/core/sim.js";

const dayAfter = (start, n) => { const d = new Date(`${start}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const TODAY = new Date().toISOString().slice(0, 10); // UTC today is always "today" somewhere
/** A flat, calm, dry hole for testing the physics on its own. */
const flat = (length = 400, extra = {}) => ({ par: 4, length, heights: Array(Math.ceil((length + 60) / 30) + 1).fill(10), pond: null, wind: 0, slope: 0, ...extra });
const hit = (course, round, i, j) => { const shot = startShot(course, round, i, j); while (!shot.done) stepShot(course, shot); endShot(course, round, shot); return shot; };

/** Play a hole sensibly: for every stroke, try a grid of taps and keep the one that leaves the least. */
function goodRound(course) {
  const round = createRound(), taps = [];
  while (!round.done) {
    let best = null, bestLeft = Infinity;
    const putting = round.feet !== null;
    for (let i = 0; i < (putting ? PUTT_AIM_PERIOD : AIM_PERIOD) / 2; i += putting ? 1 : 4) {
      for (let j = 1; j <= POWER_PERIOD / 2; j += putting ? 1 : 3) {
        const trial = { ...round };
        const wet = putting ? (putt(course, trial, i, j), false) : hit(course, trial, i, j).wet;
        const left = trial.holed ? -1 : wet ? 1e6 : trial.feet !== null ? trial.feet / 3 : Math.abs(course.length - trial.x);
        if (left < bestLeft) { bestLeft = left; best = [i, j]; }
      }
    }
    if (putting) putt(course, round, best[0], best[1]); else hit(course, round, best[0], best[1]);
    taps.push(best);
  }
  return { round, taps };
}

test("the same day always gives the same hole, and every hole for two years is well formed", () => {
  assert.deepEqual(dailyCourse("2026-10-05"), dailyCourse("2026-10-05"));
  const pars = new Set();
  for (let i = 0; i < 730; i++) {
    const c = dailyCourse(dayAfter("2026-10-05", i));
    pars.add(c.par);
    const [lo, hi] = { 3: [135, 205], 4: [300, 410], 5: [455, 540] }[c.par];
    assert.ok(c.length >= lo && c.length <= hi);
    assert.ok((c.heights.length - 1) * 30 >= c.length + 60, "there is ground past the green");
    assert.ok(c.heights.every((h) => h >= 0 && h <= 26));
    assert.ok(c.wind >= -12 && c.wind <= 12 && c.slope >= -2 && c.slope <= 2);
    assert.equal(c.pond === null, c.par === 3);
    if (c.pond) assert.ok(c.pond[0] > 100 && c.pond[1] < c.length - GREEN - 20, "water is clear of the tee and the green");
    assert.equal(groundY(c, c.length - GREEN), groundY(c, c.length + GREEN), "the green is level");
  }
  assert.deepEqual([...pars].sort(), [3, 4, 5]);
});

test("the taps: aim sweeps low to high, power 0 to 1, putt aim left to right", () => {
  const [lowF, lowU] = aimAt(0), [highF, highU] = aimAt(AIM_PERIOD / 2);
  assert.ok(lowF > 0.9 && lowU < 0.35 && highU > 0.9 && highF > 0.3, "from a low runner to a high lob");
  for (let i = 0; i < AIM_PERIOD; i++) { const [f, u] = aimAt(i); assert.ok(Math.abs(f * f + u * u - 1) < 1e-12); }
  assert.deepEqual([powerAt(0), powerAt(POWER_PERIOD / 2), puttAimAt(0), puttAimAt(PUTT_AIM_PERIOD / 2)], [0, 1, -1, 1]);
});

test("clubs: the shortest one that reaches, and full power at 45 degrees carries the club's distance", () => {
  assert.equal(clubFor(400).name, "Driver");
  assert.equal(clubFor(140).name, "7 iron");
  assert.equal(clubFor(10).name, "Lob wedge");
  const course = flat(400);
  // Tick 38 of the aim sweep is close to 45 degrees.
  const shot = startShot(course, createRound(), 38, POWER_PERIOD / 2);
  let carry = null;
  while (!shot.done) { stepShot(course, shot); if (!shot.air && carry === null) carry = shot.x; }
  assert.ok(Math.abs(carry - CLUBS[0][1]) < 6, `driver carried ${carry}`);
  assert.ok(shot.x > carry, "and it rolls on a little");
  assert.deepEqual(hit(course, createRound(), 38, 42), hit(course, createRound(), 38, 42), "same taps, same shot");
});

test("wind, slopes and water", () => {
  const calm = hit(flat(400), createRound(), 38, 42).x;
  assert.ok(hit(flat(400, { wind: 10 }), createRound(), 38, 42).x > calm + 10, "a tailwind carries it further");
  assert.ok(hit(flat(400, { wind: -10 }), createRound(), 38, 42).x < calm - 10, "a headwind holds it up");

  const round = createRound();
  const wet = hit(flat(400, { pond: [calm - 15, calm + 15] }), round, 38, 42);
  assert.ok(wet.wet);
  assert.deepEqual([round.x, round.strokes], [0, 2], "water costs a stroke and you play it again");

  const back = createRound();
  back.x = 440;
  assert.ok(hit(flat(400), back, 20, 20).x < 440, "from past the pin, the shot plays back toward it");
});

test("the green: a shot that stops near the pin is putted, and a good putt drops", () => {
  const course = flat(150);
  const { round, taps } = goodRound(course);
  assert.ok(round.holed);
  assert.ok(round.strokes <= 3, `took ${round.strokes}`);
  assert.deepEqual(playHole(course, taps), round, "replaying the taps gives the same round");

  const on = { ...createRound(), x: 144, strokes: 1, feet: 18 };
  const straight = PUTT_AIM_PERIOD / 4; // dead straight
  assert.equal(puttLine(course, straight, 18), 0);
  const power = (run) => { for (let j = 1; j <= POWER_PERIOD / 2; j++) if (powerAt(j) * puttReach(18) >= run) return j; };
  assert.ok(putt(course, { ...on }, straight, power(19)).holed, "on line, just past the cup: in");
  assert.ok(!putt(course, { ...on }, straight, power(12)).holed, "short");
  assert.ok(!putt(course, { ...on }, straight, power(26)).holed, "too hard: it runs by");
  assert.ok(!putt(course, { ...on }, 0, power(19)).holed, "off line");
  assert.ok(!putt(flat(150, { slope: 2 }), { ...on }, straight, power(19)).holed, "a sloping green needs aim to allow for the break");
  const miss = { ...on };
  putt(course, miss, straight, power(12));
  assert.ok(miss.feet > 5 && miss.feet < 7 && miss.strokes === 2, "what's left is the next putt");
});

test("every day can be parred, and a hole is never endless", () => {
  for (let i = 0; i < 30; i++) {
    const day = dayAfter("2026-10-05", i), course = dailyCourse(day);
    const { round, taps } = goodRound(course);
    assert.ok(round.holed && round.strokes <= course.par, `${day}: careful play took ${round.strokes} on a par ${course.par}`);
    assert.deepEqual(playHole(course, taps), round);
    assert.equal(playHole(course, taps.slice(0, -1)), null, "an unfinished hole is not a result");
    assert.equal(playHole(course, [...taps, [0, 0]]), null, "no strokes after it's in");
  }
  const course = dailyCourse("2026-10-05");
  const duffs = Array(course.par + 4).fill([0, 1]); // barely moves it, every time
  const picked = playHole(course, duffs);
  assert.deepEqual([picked.done, picked.holed, picked.strokes], [true, false, course.par + 4], "picked up at four over");
  for (const bad of [null, [[0]], [[1.5, 0]], [[0, POWER_PERIOD]], [[AIM_PERIOD, 0]], [[-1, 0]]]) assert.equal(playHole(course, bad), null, JSON.stringify(bad));
});

test("score names, points and share text", () => {
  assert.deepEqual([[1, 3], [2, 5], [2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [8, 4]].map(([s, p]) => scoreName(s, p)), ["Hole in one", "Albatross", "Eagle", "Birdie", "Par", "Bogey", "Double bogey", "4 over"]);
  assert.deepEqual([pointsFor(4, 4), pointsFor(3, 4), pointsFor(8, 4), pointsFor(1, 5)], [4, 5, 0, 8]);
  assert.deepEqual([versusPar(0), versusPar(2), versusPar(-1)], ["E", "+2", "−1"]);
  assert.equal(shareText(88, { strokes: 3, par: 4, assist: false }, "●●○"), "Hole 088: Birdie (3, par 4)\n⛳ ●●○");
});

/* ---------------- API ---------------- */
let env;
beforeEach(() => { env = { DB: fakeD1(), ALLOWED_ORIGINS: "" }; });
const post = (body) => handleApi(new Request("https://games.test/api/games/hole/plays", { method: "POST", body: JSON.stringify(body) }), env);

test("API: the hole is played again and scored by the server", async () => {
  const course = dailyCourse(TODAY), { round, taps } = goodRound(course);
  const res = await post({ day: TODAY, clientId: "client-hole-1", answers: { taps, assist: false } });
  assert.equal(res.status, 201);
  assert.equal((await res.json()).score, pointsFor(round.strokes, course.par));
  for (const answers of [taps, { taps }, { taps: taps.slice(0, -1), assist: false }, { taps: [[999, 0]], assist: false }]) {
    assert.equal((await post({ day: TODAY, clientId: "client-hole-2", answers })).status, 400, JSON.stringify(answers));
  }
});
