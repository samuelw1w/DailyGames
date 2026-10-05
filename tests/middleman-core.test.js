import { test } from "node:test";
import assert from "node:assert/strict";
import { SCALES, SCALE_KEYS, dailyRounds, scoreFor, scoreAnswer, search, posOf, closest } from "../web/games/middleman/core/puzzle.js";

const dayAfter = (start, n) => { const d = new Date(`${start}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

test("the same day always produces the same puzzle", () => {
  const a = dailyRounds("2026-10-05").map((r) => [r.scale, r.a.id, r.b.id]);
  const b = dailyRounds("2026-10-05").map((r) => [r.scale, r.a.id, r.b.id]);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, dailyRounds("2026-10-06").map((r) => [r.scale, r.a.id, r.b.id]));
});

test("every daily puzzle for the next two years is well formed", () => {
  for (let i = 0; i < 730; i++) {
    const day = dayAfter("2026-10-05", i);
    const rounds = dailyRounds(day);
    assert.equal(rounds.length, 5, day);
    assert.deepEqual(rounds.map((r) => r.scale).sort(), [...SCALE_KEYS].sort(), day);
    for (const r of rounds) {
      const sc = SCALES[r.scale];
      assert.ok(r.a.v < r.b.v, `${day} ${r.scale}: endpoints out of order`);
      const span = sc.log ? Math.log10(r.b.v) - Math.log10(r.a.v) : r.b.v - r.a.v;
      assert.ok(span >= sc.span[0] && span <= sc.span[1], `${day} ${r.scale}: span ${span} outside range`);
      const near = closest(r, 3).filter((c) => Math.abs(c.pos - 0.5) < 0.12);
      assert.equal(near.length, 3, `${day} ${r.scale}: fewer than 3 good answers`);
    }
  }
});

test("scoring: 100 in the middle, 0 at or past the ends, symmetric", () => {
  assert.equal(scoreFor(0.5), 100);
  assert.equal(scoreFor(0), 0);
  assert.equal(scoreFor(1), 0);
  assert.equal(scoreFor(-0.3), 0);
  assert.equal(scoreFor(0.4), scoreFor(0.6));
  assert.ok(scoreFor(0.45) > scoreFor(0.4));
});

test("scoreAnswer rejects endpoints and unknown IDs, accepts timeouts", () => {
  const r = dailyRounds("2026-10-05")[0];
  assert.equal(scoreAnswer(r, r.a.id), null);
  assert.equal(scoreAnswer(r, "not-a-real-thing"), null);
  assert.deepEqual(scoreAnswer(r, null), { item: null, pos: null, score: 0 });
  const other = SCALES[r.scale].items.find((it) => it !== r.a && it !== r.b);
  assert.equal(scoreAnswer(r, other.id).score, scoreFor(posOf(SCALES[r.scale], other.v, r.a, r.b)));
});

test("search matches names and aliases and hides the endpoints", () => {
  const round = { scale: "weight", a: SCALES.weight.byId.get("mouse"), b: SCALES.weight.byId.get("elephant") };
  assert.ok(search(round, "dog").some((it) => it.id === "beagle"));
  assert.ok(search(round, "a hippopotamus").some((it) => it.id === "hippo"));
  assert.ok(!search(round, "mouse").some((it) => it.id === "mouse"));
  assert.deepEqual(search(round, "   "), []);
});
