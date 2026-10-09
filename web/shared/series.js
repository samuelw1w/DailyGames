// The Series: each day a player picks up to three games from each of two acts, plays them in
// order, then may take an optional trip to Risk (the casino tables).
//
// A day has a score and points. The score is what was played, 0 to 600 (three games from each
// act, up to 100 each): it is what gets shared, ranked and compared with friends, and Risk never
// touches it. Points are what the day adds to the balance that unlocks games: the score as it
// stands if it is banked, or what Risk made of it (0× to 2×). The acts and how each game's
// result becomes 0 to 100 live in scoring.js, which the API shares.
import { gameStore, clientId } from "./storage.js";
import { dayKey, parseDayKey } from "./daily.js";
import { isUnlocked, spentPoints } from "./account.js";
import { submitPlay } from "./api.js";
import { ACTS, ORDER, GAME_POINTS, PICKS, DAY_POINTS, pointsFor } from "./scoring.js";

export { ACTS, ORDER, GAME_POINTS, PICKS, DAY_POINTS, pointsFor };
/** The finale. Not one of the ten: Risk plays for points, never for the day's score. */
export const FINALE = "house";

/** The games in an act this player may choose from: the free ones, plus any they have unlocked. */
export const available = (act) => act.games.filter(isUnlocked);

/** Has any game in this act been played for that day? From then on the act's lineup is fixed. */
export const actStarted = (day, act) => act.games.some((id) => !!gameStore(id).getDay(day));

/**
 * The day's lineup: which games (up to three per act) the player chose to play for points,
 * as { play: [...], know: [...] }. Until they choose, it is the first three they have in each act.
 * Once a game is played the lineup is saved as it stands, so it can't shift later (when Plus
 * opens more games, say).
 */
export function lineupFor(day = dayKey()) {
  const store = gameStore("series");
  const saved = store.flag(`lineup.${day}`);
  if (saved) return Object.fromEntries(ACTS.map((a) => [a.id, (saved[a.id] ?? []).filter((id) => a.games.includes(id)).slice(0, PICKS)]));
  const lineup = Object.fromEntries(ACTS.map((a) => [a.id, available(a).slice(0, PICKS)]));
  if (ACTS.some((a) => actStarted(day, a))) store.setFlag(`lineup.${day}`, lineup);
  return lineup;
}

/**
 * Save the day's lineup. `picks` is { play: [...], know: [...] }; extras and locked games are
 * dropped. An act that has started keeps its games: choosing after seeing scores would let a
 * player play all five and count the best three.
 */
export function chooseLineup(day, picks) {
  const now = lineupFor(day);
  const lineup = Object.fromEntries(ACTS.map((a) => [a.id, actStarted(day, a) ? now[a.id]
    : (picks[a.id] ?? []).filter((id) => available(a).includes(id)).slice(0, PICKS)]));
  gameStore("series").setFlag(`lineup.${day}`, lineup);
  return lineup;
}

/**
 * Where the day's series stands for this player. The series is their lineup: up to three
 * games from each act. Returns points per game (null if unplayed), the acts with their `open`
 * (chosen) games and totals, `total` (the day's score so far) out of `max`, the next game to
 * play, and `final` once the day is banked or taken through Risk: { total: points banked,
 * base: the score, house }. `late` is true for a day played after it was over (an archive
 * score: shown, but not ranked and not part of a streak).
 */
export function seriesState(day = dayKey()) {
  const lineup = lineupFor(day);
  const open = ACTS.flatMap((a) => lineup[a.id]);
  const points = Object.fromEntries(ORDER.map((id) => [id, pointsFor(id, gameStore(id).getDay(day))]));
  const acts = ACTS.map((a) => {
    const mine = lineup[a.id];
    return { ...a, open: mine, started: actStarted(day, a), max: mine.length * GAME_POINTS, points: mine.reduce((sum, id) => sum + (points[id] ?? 0), 0), done: mine.every((id) => points[id] !== null) };
  });
  const played = open.filter((id) => points[id] !== null).length;
  const total = acts.reduce((sum, a) => sum + a.points, 0);
  const saved = gameStore("series").getDay(day);
  const late = open.some((id) => points[id] !== null && !gameStore(id).onTime(day));
  return { day, lineup, open, points, acts, played, total, late, max: open.length * GAME_POINTS, next: open.find((id) => points[id] === null) ?? null, complete: open.length > 0 && played === open.length, final: saved ?? null };
}

