// Hole's rules: the day's golf hole, how a full shot flies and rolls, and how a putt runs.
// No DOM, storage or network code: the browser plays with this file and the API replays the
// same taps with it.
//
// Everything is deterministic. Time moves in fixed ticks and the maths only uses + - * / and
// Math.sqrt (angles come from half-angle formulas, never sin or cos), so the same two taps
// send the ball to the same place on every device.
import { hash, mulberry32 } from "../../../shared/random.js";

export const GAME_ID = "hole";
export const TICKS_PER_SEC = 60;
/** Shown next to any result earned with slow motion on. */
export const ASSIST_MARK = "🐢";
/** Best possible score for the API's chart: four under par. */
export const MAX_SCORE = 8;

// Distances are in yards on the course and feet on the green.
export const GREEN = 12;          // the ball is on the green within this many yards of the pin
const SEG = 30;                   // yards between the points the terrain is drawn through
const GRAVITY = 0.05;             // yards per tick, per tick
const WIND = 0.0004;              // sideways pull per tick for each mph of wind
const ROLL = 0.32;                // share of its forward speed a ball keeps when it lands
const FRICTION = 0.018;
const SLOPE = 0.05;               // how hard a slope pushes a rolling ball
const HOLED = 0.5;                // a full shot that stops this close to the pin is in
const EXTRA = 4;                  // strokes over par at which the ball is picked up

export const AIM_PERIOD = 140;    // ticks for the aim line to sweep up and back
export const POWER_PERIOD = 84;   // ticks for the power bar to fill and empty
export const PUTT_AIM_PERIOD = 110;
const TAN_LOW = 0.16, TAN_HIGH = 0.66; // half-angle tangents of the lowest (18°) and highest (67°) launch
const PUTT_AIM = 0.16;            // how far off line the putting aim swings, per foot travelled
const BREAK = 0.0016;             // sideways drift of a putt per foot squared, per point of slope
const CUP = 0.55;                 // a putt this close to the line (feet) drops...
const PACE = 4;                   // ...if it would have run no more than this far past

/** The clubs, longest first: [name, yards at full power and a 45° launch]. */
export const CLUBS = [["Driver", 270], ["3 wood", 235], ["5 iron", 195], ["7 iron", 160], ["9 iron", 130], ["Wedge", 100], ["Sand wedge", 70], ["Lob wedge", 42]];

/** The shortest club that still reaches `distance` with a little to spare. */
export function clubFor(distance) {
  let pick = CLUBS[0];
  for (const club of CLUBS) if (club[1] >= distance * 1.08) pick = club;
  return { name: pick[0], max: pick[1] };
}

/* ---------------- The course ---------------- */

/**
 * A hole: `par`, `length` in yards (tee at 0, pin at `length`), `heights` every SEG yards,
 * `pond` as [from, to] or null, `wind` in mph (negative blows back toward the tee) and
 * `slope` of the green (negative breaks putts left, positive right).
 */
export function makeCourse(rng) {
  const int = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
  const par = [3, 4, 4, 4, 5][int(0, 4)];
  const length = par === 3 ? int(135, 205) : par === 4 ? int(300, 410) : int(455, 540);
  const points = Math.ceil((length + 60) / SEG) + 1;
  const heights = [10];
  for (let i = 1; i < points; i++) heights.push(Math.min(26, Math.max(0, heights[i - 1] + int(-7, 7))));
  // The green and its surrounds are level.
  const pin = Math.floor(length / SEG);
  for (let i = pin - 1; i < points; i++) if (i >= 0) heights[i] = heights[Math.max(0, pin - 1)];
  let pond = null;
  if (par > 3) {
    const from = int(Math.floor(length * 0.4), Math.floor(length * 0.7));
    pond = [from, from + int(22, 40)];
  }
  return { par, length, heights, pond, wind: int(-12, 12), slope: int(-2, 2) };
}

/** The hole for a date. Same for everyone. */
export const dailyCourse = (day) => makeCourse(mulberry32(hash(GAME_ID + ":" + day)));

