// Orbit's physics and level builder. No DOM, storage or network code: the browser plays with
// this file and the API replays the same taps with it to work out the result.
//
// Everything here is deterministic. Time moves in fixed ticks and the maths only uses
// + - * / and Math.sqrt (never sin/cos, which can differ between JS engines), so the same
// tap timing gives the same flight on every device and on the server.
import { mulberry32 } from "../../../shared/random.js";

export const WORLD = { w: 800, h: 1000 };
export const TICKS_PER_SEC = 60;
export const MAX_JUMPS = 5;
/** A run that is still going after 30 minutes of play ends as a fail. Keeps replays bounded. */
export const MAX_TICKS = 30 * 60 * TICKS_PER_SEC;
/** Ticks for one full lap of any planet (every ring turns at the same angle per tick). */
export const ORBIT_TICKS = 166;

const LAUNCH_SPEED = 2.6;   // world units per tick
const FLIGHT_MAX = 600;     // ticks before a flight that hasn't landed counts as a miss
const EDGE = 40;            // how far past the world's edge the ship may drift before it's lost
const GRAVITY = 1.9;        // pull strength, in units of LAUNCH_SPEED² × ring radius
const FIELD = 3.2;          // a planet pulls on ships within this many ring radii

// One tick of orbit is a rotation by 2·atan(TURN) radians (about 2.2°), written with the
// half-angle formulas so that no trig function is needed.
const TURN = 0.019;
const COS = (1 - TURN * TURN) / (1 + TURN * TURN);
const SIN = (2 * TURN) / (1 + TURN * TURN);

/* ---------------- Levels ---------------- */

const GAP = 110; // minimum empty space between two rings

/**
 * Build the star map for a seed. Planet 0 is the start (bottom), planet 1 is the goal (top),
 * the rest are scattered in between. Returns null if the planets don't fit; the seeds listed
 * in levels.js are known to fit and to be solvable.
 */
export function makeLevel(seed) {
  const rng = mulberry32(seed);
  const int = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
  const planets = [];
  const place = (r, y0, y1, goal = false) => {
    for (let tries = 0; tries < 40; tries++) {
      const x = int(r + 40, WORLD.w - r - 40), y = int(y0, y1);
      const clear = planets.every((p) => (p.x - x) ** 2 + (p.y - y) ** 2 >= (p.r + r + GAP) ** 2);
      if (!clear) continue;
      const field = r * FIELD;
      planets.push({ x, y, r, goal, field, r2: r * r, field2: field * field, mu: GRAVITY * LAUNCH_SPEED * LAUNCH_SPEED * r });
      return true;
    }
    return false;
  };
  if (!place(int(44, 56), 840, 900)) return null;
  if (!place(int(44, 52), 100, 160, true)) return null;
  const between = int(3, 5);
  for (let i = 0; i < between; i++) if (!place(int(38, 62), 250, 750)) return null;
  return { seed, planets, start: 0, goal: 1, startDir: rng() < 0.5 ? 1 : -1 };
}

/* ---------------- A run ---------------- */

/**
 * Fresh run state. `at` is the planet being orbited, or -1 in flight. `dir` is the orbit
 * direction (+1 or -1). `outcomes` gets one entry per finished jump: "hop", "miss" or "goal".
 */
export function createRun(level) {
  const p = level.planets[level.start];
  return {
    tick: 0, jumps: 0, done: null, outcomes: [],
    at: level.start, dir: level.startDir, x: p.x + p.r, y: p.y,
    vx: 0, vy: 0, from: -1, flight: 0, lx: 0, ly: 0, ldir: 1,
  };
}

export const cloneRun = (s) => ({ ...s, outcomes: s.outcomes.slice() });

/**
 * Advance one tick. `tap` launches the ship if it is orbiting and is ignored in flight.
 * Returns what happened this tick: "launch", "hop", "goal", "miss", "timeout" or null.
 */
