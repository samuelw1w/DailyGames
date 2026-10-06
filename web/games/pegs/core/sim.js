// Pegs' physics and field builder. No DOM, storage or network code: the browser plays with
// this file and the API replays the same drops with it.
//
// Everything here is deterministic. Time moves in fixed ticks and the maths only uses
// + - * / and Math.sqrt, so a ball dropped on the same tick takes the same path everywhere,
// however chaotic the bounces look.
import { mulberry32, shuffle } from "../../../shared/random.js";

export const WORLD = { w: 480, h: 600 };
export const TICKS_PER_SEC = 60;
export const BALLS = 5;
export const TARGETS = 10;   // accent pegs to clear
export const BALL_R = 8;
export const PEG_R = 7;
export const LAUNCH_Y = 44;  // height the launcher slides along

const GRAVITY = 0.11;        // downward pull per tick
const BOUNCE = 0.8;          // speed a ball keeps bouncing off a peg
const WALL = 0.7;            // and off a side wall
const STEPS = 2;             // physics steps per tick, so a fast ball can't pass through a peg
const MAX_TICKS = 1500;
const EDGE = 30;             // the launcher turns this far from each wall

/* ---------------- The field ---------------- */

/**
 * Build the peg field for a seed: a loose staggered grid with gaps, of which TARGETS pegs
 * are the accent ones to clear. `period` is how many ticks the launcher takes to slide
 * there and back. Returns null if too few pegs survive; the seeds in levels.js are known good.
 */
export function makeField(seed) {
  const rng = mulberry32(seed);
  const int = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
  const pegs = [];
  for (let row = 0; row < 8; row++) {
    for (let x = 44 + (row % 2) * 26; x <= WORLD.w - 44; x += 52) {
      const peg = { x: x + int(-6, 6), y: 132 + row * 52 + int(-6, 6), target: false };
      if (rng() < 0.72) pegs.push(peg);
    }
  }
  if (pegs.length < TARGETS * 3) return null;
  for (const i of shuffle(pegs.map((_, n) => n), rng).slice(0, TARGETS)) pegs[i].target = true;
  return { seed, pegs, period: 150 + 10 * int(0, 5) };
}

/** Where the launcher is on tick `i` of its slide (0 to period - 1): left wall, right wall and back. */
export function launcherX(field, i) {
  const half = field.period / 2;
  return EDGE + (WORLD.w - 2 * EDGE) * ((i <= half ? i : field.period - i) / half);
}

/* ---------------- One ball ---------------- */

/** A ball let go on tick `i` of the launcher's slide. Step it with stepBall() until `done`. */
export const dropBall = (field, i) => ({ x: launcherX(field, i), y: LAUNCH_Y, vx: 0, vy: 0, tick: 0, done: false, hits: [] });

/**
 * Advance a ball one tick. `alive[n]` says whether peg n is still there; a peg the ball
 * strikes is removed straight away and its index added to `ball.hits`.
 */
export function stepBall(field, alive, ball) {
  if (ball.done) return;
  ball.tick++;
  const h = 1 / STEPS, reach = BALL_R + PEG_R;
  for (let s = 0; s < STEPS; s++) {
    ball.vy += GRAVITY * h;
    ball.x += ball.vx * h; ball.y += ball.vy * h;
    if (ball.x < BALL_R) { ball.x = BALL_R; ball.vx = -ball.vx * WALL; }
    if (ball.x > WORLD.w - BALL_R) { ball.x = WORLD.w - BALL_R; ball.vx = -ball.vx * WALL; }
    for (let n = 0; n < field.pegs.length; n++) {
      if (!alive[n]) continue;
      const p = field.pegs[n];
      const dx = ball.x - p.x, dy = ball.y - p.y, d2 = dx * dx + dy * dy;
      if (d2 >= reach * reach || d2 === 0) continue;
      const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
      const into = ball.vx * nx + ball.vy * ny;
      if (into < 0) { ball.vx -= (1 + BOUNCE) * into * nx; ball.vy -= (1 + BOUNCE) * into * ny; }
      ball.x = p.x + nx * reach; ball.y = p.y + ny * reach;
      alive[n] = false;
      ball.hits.push(n);
    }
  }
  if (ball.y > WORLD.h + BALL_R || ball.tick >= MAX_TICKS) ball.done = true;
}

/* ---------------- A game ---------------- */

export const createGame = (field) => ({ alive: field.pegs.map(() => true), perBall: [], done: false });

const targetsLeft = (field, alive) => field.pegs.filter((p, n) => p.target && alive[n]).length;

/** Record a finished ball: how many accent pegs it cleared, and whether the game is over. */
export function applyBall(field, game, ball) {
  game.perBall.push(ball.hits.filter((n) => field.pegs[n].target).length);
  if (targetsLeft(field, game.alive) === 0 || game.perBall.length === BALLS) game.done = true;
}

/**
 * Replay a whole game from the launcher tick of each drop. Returns the finished game, or
 * null if `drops` isn't exactly one complete game.
 */
export function playGame(field, drops) {
  if (!Array.isArray(drops) || drops.length > BALLS) return null;
  if (!drops.every((i) => Number.isInteger(i) && i >= 0 && i < field.period)) return null;
  const game = createGame(field);
  for (const i of drops) {
    if (game.done) return null;
    const ball = dropBall(field, i);
    while (!ball.done) stepBall(field, game.alive, ball);
    applyBall(field, game, ball);
  }
  return game.done ? game : null;
}