/** Height of the ground at `x` yards from the tee: a smooth curve through the course's heights. */
export function groundY(course, x) {
  const h = course.heights, last = h.length - 1;
  const at = Math.min(Math.max(x, 0), last * SEG - 0.001) / SEG;
  const i = Math.floor(at), u = at - i, s = u * u * (3 - 2 * u);
  return h[i] + (h[Math.min(last, i + 1)] - h[i]) * s;
}
const slopeAt = (course, x) => (groundY(course, x + 1) - groundY(course, x - 1)) / 2;
const inPond = (course, x) => !!course.pond && x > course.pond[0] && x < course.pond[1];

/* ---------------- The two taps ---------------- */

// Both taps pick a moment in a back-and-forth sweep. 0 at the start, 1 at the turn, 0 again.
const sweep = (i, period) => (i <= period / 2 ? i : period - i) / (period / 2);

/** Launch direction for a first tap on tick `i`: [forward, up], a unit vector from low to high. */
export function aimAt(i) {
  const t = TAN_LOW + (TAN_HIGH - TAN_LOW) * sweep(i, AIM_PERIOD);
  return [(1 - t * t) / (1 + t * t), (2 * t) / (1 + t * t)];
}

/** Power for a second tap on tick `j`: 0 to 1. */
export const powerAt = (j) => sweep(j, POWER_PERIOD);

/** Sideways aim of a putt for a first tap on tick `i`: -1 (left) to 1 (right). */
export const puttAimAt = (i) => 2 * sweep(i, PUTT_AIM_PERIOD) - 1;

/* ---------------- A round ---------------- */

/**
 * Fresh round. `x` is the ball (yards from the tee), `strokes` includes penalties, `feet` is
 * the distance to the cup once the ball is on the green (null before), `done` once it's in
 * or picked up.
 */
export const createRound = () => ({ x: 0, strokes: 0, feet: null, done: false, holed: false });

const toPin = (course, round) => Math.abs(course.length - round.x);

/**
 * Start a full shot from where the ball lies. `i` and `j` are the ticks of the aim and power
 * taps. The club is chosen by the distance left, and the ball always plays toward the pin.
 * Step it with stepShot() until `done`, then call endShot().
 */
export function startShot(course, round, i, j) {
  const club = clubFor(toPin(course, round));
  const [fwd, up] = aimAt(i);
  // Speed is set so power is the share of the club's distance: half the bar, half as far.
  const speed = Math.sqrt(club.max * GRAVITY * Math.max(0.05, powerAt(j)));
  const dir = round.x <= course.length ? 1 : -1;
  return { x: round.x, y: groundY(course, round.x), vx: fwd * speed * dir, vy: up * speed, air: true, tick: 0, done: false, wet: false, club: club.name, from: round.x };
}

/** Advance a shot one tick: flight under gravity and wind, then a roll that follows the ground. */
export function stepShot(course, shot) {
  if (shot.done) return;
  shot.tick++;
  if (shot.air) {
    shot.vx += course.wind * WIND;
    shot.vy -= GRAVITY;
    shot.x += shot.vx; shot.y += shot.vy;
    const ground = groundY(course, shot.x);
    if (shot.y > ground) return;
    shot.y = ground; shot.air = false; shot.vx *= ROLL;
  } else {
    const slope = slopeAt(course, shot.x);
    shot.vx -= slope * SLOPE;
    shot.vx = shot.vx > FRICTION ? shot.vx - FRICTION : shot.vx < -FRICTION ? shot.vx + FRICTION : 0;
    shot.x += shot.vx;
    if (shot.vx === 0 && slope < 0.3 && slope > -0.3) shot.done = true;
  }
  // The course ends at the tee and a little way past the green.
  const end = (course.heights.length - 1) * SEG - 1;
  if (shot.x < 0) { shot.x = 0; shot.vx = 0; }
  if (shot.x > end) { shot.x = end; shot.vx = 0; }
  if (!shot.air) shot.y = groundY(course, shot.x);
  if (!shot.air && inPond(course, shot.x)) { shot.wet = true; shot.done = true; }
  if (shot.tick >= 900) shot.done = true;
}

