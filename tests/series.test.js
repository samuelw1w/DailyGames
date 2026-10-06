import { test } from "node:test";
import assert from "node:assert/strict";
import { ACTS, ORDER, DAY_POINTS, pointsFor, times } from "../web/shared/series.js";
import { GAMES as REGISTRY } from "../web/shared/registry.js";
import { GAMES as API } from "../api/src/games/index.js";
import * as stop from "../web/games/stop/core/sim.js";
import * as year from "../web/games/year/core/puzzle.js";
import * as close from "../web/games/close/core/puzzle.js";
import * as jot from "../web/games/jot/core/puzzle.js";
import { WORDS } from "../web/games/jot/core/words.js";
import * as link from "../web/games/link/core/puzzle.js";
import { LINKS } from "../web/games/link/core/links.js";
import { dailyRounds } from "../web/games/middleman/core/puzzle.js";

const dayAfter = (start, n) => { const d = new Date(`${start}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const DAYS = Array.from({ length: 365 }, (_, i) => dayAfter("2026-10-05", i));

test("two acts of five games to pick three from, every game registered, and the day out of 600", () => {
  assert.deepEqual(ACTS.map((a) => a.games.length), [5, 5]);
  assert.equal(new Set(ORDER).size, 10);
  assert.equal(DAY_POINTS, 600);
  for (const id of [...ORDER, "house"]) {
    assert.ok(REGISTRY.some((g) => g.id === id), `${id} is in the registry`);
    assert.ok(API.has(id), `${id} has a server module`);
  }
  assert.equal(new Set(REGISTRY.map((g) => g.accent.toLowerCase())).size, REGISTRY.length, "every game has its own color");
});

test("every game's result becomes 0 to 100 points", () => {
  assert.equal(pointsFor("orbit", null), null, "unplayed");
  assert.deepEqual([1, 2, 3, 4, 5].map((jumps) => pointsFor("orbit", { won: true, jumps })), [100, 100, 90, 75, 60]);
  assert.equal(pointsFor("orbit", { won: false, jumps: 5 }), 10);
  assert.deepEqual([0, 35, 70, 90].map((total) => pointsFor("pins", { total })), [0, 50, 100, 100]);
  assert.deepEqual([0, 5, 15, 30].map((total) => pointsFor("skip", { total })), [0, 35, 100, 100]);
  assert.deepEqual([[2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4], [8, 4]].map(([strokes, par]) => pointsFor("hole", { strokes, par })), [100, 88, 72, 52, 34, 18, 6]);
  assert.deepEqual([0, 250, 500].map((total) => pointsFor("middleman", { total })), [0, 50, 100]);
  assert.equal(pointsFor("stop", { points: 64 }), 64, "newer games save their own points");
  assert.equal(pointsFor("jot", { points: 140 }), 100, "never more than 100");
  assert.deepEqual([times(1.64), times(2), times(0.55)], ["1.6×", "2×", "0.5×"]);
});

test("stop: the needle, the error and the points", () => {
  assert.deepEqual(stop.dailyDial("2026-10-05"), stop.dailyDial("2026-10-05"));
  const round = { target: 90, start: 0, speed: 5, dir: 1 };
  assert.deepEqual([stop.needleAt(round, 18), stop.errorAt(round, 18), stop.errorAt(round, 20), stop.errorAt({ ...round, target: 350 }, 2)], [90, 0, 10, 20]);
  assert.equal(stop.needleAt({ ...round, dir: -1 }, 2), 350);
  assert.deepEqual([0, 20, 40, 180].map(stop.roundPoints), [20, 5, 0, 0]);
  for (const day of DAYS) {
    const dial = stop.dailyDial(day);
    // Every round can be stopped dead on the mark within the clock, so 100 is always there to be had.
    const best = dial.map((r) => { for (let t = 1; t <= stop.CLOCK; t++) if (stop.errorAt(r, t) === 0) return t; return null; });
    assert.ok(best.every((t) => t !== null), day);
    assert.equal(stop.playGame(dial, best).total, 100, day);
  }
  const dial = stop.dailyDial(DAYS[0]);
  for (const bad of [null, [1, 2, 3, 4], [0, 1, 1, 1, 1], [1.5, 1, 1, 1, 1], [stop.CLOCK + 1, 1, 1, 1, 1]]) assert.equal(stop.playGame(dial, bad), null);
});

test("year and close: the day's question avoids Middleman's answers, and scoring is fair", () => {
  for (const day of DAYS) {
    const ends = dailyRounds(day).flatMap((r) => [r.a, r.b]);
    const thing = year.dailyThing(day), q = close.dailyQuestion(day);
    assert.ok(Number.isInteger(thing.v) && thing.v >= 1000 && !ends.includes(thing), day);
    assert.ok(!ends.includes(q.item) && q.answer > 0 && q.answer < 1e7, day);
    assert.equal(q.answer, q.item.v * q.unit.per);
  }
  assert.deepEqual([[1889], [1900, 1889], [1900, 1880, 1889], [1879], [1849], [1700]].map((g) => year.score(1889, g)), [100, 85, 70, 45, 0, 0]);
  assert.equal(year.score(1889, [1700, 1890]), Math.round(60 * (1 - 1 / 40) * 0.9), "a later near miss counts for a little less");
  assert.deepEqual([year.feedback(1889, 1880).dir, year.feedback(1889, 1900).dir, year.feedback(1889, 1889).dir], ["Later", "Earlier", "exact"]);
  assert.ok(year.validGuess(1999) && !year.validGuess(19.5) && !year.validGuess(0) && !year.validGuess("1999"));

  assert.deepEqual([[100], [103], [200], [50], [400], [25], [1000]].map((g) => close.score(100, g)), [100, 100, 50, 50, 0, 0, 0]);
  assert.equal(close.score(100, [1000, 100]), 85, "spot on at the second go");
  assert.deepEqual([close.feedback(100, 50).dir, close.feedback(100, 300).dir, close.feedback(100, 101).dir], ["Higher", "Lower", "exact"]);
  assert.equal(close.feedback(100, 300).text, "3.0× too high");
  assert.equal(close.feedback(100, 80).text, "25% too low");
  assert.deepEqual([close.unitFor("weight", 0.02).label, close.unitFor("weight", 12).label, close.unitFor("size", 0.3).label, close.unitFor("price", 5).label], ["g", "kg", "cm", "US dollars"]);
});

test("jot: the word list, the count and the points", () => {
  assert.ok(WORDS.length >= 300);
  for (const w of WORDS) assert.ok(/^[a-z]{5}$/.test(w) && new Set(w).size === 5, `${w} has five different letters`);
  assert.equal(new Set(WORDS).size, WORDS.length);
  assert.ok(WORDS.includes(jot.dailyWord("2026-10-05")));
  assert.deepEqual([jot.shared("crane", "crane"), jot.shared("crane", "nacre"), jot.shared("crane", "light"), jot.shared("crane", "eerie"), jot.shared("crane", "aeiou")], [5, 5, 0, 2, 2]);
  assert.deepEqual([1, 3, 4, 8].map((n) => jot.score("crane", [...Array(n - 1).fill("light"), "crane"])), [100, 100, 92, 54]);
  assert.equal(jot.score("crane", ["nacre", "light"]), 25, "unsolved: a little for the best count");
  assert.ok(jot.validGuess("aeiou") && !jot.validGuess("AEIOU") && !jot.validGuess("four") && !jot.validGuess(12345));
});

test("link: every puzzle is three words, and rounds score by tries and hints", () => {
  assert.ok(LINKS.length >= 80);
  for (const l of LINKS) assert.ok(l.length === 3 && l.every((w) => /^[a-z]+$/.test(w)), l.join(" "));
  assert.equal(new Set(LINKS.map((l) => l.join(" "))).size, LINKS.length);
  const links = link.dailyLinks("2026-10-05");
  assert.equal(links.length, 5);
  assert.deepEqual(links, link.dailyLinks("2026-10-05"));
  const pts = (guesses, hint = false) => link.scoreRound("light", { guesses, hint }).points;
  assert.deepEqual([pts(["light"]), pts([" Light! "]), pts(["dark", "light"]), pts(["a", "b", "light"]), pts(["light"], true), pts(["a", "b", "light"], true), pts(["a", "b", "c"]), pts(["a", "b", "c", "light"])], [20, 20, 15, 10, 12, 4, 0, 0]);
  const perfect = link.playGame(links, links.map((l) => ({ guesses: [l[1]], hint: false })));
  assert.equal(perfect.total, 100);
  for (const bad of [null, [], links.map(() => ({ guesses: ["a"] })), links.map(() => ({ guesses: ["a", "b", "c", "d"], hint: false }))]) assert.equal(link.playGame(links, bad), null);
});
