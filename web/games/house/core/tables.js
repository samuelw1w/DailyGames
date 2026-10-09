// Risk game rules: up to five win-or-lose hands at the casino tables. No DOM, storage or
// network code: the browser plays with this file and the API replays the same choices with it.
//
// There are no chips. The player sits down with a multiplier of 1.0×; every hand won adds
// 0.2, every hand lost takes 0.2 away, and a push leaves it alone. Five hands at most, so the
// day's points end up multiplied by something between 0× and 2×. Risk only ever moves points
// (what unlocks games), never the day's score. Because a hand can only be won or lost, every
// table offers even-money choices only.
//
// Every spin, shoe and dice roll comes from a seed, the table and the hand number. For the
// daily tables the seed is made on the server from a secret, the day and the player
// (api/src/risk.js), so everyone gets their own hands and nobody can work them out in advance;
// the server deals each hand only once the player has committed to it. Practice tables use a
// random seed in the browser. The functions below call the seed `day`.
import { hash, mulberry32, shuffle } from "../../../shared/random.js";
import { DAY_POINTS } from "../../../shared/scoring.js";

export const GAME_ID = "house";
/** Hands a player may play in a day, at any tables they like. They can stop after any hand. */
export const HANDS = 5;
/** How far one hand moves the multiplier, in tenths: 2 is 0.2×. */
export const STEP = 2;
export const TABLES = ["roulette", "blackjack", "sicbo", "baccarat", "craps"];
export const TABLE_NAMES = { roulette: "Roulette", blackjack: "Blackjack", sicbo: "Sic Bo", baccarat: "Baccarat", craps: "Craps" };
/** Top of the API's chart of points after Risk: a perfect day's score doubled. */
export const MAX_SCORE = 2 * DAY_POINTS;

const rngFor = (day, table, hand) => mulberry32(hash(`${GAME_ID}:${day}:${table}:${hand}`));

/* ---------------- Cards ---------------- */

/** A shuffled 52-card deck for one hand. Cards are { r, s }: rank 2 to 14 (ace high), suit 0 to 3. */
function deckFor(day, table, hand) {
  const cards = [];
  for (let s = 0; s < 4; s++) for (let r = 2; r <= 14; r++) cards.push({ r, s });
  return shuffle(cards, rngFor(day, table, hand));
}

export const RANKS = { 11: "J", 12: "Q", 13: "K", 14: "A" };
export const SUITS = ["♠", "♥", "♦", "♣"];

/* ---------------- Roulette ---------------- */

const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
export const rouletteColor = (n) => (n === 0 ? "green" : REDS.has(n) ? "red" : "black");

/** The even-money bets on a single-zero wheel. Zero beats all of them. */
export const ROULETTE_PICKS = { red: "Red", black: "Black", odd: "Odd", even: "Even", low: "1 to 18", high: "19 to 36" };

/** The spin for a hand. */
export const rouletteSpin = (day, hand = 0) => Math.floor(rngFor(day, "roulette", hand)() * 37);

function playRoulette(day, hand, { pick }) {
  if (!Object.hasOwn(ROULETTE_PICKS, pick)) return null;
  const number = rouletteSpin(day, hand);
  const hit = number !== 0 && { red: REDS.has(number), black: !REDS.has(number), odd: number % 2 === 1, even: number % 2 === 0, low: number <= 18, high: number >= 19 }[pick];
  return { outcome: hit ? 1 : -1, number, pick };
}

/* ---------------- Blackjack ---------------- */

/** Best total of a hand, counting aces as 11 where that doesn't bust. */
export function handTotal(cards) {
  let total = 0, aces = 0;
  for (const c of cards) {
    if (c.r === 14) { aces++; total += 11; } else total += Math.min(c.r, 10);
  }
  while (total > 21 && aces) { total -= 10; aces--; }
  return total;
}
const natural = (cards) => cards.length === 2 && handTotal(cards) === 21;

