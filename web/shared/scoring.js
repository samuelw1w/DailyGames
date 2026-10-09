// How a day is scored: the acts, the games in each, and how every game's result becomes 0 to
// 100. No DOM, storage or network code, so the API scores a day with this same file.
//
// A day has two numbers. The score (0 to 600) is what was played: three games from each act,
// up to 100 each. It is what gets shared, ranked and shown to friends. Points are what the day
// adds to the player's balance: the score itself, or what is left of it after Risk.

/** The acts, in playing order. Ids match registry.js. */
export const ACTS = [
  { id: "play", name: "Play", blurb: "Five games of timing", games: ["orbit", "pins", "skip", "hole", "stop"] },
  { id: "know", name: "Know", blurb: "Five games of knowing", games: ["middleman", "year", "close", "jot", "link"] },
];
export const ORDER = ACTS.flatMap((a) => a.games);
export const GAME_POINTS = 100;
/** How many games from each act make up a day's series. */
export const PICKS = 3;
/** The most a day's score can be: three games from each act. */
export const DAY_POINTS = ACTS.length * PICKS * GAME_POINTS;

const clamp = (n) => Math.max(0, Math.min(GAME_POINTS, Math.round(n)));

// Orbit: jumps used, out of five. 100 for one or two, less after that, 10 for not getting there.
const orbitPoints = (won, jumps) => (won ? [100, 100, 90, 75, 60][jumps - 1] ?? 60 : 10);
// Hole: strokes against par.
const holePoints = (diff) => ({ "-1": 88, 0: 72, 1: 52, 2: 34, 3: 18 })[diff] ?? (diff < 0 ? 100 : 6);

// How each older game's own result (as saved in the browser) becomes 0 to 100. Newer games save `points` themselves.
const CONVERT = {
  orbit: (r) => orbitPoints(r.won, r.jumps),
  pins: (r) => r.total / 0.7,                                                   // bowling score: 70 of 90 is full marks
  skip: (r) => r.total * 7,                                                     // best stone: 15 skips is full marks
  hole: (r) => holePoints(r.strokes - r.par),
  middleman: (r) => r.total / 5,                                                // five rounds of 100
};

/** Points (0 to 100) for a game's saved daily result, or null if it hasn't been played. */
export function pointsFor(gameId, result) {
  if (!result) return null;
  if (typeof result.points === "number") return clamp(result.points);
  return CONVERT[gameId] ? clamp(CONVERT[gameId](result)) : 0;
}

// The same, from the score the API worked out for a play (its `plays.score`).
const FROM_SCORE = {
  orbit: (s) => orbitPoints(s > 0, 6 - s),                                      // 5 for one jump ... 1 for five, 0 for none
  pins: (s) => s / 0.7,
  skip: (s) => s * 7,
  hole: (s) => holePoints(4 - s),                                               // 4 for par, one more for each stroke under
  middleman: (s) => s / 5,
};

/** Points (0 to 100) for a game from the score the server stored for it. */
export function pointsFromScore(gameId, score) {
  return clamp(FROM_SCORE[gameId] ? FROM_SCORE[gameId](score) : score);
}

/** Is `lineup` ({ play: [...], know: [...] }) a fair day: up to three different games from each act? */
export function validLineup(lineup) {
  if (!lineup || typeof lineup !== "object") return false;
  return ACTS.every((a) => {
    const ids = lineup[a.id] ?? [];
    return Array.isArray(ids) && ids.length <= PICKS && new Set(ids).size === ids.length && ids.every((id) => a.games.includes(id));
  }) && ACTS.some((a) => (lineup[a.id] ?? []).length);
}