/** Every day this browser has a result for. */
export const playedDays = () => [...new Set([...ORDER, "series"].flatMap((id) => Object.keys(gameStore(id).history())))];

/**
 * A day's banked points: what it added to the player's balance. A finished day banks its
 * points (the score, or what Risk made of it). An earlier day that was never finished banks
 * what was scored. Today banks nothing until it is banked or taken through Risk. Days played
 * later (archive days) bank their points too.
 */
export function bankedOn(day, today = dayKey()) {
  const s = seriesState(day);
  return s.final ? s.final.total : day < today ? s.total : 0;
}

/**
 * The player's points: `earned` is every day's banked points added up, `spent` what has gone
 * on unlocking games, and `balance` what is left to spend. Scores are separate (seriesState).
 */
export function wallet() {
  const earned = playedDays().reduce((sum, day) => sum + bankedOn(day), 0);
  const spent = spentPoints();
  return { earned, spent, balance: earned - spent };
}

/**
 * Days in a row with at least one daily game played on the day itself, up to today (or
 * yesterday, while today hasn't been played yet). Days played later don't count.
 */
export function dayStreak(today = dayKey()) {
  const onTime = new Set(ORDER.flatMap((id) => { const g = gameStore(id); return Object.keys(g.history()).filter(g.onTime); }));
  const d = parseDayKey(today);
  if (!onTime.has(today)) d.setDate(d.getDate() - 1);
  let streak = 0;
  while (onTime.has(dayKey(d))) { streak++; d.setDate(d.getDate() - 1); }
  return streak;
}

/** Bank the day's score as points, without risking it at the tables. */
export function lockIn(day = dayKey()) {
  const s = seriesState(day);
  if (!s.complete || s.final) return s.final;
  const final = { total: s.total, base: s.total, house: null };
  gameStore("series").saveDay(day, final, final.total);
  return final;
}

/** Record what Risk made of the day's points: `bankroll` is the points left once the multiplier is applied, `deltas` how each hand went. */
export function saveHouse(day, base, bankroll, deltas) {
  const final = { total: bankroll, base, house: { bankroll, deltas } };
  gameStore("series").saveDay(day, final, final.total);
  return final;
}

/**
 * Send a finished day's lineup to the server, which works out the score from the plays it
 * already holds. That score is what the day is ranked on (the bell curve, the leaderboard)
 * and what Risk starts from. Sent once; resolves to true once the server has it, or null.
 */
export async function reportDay(day = dayKey()) {
  const s = seriesState(day), store = gameStore("series");
  if (!s.complete || s.late) return null;
  if (store.flag(`sent.${day}`)) return true;
  const res = await submitPlay("series", day, clientId(), { lineup: s.lineup });
  if (!res) return null;
  store.setFlag(`sent.${day}`, true);
  return true;
}

/** A multiple the way the result reads: "1.6×". */
export const times = (n) => `${(Math.floor(n * 10) / 10).toFixed(1).replace(/\.0$/, "")}×`;

const tier = (p) => (p === null ? "⬜" : p >= 85 ? "🟩" : p >= 55 ? "🟨" : p >= 25 ? "🟧" : "🟥");

/** The text players copy to share for the whole day. */
export function seriesShare(number, s) {
  const [play, know] = s.acts;
  const blocks = (act) => act.open.map((id) => tier(s.points[id])).join("");
  const head = `Daily Hub #${number} · ${s.total}/${s.max}${s.late ? " (played later)" : ""}`;
  const house = s.final?.house ? `\n🎲 Risk: ${s.final.total === 0 ? "bust" : times(s.final.total / s.final.base)}` : "";
  return `${head}\n${blocks(play)} Play ${play.points}\n${blocks(know)} Know ${know.points}${house}`;
}