/**
 * Play a blackjack hand through `moves`: a string of H (hit) and S (stand). One deck, dealer
 * stands on 17, no doubling or splitting. Returns { player, dealer, done, outcome } where
 * `outcome` is 1 (won), 0 (push) or -1 (lost) once `done`; while the hand is still open,
 * `dealer` shows only his first card. Returns null if a move isn't allowed.
 */
export function blackjack(day, moves = "", hand = 0) {
  const deck = deckFor(day, "blackjack", hand);
  const player = [deck[0], deck[2]], dealer = [deck[1], deck[3]];
  let next = 4, stood = false;
  const finish = (outcome) => ({ player, dealer, done: true, outcome });

  if (natural(player) || natural(dealer)) {
    if (moves) return null;
    return finish(natural(player) ? (natural(dealer) ? 0 : 1) : -1);
  }
  for (let i = 0; i < moves.length; i++) {
    if (stood) return null;
    if (moves[i] === "S") stood = true;
    else if (moves[i] === "H") {
      player.push(deck[next++]);
      if (handTotal(player) > 21) return i === moves.length - 1 ? finish(-1) : null;
      if (handTotal(player) === 21) stood = true;
    } else return null;
  }
  if (!stood) return { player, dealer: [dealer[0]], done: false, outcome: 0 };
  while (handTotal(dealer) < 17) dealer.push(deck[next++]);
  const p = handTotal(player), d = handTotal(dealer);
  return finish(d > 21 || p > d ? 1 : p < d ? -1 : 0);
}

function playBlackjack(day, hand, { moves }) {
  if (typeof moves !== "string" || moves.length > 12) return null;
  const h = blackjack(day, moves, hand);
  return h && h.done ? { outcome: h.outcome, player: h.player, dealer: h.dealer, moves } : null;
}

/* ---------------- Sic Bo ---------------- */

/** Small (a total of 4 to 10) or big (11 to 17). Three of a kind beats both. */
export const SICBO_PICKS = { small: "Small", big: "Big" };

/** The three dice for a hand. */
export function sicbo(day, hand = 0) {
  const rng = rngFor(day, "sicbo", hand);
  return [1, 2, 3].map(() => 1 + Math.floor(rng() * 6));
}

function playSicbo(day, hand, { pick }) {
  if (!Object.hasOwn(SICBO_PICKS, pick)) return null;
  const dice = sicbo(day, hand), total = dice[0] + dice[1] + dice[2];
  const triple = dice[0] === dice[1] && dice[1] === dice[2];
  return { outcome: !triple && (pick === "small" ? total <= 10 : total >= 11) ? 1 : -1, dice, pick };
}

/* ---------------- Baccarat ---------------- */

const bacValue = (cards) => cards.reduce((sum, c) => sum + (c.r >= 10 && c.r <= 13 ? 0 : c.r === 14 ? 1 : c.r), 0) % 10;

/** Back the player or the banker. A tie is a push. */
export const BACCARAT_PICKS = { player: "Player", banker: "Banker" };

/** The baccarat coup for a hand, dealt by the standard third-card rules: { player, banker, totals, winner }. */
export function baccarat(day, hand = 0) {
  const deck = deckFor(day, "baccarat", hand);
  const player = [deck[0], deck[2]], banker = [deck[1], deck[3]];
  let next = 4;
  if (bacValue(player) < 8 && bacValue(banker) < 8) {
    let third = null;
    if (bacValue(player) <= 5) { player.push(deck[next++]); third = bacValue([player[2]]); }
    const b = bacValue(banker);
    const draws = third === null ? b <= 5
      : b <= 2 || (b === 3 && third !== 8) || (b === 4 && third >= 2 && third <= 7) || (b === 5 && third >= 4 && third <= 7) || (b === 6 && (third === 6 || third === 7));
    if (draws) banker.push(deck[next++]);
  }
  const p = bacValue(player), b = bacValue(banker);
  return { player, banker, totals: [p, b], winner: p > b ? "player" : b > p ? "banker" : "tie" };
}

function playBaccarat(day, hand, { pick }) {
  if (!Object.hasOwn(BACCARAT_PICKS, pick)) return null;
  const coup = baccarat(day, hand);
  return { outcome: coup.winner === "tie" ? 0 : coup.winner === pick ? 1 : -1, ...coup, pick };
}

