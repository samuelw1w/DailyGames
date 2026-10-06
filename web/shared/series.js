// The Series: each day a player picks up to three games from each of two acts, plays them
// in order, then may take an optional trip to
// Risk (the casino tables). Every game is worth up to 100 points, so each act is out of 500 and the day
// out of 1,000. This file is the one place that knows the order and how results become points.
import { gameStore } from "./storage.js";
import { dayKey } from "./daily.js";
import { isUnlocked, spentPoints } from "./account.js";

/** The acts, in playing order. Ids match registry.js. */
export const ACTS = [
  { id: "play", name: "Play", blurb: "Five games of timing", games: ["orbit", "pins", "skip", "hole", "stop"] },
  { id: "know", name: "Know", blurb: "Five games of knowing", games: ["middleman", "year", "close", "jot", "link"] },
];
export const ORDER = ACTS.flatMap((a) => a.games);
export const GAME_POINTS = 100;
/** The most a day can be worth before Risk: three games from each act. */
export const DAY_POINTS = ACTS.length * 3 * GAME_POINTS;
/** The finale. Not one of the ten: your day's points become your bankroll there. */
export const FINALE = "house";

const clamp = (n) => Math.max(0, Math.min(GAME_POINTS, Math.round(n)));

// How each older game's own result becomes 0 to 100. Newer games save `points` themselves.
const CONVERT = {
  orbit: (r) => (r.won ? [100, 100, 90, 75, 60][r.jumps - 1] : 10),            // jumps used, out of 5
  pins: (r) => r.total / 0.7,                                                   // bowling score: 70 of 90 is full marks
  skip: (r) => r.total * 7,                                                     // best stone: 15 skips is full marks
  hole: (r) => ({ "-1": 88, 0: 72, 1: 52, 2: 34, 3: 18 })[r.strokes - r.par] ?? (r.strokes < r.par ? 100 : 6),
  middleman: (r) => r.total / 5,                                                // five rounds of 100
};

/** Points (0 to 100) for a game's saved daily result, or null if it hasn't been played. */
export function pointsFor(gameId, result) {
  if (!result) return null;
  if (typeof result.points === "number") return clamp(result.points);
  return CONVERT[gameId] ? clamp(CONVERT[gameId](result)) : 0;
}

/** How many games from each act make up a day's series. */
export const PICKS = 3;

/** The games in an act this player may choose from: the free ones, plus any they have unlocked. */
export const available = (act) => act.games.filter(isUnlocked);

/**
 * The day's lineup: which games (up to three per act) the player chose to play for points,
 * as { play: [...], know: [...] }. Until they choose, it is the first three they have in each act.
 */
export function lineupFor(day = dayKey()) {
  const saved = gameStore("series").flag(`lineup.${day}`);
  if (saved) return Object.fromEntries(ACTS.map((a) => [a.id, (saved[a.id] ?? []).filter((id) => a.games.includes(id)).slice(0, PICKS)]));
  return Object.fromEntries(ACTS.map((a) => [a.id, available(a).slice(0, PICKS)]));
}

/** Save the day's lineup. `picks` is { play: [...], know: [...] }; extras and locked games are dropped. */
export function chooseLineup(day, picks) {
  const lineup = Object.fromEntries(ACTS.map((a) => [a.id, (picks[a.id] ?? []).filter((id) => available(a).includes(id)).slice(0, PICKS)]));
  gameStore("series").setFlag(`lineup.${day}`, lineup);
  return lineup;
}

/**
 * Where the day's series stands for this player. The series is their lineup: up to three
 * games from each act. Returns points per game (null if unplayed), the acts with their `open`
 * (chosen) games and totals, the `max` the day can be worth, the next game to play,
 * `needsPick` while the lineup is still to be chosen, and `final` once the score is locked in
 * or taken through Risk.
 */
export function seriesState(day = dayKey()) {
  const lineup = lineupFor(day);
  const open = lineup ? ACTS.flatMap((a) => lineup[a.id]) : [];
  const points = Object.fromEntries(ORDER.map((id) => [id, pointsFor(id, gameStore(id).getDay(day))]));
  const acts = ACTS.map((a) => {
    const mine = lineup ? lineup[a.id] : [];
    return { ...a, open: mine, max: mine.length * GAME_POINTS, points: mine.reduce((sum, id) => sum + (points[id] ?? 0), 0), done: !!lineup && mine.every((id) => points[id] !== null) };
  });
  const played = open.filter((id) => points[id] !== null).length;
  const total = acts.reduce((sum, a) => sum + a.points, 0);
  const saved = gameStore("series").getDay(day);
  return { day, lineup, needsPick: !lineup, open, points, acts, played, total, max: open.length * GAME_POINTS, next: open.find((id) => points[id] === null) ?? null, complete: !!lineup && open.length > 0 && played === open.length, final: saved ?? null };
}

/** Every day this browser has a result for. */
export const playedDays = () => [...new Set([...ORDER, "series"].flatMap((id) => Object.keys(gameStore(id).history())))];

/**
 * A day's banked score: what it added to the player's points. A finished day banks its final
 * score (after Risk). An earlier day that was never finished banks what was scored. Today
 * banks nothing until it is locked in or taken through Risk.
 */
export function bankedOn(day, today = dayKey()) {
  const s = seriesState(day);
  return s.final ? s.final.total : day < today ? s.total : 0;
}

/**
 * The player's points: `earned` is every day's banked score added up (this is what friends
 * see), `spent` what has gone on unlocking games, and `balance` what is left to spend.
 */
export function wallet() {
  const earned = playedDays().reduce((sum, day) => sum + bankedOn(day), 0);
  const spent = spentPoints();
  return { earned, spent, balance: earned - spent };
}

/** Keep the day's score as it stands, without risking it at the tables. */
export function lockIn(day = dayKey()) {
  const s = seriesState(day);
  if (!s.complete || s.final) return s.final;
  const final = { total: s.total, base: s.total, house: null };
  gameStore("series").saveDay(day, final, final.total);
  return final;
}

/** Record the day's score after Risk: `bankroll` is the points left once the multiplier is applied, `deltas` how each hand went. */
export function saveHouse(day, base, bankroll, deltas) {
  const final = { total: bankroll, base, house: { bankroll, deltas } };
  gameStore("series").saveDay(day, final, final.total);
  return final;
}

/** A multiple the way the result reads: "1.6×". */
export const times = (n) => `${(Math.floor(n * 10) / 10).toFixed(1).replace(/\.0$/, "")}×`;

const tier = (p) => (p === null ? "⬜" : p >= 85 ? "🟩" : p >= 55 ? "🟨" : p >= 25 ? "🟧" : "🟥");

/** The text players copy to share for the whole day. */
export function seriesShare(number, s) {
  const [play, know] = s.acts;
  const blocks = (act) => act.open.map((id) => tier(s.points[id])).join("");
  const head = `Daily Hub #${number} · ${(s.final?.total ?? s.total).toLocaleString("en-US")}`;
  const house = s.final?.house ? (s.final.total === 0 ? `\n🎲 Risk: bust from ${s.final.base}` : `\n🎲 Risk: ${s.final.base} → ${s.final.total.toLocaleString("en-US")} (${times(s.final.total / s.final.base)})`) : "";
  return `${head}\n${blocks(play)} Play ${play.points}\n${blocks(know)} Know ${know.points}${house}`;
}
