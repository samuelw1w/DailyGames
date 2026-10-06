// Pins' physics: one ball rolling down the lane into the pins. No DOM, storage or network
// code: the browser plays with this file and the API replays the same throws with it.
//
// Everything here is deterministic. Time moves in fixed ticks and the maths only uses
// + - * / and Math.sqrt, so the same two taps knock down the same pins on every device.
import { hash, mulberry32 } from "../../../shared/random.js";

export const WORLD = { w: 480, h: 600 };
export const LANE = { left: 150, right: 330, foul: 560, pit: 24 };
export const TICKS_PER_SEC = 60;
export const BALL_R = 15;
export const PIN_R = 9;

const BALL_MASS = 5;      // a pin weighs 1
const SPEED = 5;          // ball speed up the lane, world units per tick
const HOOK_OUT = 1.6;     // sideways speed a full hook starts with, away from the curve
const HOOK_CURVE = 0.048; // sideways pull per tick that brings a full hook back
const DRIFT = 0.0025;     // sideways pull per tick for each point of lane drift
const BOUNCE = 0.85;      // how springy collisions are
const SLIDE = 0.965;      // pins keep this much of their speed each tick
const TOPPLE = 6;         // a pin pushed further than this from its spot is down
const MAX_TICKS = 420;

/** Where the ten pins stand: a triangle with the head pin nearest the bowler. */
export const SPOTS = [];
for (let row = 0; row < 4; row++) {
  for (let k = 0; k <= row; k++) SPOTS.push([240 + (k - row / 2) * 36, 150 - row * 31]);
}

/* ---------------- The lane ---------------- */

/**
 * A lane's conditions: how many ticks the position marker and the hook meter take to sweep
 * there and back, and how hard the lane drifts (negative = left, positive = right).
 */
export function makeLane(rng) {
  return {
    posPeriod: 140 + 20 * Math.floor(rng() * 4),   // even, so the sweep turns on a whole tick
    hookPeriod: 120 + 20 * Math.floor(rng() * 3),  // divisible by 4, so it can start at "straight"
    drift: Math.floor(rng() * 7) - 3,
  };
}

/** The lane for a date. Same for everyone. */
export const dailyLane = (day) => makeLane(mulberry32(hash("pins:" + day)));

// Both taps pick a moment in a back-and-forth sweep. 0 at the start, 1 at the turn, 0 again.
const sweep = (i, period) => (i <= period / 2 ? i : period - i) / (period / 2);

/** Ball's starting x for a first tap on tick `i` of the position sweep (left edge to right edge). */
export function posAt(lane, i) {
  const lo = LANE.left + BALL_R + 4, hi = LANE.right - BALL_R - 4;
  return lo + (hi - lo) * sweep(i, lane.posPeriod);
}

/** Hook for a second tap on tick `j` of the hook sweep: -1 curves left, 0 is straight, 1 curves right. */
export const hookAt = (lane, j) => 2 * sweep(j, lane.hookPeriod) - 1;

/** The tick the hook sweep starts on, so the meter begins at "straight". */
export const hookStart = (lane) => lane.hookPeriod / 4;

/* ---------------- One ball ---------------- */

/**
 * Start a ball. `standing[i]` says whether pin i is still up, `pos` and `hook` are the ticks
 * of the two taps. Step it with stepShot() until `done`.
 */
export function createShot(lane, standing, pos, hook) {
  const h = hookAt(lane, hook);
  return {
    tick: 0, done: false, gutter: false,
    ball: { x: posAt(lane, pos), y: LANE.foul, vx: -h * HOOK_OUT, vy: -SPEED, ax: h * HOOK_CURVE + lane.drift * DRIFT },
    pins: SPOTS.map(([x, y], i) => ({ x, y, vx: 0, vy: 0, up: standing[i], gone: !standing[i] })),
  };
}

/** Where the ball would be `t` ticks after release if it hit nothing. For drawing the aim line. */
export function aimPoint(lane, pos, hook, t) {
  const h = hookAt(lane, hook);
  const ax = h * HOOK_CURVE + lane.drift * DRIFT;
  // Matches stepShot: speed changes first, then position, every tick.
  return [posAt(lane, pos) - h * HOOK_OUT * t + (ax * t * (t + 1)) / 2, LANE.foul - SPEED * t];
}

function collide(a, b, ma, mb, reach) {
  const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
  if (d2 >= reach * reach || d2 === 0) return;
  const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
  const closing = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (closing < 0) {
    const j = (-(1 + BOUNCE) * closing) / (1 / ma + 1 / mb);
    a.vx -= (j / ma) * nx; a.vy -= (j / ma) * ny;
    b.vx += (j / mb) * nx; b.vy += (j / mb) * ny;
  }
  // Push the two apart so they never overlap, the lighter one moving more.
  const overlap = reach - d, share = mb / (ma + mb);
  a.x -= nx * overlap * share; a.y -= ny * overlap * share;
  b.x += nx * overlap * (1 - share); b.y += ny * overlap * (1 - share);
}

/** Advance the ball and pins one tick. */
export function stepShot(shot) {
  if (shot.done) return;
  shot.tick++;
  const { ball, pins } = shot;

  ball.vx += ball.ax;
  ball.x += ball.vx; ball.y += ball.vy;
  if (!shot.gutter && (ball.x - BALL_R < LANE.left || ball.x + BALL_R > LANE.right)) {
    // Off the edge: the ball drops into the gutter and rolls past the pins.
    shot.gutter = true;
    ball.x = ball.x < WORLD.w / 2 ? LANE.left - BALL_R - 3 : LANE.right + BALL_R + 3;
    ball.vx = 0; ball.ax = 0; ball.vy = -SPEED;
  }

  let moving = false;
  for (const p of pins) {
    if (p.gone) continue;
    p.x += p.vx; p.y += p.vy;
    p.vx *= SLIDE; p.vy *= SLIDE;
    if (p.x - PIN_R < LANE.left) { p.x = LANE.left + PIN_R; p.vx = -p.vx * 0.5; }
    if (p.x + PIN_R > LANE.right) { p.x = LANE.right - PIN_R; p.vx = -p.vx * 0.5; }
    if (p.y < LANE.pit) p.gone = true; // swept off the back of the deck
    else if (p.vx * p.vx + p.vy * p.vy > 0.0025) moving = true;
  }
  for (let i = 0; i < pins.length; i++) {
    if (pins[i].gone) continue;
    if (!shot.gutter) collide(ball, pins[i], BALL_MASS, 1, BALL_R + PIN_R);
    for (let k = i + 1; k < pins.length; k++) if (!pins[k].gone) collide(pins[i], pins[k], 1, 1, PIN_R * 2);
  }

  if (shot.tick >= MAX_TICKS || (ball.y < -BALL_R * 2 && !moving)) shot.done = true;
}

/** After a shot: which pins went down (only pins that were standing can). */
export function downed(shot) {
  return shot.pins.map((p, i) => {
    if (!p.up) return false;
    const dx = p.x - SPOTS[i][0], dy = p.y - SPOTS[i][1];
    return p.gone || dx * dx + dy * dy > TOPPLE * TOPPLE;
  });
}