/* ---------------- Craps ---------------- */

/** The pass line or against it. On don't pass, a 12 on the first roll is a push. */
export const CRAPS_PICKS = { pass: "Pass", dont: "Don't pass" };

/** The dice for a hand: every roll until the pass line is settled. { rolls: [[d1, d2], ...], point, pass }. */
export function craps(day, hand = 0) {
  const rng = rngFor(day, "craps", hand);
  const roll = () => [1 + Math.floor(rng() * 6), 1 + Math.floor(rng() * 6)];
  const rolls = [roll()];
  const first = rolls[0][0] + rolls[0][1];
  if (first === 7 || first === 11) return { rolls, point: null, pass: true };
  if (first === 2 || first === 3 || first === 12) return { rolls, point: null, pass: false };
  for (;;) {
    const r = roll();
    rolls.push(r);
    if (r[0] + r[1] === first) return { rolls, point: first, pass: true };
    if (r[0] + r[1] === 7) return { rolls, point: first, pass: false };
  }
}

function playCraps(day, hand, { pick }) {
  if (!Object.hasOwn(CRAPS_PICKS, pick)) return null;
  const game = craps(day, hand);
  const standoff = pick === "dont" && game.point === null && game.rolls[0][0] + game.rolls[0][1] === 12;
  return { outcome: standoff ? 0 : game.pass === (pick === "pass") ? 1 : -1, ...game, pick };
}

/* ---------------- The day ---------------- */

const PLAYERS = { roulette: playRoulette, blackjack: playBlackjack, sicbo: playSicbo, baccarat: playBaccarat, craps: playCraps };

/**
 * Play one hand. `hand` is its number in the day (0 to 4). `play` is { table, pick }, or
 * { table, moves } for blackjack. Returns the result with `outcome` (1 won, 0 push, -1 lost),
 * or null if the table or the choice isn't allowed.
 */
export function playTable(day, hand, play) {
  if (!play || typeof play !== "object" || !TABLES.includes(play.table)) return null;
  const result = PLAYERS[play.table](day, hand, play);
  return result && { table: play.table, ...result };
}

/** The multiplier after these outcomes, in tenths: 10 is 1.0×. Each win adds STEP, each loss takes it away. */
export const tenthsAfter = (outcomes) => 10 + STEP * outcomes.reduce((a, b) => a + b, 0);

/** The day's points after Risk: `base` points times a multiplier given in tenths. */
export const scoreAt = (base, tenths) => Math.round((base * tenths) / 10);

/**
 * Replay a day from its plays: one to five hands, at any tables, in the order played (the
 * player may stop after any of them). Returns { outcomes, tenths, results }, or null if a
 * hand isn't allowed.
 */
export function playDay(day, plays) {
  if (!Array.isArray(plays) || !plays.length || plays.length > HANDS) return null;
  const results = [];
  for (let i = 0; i < plays.length; i++) {
    const result = playTable(day, i, plays[i]);
    if (!result) return null;
    results.push(result);
  }
  const outcomes = results.map((r) => r.outcome);
  return { outcomes, tenths: tenthsAfter(outcomes), results };
}

/** A multiplier in tenths the way it reads: "1.4×". */
export const multiple = (tenths) => `${(tenths / 10).toFixed(1)}×`;

/** What one hand did to the multiplier: "+0.2×", "−0.2×" or "Push". */
export const stepText = (outcome) => (outcome > 0 ? `+${(STEP / 10).toFixed(1)}×` : outcome < 0 ? `−${(STEP / 10).toFixed(1)}×` : "Push");

/** The text players copy to share: the multiplier and how each hand went. `title` is e.g. "Risk #12". */
export function shareText(title, outcomes) {
  const blocks = outcomes.map((o) => (o > 0 ? "🟩" : o < 0 ? "🟥" : "⬜")).join("");
  return `${title} · ${multiple(tenthsAfter(outcomes))}\n🎲 ${blocks}`;
}
