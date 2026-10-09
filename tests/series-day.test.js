// The Series as the browser keeps it: the day's score and its points, the lineup, streaks and
// days played later. Runs the real storage code against an in-memory localStorage.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { dayKey } from "../web/shared/daily.js";
import { gameStore } from "../web/shared/storage.js";
import { setPlus } from "../web/shared/account.js";
import { lineupFor, chooseLineup, seriesState, bankedOn, wallet, dayStreak, lockIn, saveHouse, seriesShare } from "../web/shared/series.js";
import { pointsFor, pointsFromScore, validLineup } from "../web/shared/scoring.js";
import { pointsFor as holeScore } from "../web/games/hole/core/sim.js";
import { scoreRun } from "../web/games/orbit/core/puzzle.js";

const memory = new Map();
globalThis.localStorage = { getItem: (k) => (memory.has(k) ? memory.get(k) : null), setItem: (k, v) => memory.set(k, String(v)), removeItem: (k) => memory.delete(k) };
beforeEach(() => memory.clear());

const TODAY = dayKey();
const ago = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return dayKey(d); };
/** Save a newer-style result (it carries its own points) for a game on a day. */
const play = (id, day, points) => gameStore(id).saveDay(day, { total: points, points }, points);
const FREE = { play: ["orbit", "pins", "stop"], know: ["middleman", "year", "jot"] };
const playAll = (day, points = 50) => [...FREE.play, ...FREE.know].forEach((id) => play(id, day, points));

test("the server turns its own scores into the same 0 to 100 as the browser", () => {
  for (let jumps = 1; jumps <= 5; jumps++) assert.equal(pointsFromScore("orbit", scoreRun({ done: "win", jumps })), pointsFor("orbit", { won: true, jumps }));
  assert.equal(pointsFromScore("orbit", scoreRun({ done: "lost", jumps: 5 })), pointsFor("orbit", { won: false, jumps: 5 }));
  for (let strokes = 1; strokes <= 10; strokes++) assert.equal(pointsFromScore("hole", holeScore(strokes, 4)), pointsFor("hole", { strokes, par: 4 }), `${strokes} on a par 4`);
  for (const total of [0, 13, 35, 70, 90]) assert.equal(pointsFromScore("pins", total), pointsFor("pins", { total }));
  for (const total of [0, 4, 15]) assert.equal(pointsFromScore("skip", total), pointsFor("skip", { total }));
  for (const total of [0, 333, 500]) assert.equal(pointsFromScore("middleman", total), pointsFor("middleman", { total }));
  for (const id of ["stop", "year", "close", "jot", "link"]) assert.equal(pointsFromScore(id, 64), pointsFor(id, { points: 64 }));
});

test("a lineup is up to three different games from each act", () => {
  assert.ok(validLineup(FREE));
  assert.ok(validLineup({ play: ["skip"], know: [] }));
  for (const bad of [null, {}, { play: [], know: [] }, { play: ["orbit", "orbit"] }, { play: ["orbit", "pins", "stop", "skip"] }, { play: ["middleman"] }, { play: "orbit" }]) assert.equal(validLineup(bad), false, JSON.stringify(bad));
});

test("an act's lineup is fixed once one of its games is played, so nobody can keep their best three", () => {
  setPlus(true); // every game open, so there is a choice to make
  chooseLineup(TODAY, { play: ["orbit", "pins", "skip"], know: ["middleman", "year", "jot"] });
  play("hole", TODAY, 100); // a game outside the lineup, played "for fun"
  const after = chooseLineup(TODAY, { play: ["hole", "pins", "skip"], know: ["close", "year", "jot"] });
  assert.deepEqual(after.play, ["orbit", "pins", "skip"], "Play has started: its games stay");
  assert.deepEqual(after.know, ["close", "year", "jot"], "Know hasn't: it can still be chosen");
  assert.equal(seriesState(TODAY).points.hole, 100);
  assert.equal(seriesState(TODAY).total, 0, "the game played for fun doesn't count");
});

test("the lineup a player started with doesn't shift when Plus opens more games", () => {
  play("orbit", TODAY, 80);
  assert.deepEqual(lineupFor(TODAY), FREE);
  setPlus(true);
  assert.deepEqual(lineupFor(TODAY), FREE, "stop is still in, skip didn't take its place");
});

test("the day's score is what was played; Risk only moves the points it banks", () => {
  playAll(TODAY, 70);
  const s = seriesState(TODAY);
  assert.equal(s.total, 420);
  assert.equal(s.complete, true);
  assert.equal(bankedOn(TODAY), 0, "nothing banked until the day is banked or risked");
  saveHouse(TODAY, 420, 588, [1, 1, -1, 1]);
  assert.equal(seriesState(TODAY).total, 420, "the score doesn't move");
  assert.equal(bankedOn(TODAY), 588, "the points do");
  assert.equal(wallet().earned, 588);
  assert.match(seriesShare(7, seriesState(TODAY)), /^Daily Hub #7 · 420\/600\n/);
  assert.match(seriesShare(7, seriesState(TODAY)), /🎲 Risk: 1\.4×$/);
});

test("a day played later keeps an archive score and its points, but isn't ranked", () => {
  playAll(ago(3), 60);
  const s = seriesState(ago(3));
  assert.equal(s.late, true);
  assert.equal(s.total, 360, "the score is still shown");
  lockIn(ago(3));
  assert.equal(bankedOn(ago(3)), 360, "its points still go toward unlocking games");
  assert.match(seriesShare(2, seriesState(ago(3))), /\(played later\)/);
  playAll(TODAY, 50);
  assert.equal(seriesState(TODAY).late, false);
});

test("streaks count only days played on the day itself", () => {
  // Results saved before days were tracked (yesterday and the day before) count as on time.
  localStorage.setItem("dg.v1.orbit.history", JSON.stringify({ [ago(1)]: 4, [ago(2)]: 3 }));
  assert.equal(dayStreak(), 2, "today not played yet: the streak is still alive");
  play("pins", ago(3), 50); // filling in an older day later
  assert.equal(dayStreak(), 2, "doesn't stretch the streak");
  assert.equal(gameStore("pins").stats().streak, 0, "nor the game's own streak");
  play("stop", TODAY, 50);
  assert.equal(dayStreak(), 3);
  play("year", ago(5), 50);
  play("year", ago(4), 50);
  assert.equal(dayStreak(), 3, "a gap filled in later stays a gap");
});
