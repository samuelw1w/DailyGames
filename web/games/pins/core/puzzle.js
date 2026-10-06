// Pins game rules around the physics in sim.js: frames, bowling scoring and share text.
// Pure functions only, so the browser and the API import this same file and always agree.
import { ballLane, createShot, stepShot, downed } from "./sim.js";

export const GAME_ID = "pins";
export const FRAMES = 3;
/** Three strikes plus two bonus strikes in the last frame: 30 + 30 + 30. */
export const MAX_SCORE = 90;
/** Shown next to any result earned with slow motion on. */
export const ASSIST_MARK = "🐢";

/* ---------------- A game ---------------- */

/**
 * Fresh game. `rolls` is the pins knocked down by each ball so far, `frame` and `ball` say
 * which ball is next (both 0-based), `standing[i]` whether pin i is up for it.
 */
export const createGame = () => ({ rolls: [], frame: 0, ball: 0, standing: Array(10).fill(true), done: false });

const rerack = (game) => game.standing.fill(true);

/**
 * Record one ball. `down[i]` says whether pin i fell. Frames 1 and 2 are ordinary frames;
 * frame 3 works like a real tenth frame, where a strike or spare earns extra balls.
 */
export function applyRoll(game, down) {
  const count = down.filter(Boolean).length;
  game.rolls.push(count);
  down.forEach((d, i) => { if (d) game.standing[i] = false; });
  const cleared = !game.standing.some(Boolean);

  if (game.frame < FRAMES - 1) {
    if (cleared || game.ball === 1) { game.frame++; game.ball = 0; rerack(game); }
    else game.ball = 1;
    return count;
  }
  if (game.ball === 2) game.done = true;
  else if (game.ball === 1 && !cleared && game.first !== 10) game.done = true; // open frame
  else {
    if (game.ball === 0) game.first = count;
    game.ball++;
    if (cleared) rerack(game);
  }
  return count;
}

/** Throw one ball start to finish. Returns the pins it knocked down. */
export function playBall(lane, game, pos, hook) {
  const shot = createShot(lane, game.standing, pos, hook);
  while (!shot.done) stepShot(shot);
  return applyRoll(game, downed(shot));
}

/**
 * Replay a whole game from its throws, each [pos, hook] (the ticks of the two taps).
 * `day` is from dailyLane(). Returns the finished game, or null if the throws don't make
 * exactly one complete game.
 */
export function playGame(day, balls) {
  if (!Array.isArray(balls)) return null;
  const game = createGame();
  for (let n = 0; n < balls.length; n++) {
    const lane = ballLane(day, n), b = balls[n];
    const tick = (t, period) => Number.isInteger(t) && t >= 0 && t < period;
    if (game.done || !Array.isArray(b) || b.length !== 2 || !tick(b[0], lane.posPeriod) || !tick(b[1], lane.hookPeriod)) return null;
    playBall(lane, game, b[0], b[1]);
  }
  return game.done ? game : null;
}

/* ---------------- Scoring ---------------- */

const mark = (n) => (n === 0 ? "-" : String(n));

/**
 * Score a game in progress or finished. Returns { frames, total } where each frame is
 * { marks, score }: `marks` like "X", "7/" or "X9/", and `score` the running total after
 * that frame, or null while it still depends on balls not yet thrown.
 */
export function scoreGame(rolls) {
  const frames = [];
  let i = 0, total = 0, open = false;
  for (let f = 0; f < FRAMES; f++) {
    const a = rolls[i], b = rolls[i + 1], c = rolls[i + 2];
    let marks = "", need = 2, used = 2;
    if (a === undefined) { frames.push({ marks: "", score: null }); open = true; continue; }
    if (f < FRAMES - 1) {
      if (a === 10) { marks = "X"; need = 3; used = 1; }
      else if (b !== undefined && a + b === 10) { marks = mark(a) + "/"; need = 3; }
      else marks = mark(a) + (b === undefined ? "" : mark(b));
    } else {
      const strike = a === 10, spare = !strike && b !== undefined && a + b === 10;
      need = strike || spare ? 3 : 2;
      marks = strike ? "X" : mark(a);
      if (b !== undefined) marks += spare ? "/" : strike && b === 10 ? "X" : mark(b);
      if (c !== undefined && need === 3) marks += strike && b !== 10 ? (b + c === 10 ? "/" : mark(c)) : c === 10 ? "X" : mark(c);
    }
    const have = [a, b, c].slice(0, need);
    if (open || have.includes(undefined)) { open = true; frames.push({ marks, score: null }); }
    else { total += have.reduce((x, y) => x + y, 0); frames.push({ marks, score: total }); }
    i += used;
  }
  return { frames, total };
}

/** The text players copy to share: the marks and running score of each frame. */
export function shareText(title, rolls, assist) {
  const { frames, total } = scoreGame(rolls);
  const cells = frames.map((f) => [f.marks, String(f.score)]);
  const line = (k) => cells.map((c) => c[k].padEnd(Math.max(c[0].length, c[1].length))).join("  ").trimEnd();
  return `${title} · ${total}/${MAX_SCORE}${assist ? ` ${ASSIST_MARK}` : ""}\n🎳 ${line(0)}\n   ${line(1)}`;
}