export function step(level, s, tap) {
  if (s.done) return null;
  s.tick++;
  let event = null;
  if (s.at >= 0) event = orbit(level, s, tap);
  else event = fly(level, s);
  if (!s.done && s.tick >= MAX_TICKS) { s.done = "fail"; event = "timeout"; }
  return event;
}

function orbit(level, s, tap) {
  const p = level.planets[s.at];
  const rx = s.x - p.x, ry = s.y - p.y;
  if (tap) {
    // Let go: leave along the tangent, and remember the spot in case the jump misses.
    s.lx = s.x; s.ly = s.y; s.ldir = s.dir;
    s.vx = (-ry / p.r) * s.dir * LAUNCH_SPEED;
    s.vy = (rx / p.r) * s.dir * LAUNCH_SPEED;
    s.from = s.at; s.at = -1; s.flight = 0; s.jumps++;
    return "launch";
  }
  const nx = rx * COS - ry * SIN * s.dir, ny = rx * SIN * s.dir + ry * COS;
  const k = p.r / Math.sqrt(nx * nx + ny * ny); // stay exactly on the ring
  s.x = p.x + nx * k; s.y = p.y + ny * k;
  return null;
}

function fly(level, s) {
  const { planets } = level;
  // Gravity from every planet in range except the one just left. The pull fades to zero at the
  // edge of the field, so entering one never jolts the ship.
  for (let i = 0; i < planets.length; i++) {
    if (i === s.from) continue;
    const p = planets[i];
    const dx = p.x - s.x, dy = p.y - s.y, d2 = dx * dx + dy * dy;
    if (d2 >= p.field2 || d2 === 0) continue;
    const a = (p.mu * (1 / d2 - 1 / p.field2)) / Math.sqrt(d2);
    s.vx += a * dx; s.vy += a * dy;
  }
  s.x += s.vx; s.y += s.vy; s.flight++;

  // Crossing a ring means capture: snap onto it and orbit the way the ship was already curving.
  for (let i = 0; i < planets.length; i++) {
    if (i === s.from) continue;
    const p = planets[i];
    const rx = s.x - p.x, ry = s.y - p.y, d2 = rx * rx + ry * ry;
    if (d2 > p.r2) continue;
    const k = d2 > 0 ? p.r / Math.sqrt(d2) : 1;
    s.x = p.x + (d2 > 0 ? rx * k : p.r); s.y = p.y + ry * k;
    s.dir = rx * s.vy - ry * s.vx >= 0 ? 1 : -1;
    s.at = i; s.from = -1;
    const goal = i === level.goal;
    s.outcomes.push(goal ? "goal" : "hop");
    if (goal) s.done = "win";
    else if (s.jumps >= MAX_JUMPS) s.done = "fail";
    return goal ? "goal" : "hop";
  }

  const lost = s.x < -EDGE || s.x > WORLD.w + EDGE || s.y < -EDGE || s.y > WORLD.h + EDGE || s.flight >= FLIGHT_MAX;
  if (!lost) return null;
  // Missed everything: back to where the jump started. The jump still counts.
  s.x = s.lx; s.y = s.ly; s.dir = s.ldir; s.at = s.from; s.from = -1;
  s.outcomes.push("miss");
  if (s.jumps >= MAX_JUMPS) s.done = "fail";
  return "miss";
}

/**
 * Replay a finished run from its tap ticks (the value of `tick` at each launch).
 * Returns the final run state, or null if the taps couldn't have come from a real run.
 * `onTick(state, event)` is called after every tick, for drawing the path.
 */
export function replay(level, taps, onTick) {
  const s = createRun(level);
  let i = 0;
  while (!s.done) {
    if (i >= taps.length && s.at >= 0) {
      // No taps left and the ship is parked in orbit: the only way this run ended is the clock.
      s.tick = MAX_TICKS; s.done = "fail";
      break;
    }
    const tap = i < taps.length && taps[i] === s.tick + 1;
    if (tap && s.at < 0) return null; // a tap in mid-flight never launches
    if (tap) i++;
    const event = step(level, s, tap);
    onTick?.(s, event);
  }
  return i === taps.length ? s : null;
}