/** Score a finished shot: a stroke, plus one and back where it was hit from if it found water. */
export function endShot(course, round, shot) {
  round.strokes += shot.wet ? 2 : 1;
  if (!shot.wet) round.x = shot.x;
  const left = toPin(course, round);
  if (left <= HOLED) { round.done = true; round.holed = true; }
  else if (left <= GREEN) round.feet = left * 3;
  pickUp(course, round);
}

/** How far off the straight line to the cup a putt aimed on tick `i` is after `r` feet: aim plus the green's break. */
export const puttLine = (course, i, r) => puttAimAt(i) * PUTT_AIM * r + course.slope * BREAK * r * r;

/** How far a full-power putt runs from `d` feet out: always comfortably past the cup. */
export const puttReach = (d) => d * 1.5 + 4;

/**
 * Hit a putt. `i` and `j` are the ticks of the aim and power taps. Returns what happened:
 * { holed, run, drift, feet } where `run` is how far the ball travelled, `drift` how far it
 * finished off the straight line to the cup (negative left), and `feet` what's left.
 */
export function putt(course, round, i, j) {
  const d = round.feet;
  const run = Math.max(0.05, powerAt(j)) * puttReach(d);
  const off = (r) => puttLine(course, i, r);
  const atCup = off(d);
  const holed = run >= d && run <= d + PACE && atCup < CUP && atCup > -CUP;
  const drift = off(run);
  round.strokes++;
  if (holed) { round.done = true; round.holed = true; round.feet = 0; }
  else round.feet = Math.max(0.5, Math.sqrt(drift * drift + (d - run) * (d - run)));
  pickUp(course, round);
  return { holed, run, drift, from: d, feet: round.feet };
}

/** After too many strokes the ball is picked up and the hole scored at the limit. */
function pickUp(course, round) {
  const limit = course.par + EXTRA;
  if (!round.done && round.strokes >= limit) { round.done = true; round.strokes = limit; }
}

/**
 * Replay a whole hole from its taps: one [aim tick, power tick] pair per swing or putt.
 * Returns the finished round, or null if the taps aren't exactly one complete hole.
 */
export function playHole(course, taps) {
  if (!Array.isArray(taps) || taps.length > course.par + EXTRA) return null;
  const round = createRound();
  for (const tap of taps) {
    if (round.done || !Array.isArray(tap) || tap.length !== 2 || !Number.isInteger(tap[0]) || !Number.isInteger(tap[1])) return null;
    const [i, j] = tap;
    if (j < 0 || j >= POWER_PERIOD || i < 0 || i >= (round.feet === null ? AIM_PERIOD : PUTT_AIM_PERIOD)) return null;
    if (round.feet === null) {
      const shot = startShot(course, round, i, j);
      while (!shot.done) stepShot(course, shot);
      endShot(course, round, shot);
    } else putt(course, round, i, j);
  }
  return round.done ? round : null;
}

/* ---------------- Scoring ---------------- */

const NAMES = { "-3": "Albatross", "-2": "Eagle", "-1": "Birdie", 0: "Par", 1: "Bogey", 2: "Double bogey", 3: "Triple bogey" };

/** What golfers call a score: "Birdie", "Par", "Hole in one"... */
export const scoreName = (strokes, par) => (strokes === 1 ? "Hole in one" : NAMES[strokes - par] ?? `${strokes - par} over`);

/** Points for the API, higher is better: 4 for par, one more for each stroke under, one fewer for each over. */
export const pointsFor = (strokes, par) => Math.min(MAX_SCORE, Math.max(0, 4 - (strokes - par)));

/** A score against par the way a scorecard writes it: "−1", "E", "+2". */
export const versusPar = (diff) => (diff === 0 ? "E" : diff > 0 ? `+${diff}` : `−${-diff}`);

/** The text players copy to share: `number` is the puzzle number, `trail` one mark per stroke. */
export function shareText(number, { strokes, par, assist }, trail) {
  return `Hole ${String(number).padStart(3, "0")}: ${scoreName(strokes, par)} (${strokes}, par ${par})${assist ? ` ${ASSIST_MARK}` : ""}\n⛳ ${trail}`;
}
