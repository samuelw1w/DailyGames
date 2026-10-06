// Stakes game rules: five casino tables played with one bankroll. No DOM, storage or network
// code: the browser plays with this file and the API replays the same bets with it.
//
// Every wheel spin, shoe and dice roll comes from the date, so everyone sits down to the same
// five tables. What differs is how much you bet and how you play.
import { hash, mulberry32, shuffle } from "../../../shared/random.js";

export const GAME_ID = "stakes";
export const START = 100;
export const TABLES = ["roulette", "blackjack", "baccarat", "poker", "craps"];
export const TABLE_NAMES = { roulette: "Roulette", blackjack: "Blackjack", baccarat: "Baccarat", poker: "Three Card Poker", craps: "Craps" };
/** Top of the score chart: ten times the starting bankroll. Bigger wins are possible. */
export const MAX_SCORE = START * 10;

const rngFor = (day, table) => mulberry32(hash(`${GAME_ID}:${day}:${table}`));

/* ---------------- Cards ---------------- */

/** A shuffled 52-card deck for one table. Cards are { r, s }: rank 2 to 14 (ace high), suit 0 to 3. */
function deckFor(day, table) {
  const cards = [];
  for (let s = 0; s < 4; s++) for (let r = 2; r <= 14; r++) cards.push({ r, s });
  return shuffle(cards, rngFor(day, table));
}

export const RANKS = { 11: "J", 12: "Q", 13: "K", 14: "A" };
export const SUITS = ["♠", "♥", "♦", "♣"];
export const cardText = (c) => (RANKS[c.r] ?? c.r) + SUITS[c.s];

/* ---------------- Roulette ---------------- */

const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
export const rouletteColor = (n) => (n === 0 ? "green" : REDS.has(n) ? "red" : "black");

/** Bets on a single-zero wheel: [label, what it pays for each unit bet]. A number is "n17". */
export const ROULETTE_BETS = {
  red: ["Red", 1], black: ["Black", 1], odd: ["Odd", 1], even: ["Even", 1], low: ["1 to 18", 1], high: ["19 to 36", 1],
  d1: ["1 to 12", 2], d2: ["13 to 24", 2], d3: ["25 to 36", 2],
};
const validRoulette = (pick) => pick in ROULETTE_BETS || /^n([0-9]|[12][0-9]|3[0-6])$/.test(pick);

function rouletteWins(pick, n) {
  if (pick[0] === "n" && pick.length <= 3) return Number(pick.slice(1)) === n;
  if (n === 0) return false;
  return { red: REDS.has(n), black: !REDS.has(n), odd: n % 2 === 1, even: n % 2 === 0, low: n <= 18, high: n >= 19,
    d1: n <= 12, d2: n > 12 && n <= 24, d3: n > 24 }[pick];
}

/** The day's spin. */
export const rouletteSpin = (day) => Math.floor(rngFor(day, "roulette")() * 37);

function playRoulette(day, bet, { pick }) {
  if (typeof pick !== "string" || !validRoulette(pick)) return null;
  const number = rouletteSpin(day);
  const pays = pick in ROULETTE_BETS ? ROULETTE_BETS[pick][1] : 35;
  return { delta: rouletteWins(pick, number) ? bet * pays : -bet, number, pick };
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
 * Play the day's blackjack hand through `moves`: a string of H (hit), S (stand) and D (double:
 * one more card, twice the bet, only as the first move). One deck, dealer stands on 17, a
 * natural pays 3 to 2, no splitting. Returns { player, dealer, done, doubled, units } where
 * `units` is the result in bets (-2 to 2) once `done`; while the hand is still open, `dealer`
 * shows only his first card. Returns null if a move isn't allowed.
 */
export function blackjack(day, moves = "") {
  const deck = deckFor(day, "blackjack");
  const player = [deck[0], deck[2]], dealer = [deck[1], deck[3]];
  let next = 4, doubled = false, stood = false;
  const finish = (units) => ({ player, dealer, done: true, doubled, units });

  if (natural(player) || natural(dealer)) {
    if (moves) return null;
    return finish(natural(player) ? (natural(dealer) ? 0 : 1.5) : -1);
  }
  for (let i = 0; i < moves.length; i++) {
    if (stood) return null;
    const m = moves[i];
    if (m === "S") stood = true;
    else if (m === "H" || (m === "D" && i === 0)) {
      player.push(deck[next++]);
      if (m === "D") { doubled = true; stood = true; }
      if (handTotal(player) > 21) return i === moves.length - 1 ? finish(doubled ? -2 : -1) : null;
      if (handTotal(player) === 21) stood = true;
    } else return null;
  }
  if (!stood) return { player, dealer: [dealer[0]], done: false, doubled, units: 0 };
  while (handTotal(dealer) < 17) dealer.push(deck[next++]);
  const p = handTotal(player), d = handTotal(dealer);
  return finish((d > 21 || p > d ? 1 : p < d ? -1 : 0) * (doubled ? 2 : 1));
}

function playBlackjack(day, bet, { moves }, bankroll) {
  if (typeof moves !== "string" || moves.length > 12) return null;
  const hand = blackjack(day, moves);
  if (!hand || !hand.done) return null;
  if (hand.doubled && bankroll < bet * 2) return null;
  return { delta: Math.floor(bet * hand.units), player: hand.player, dealer: hand.dealer, moves };
}

/* ---------------- Baccarat ---------------- */

const bacValue = (cards) => cards.reduce((sum, c) => sum + (c.r >= 10 && c.r <= 13 ? 0 : c.r === 14 ? 1 : c.r), 0) % 10;

/** The day's baccarat coup, dealt by the standard third-card rules: { player, banker, winner }. */
export function baccarat(day) {
  const deck = deckFor(day, "baccarat");
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

/** Baccarat bets: [label, what it pays]. Banker pays 19 to 20 (the house keeps 5%). */
export const BACCARAT_BETS = { player: ["Player", "1 to 1"], banker: ["Banker", "19 to 20"], tie: ["Tie", "8 to 1"] };

function playBaccarat(day, bet, { pick }) {
  if (!(pick in BACCARAT_BETS)) return null;
  const coup = baccarat(day);
  let delta = -bet;
  if (pick === coup.winner) delta = pick === "tie" ? bet * 8 : pick === "banker" ? Math.floor((bet * 19) / 20) : bet;
  else if (coup.winner === "tie") delta = 0; // a tie returns Player and Banker bets
  return { delta, ...coup, pick };
}

/* ---------------- Three Card Poker ---------------- */

/** Rank a three-card hand as a list that compares left to right: [category, high cards...]. */
export function rank3(cards) {
  const r = cards.map((c) => c.r).sort((a, b) => b - a);
  const flush = cards.every((c) => c.s === cards[0].s);
  const wheel = r[0] === 14 && r[1] === 3 && r[2] === 2; // A-2-3 plays as the lowest straight
  const straight = wheel || (r[0] - r[1] === 1 && r[1] - r[2] === 1);
  const top = wheel ? [3, 2, 1] : r;
  if (straight && flush) return [5, ...top];
  if (r[0] === r[2]) return [4, ...r];
  if (straight) return [3, ...top];
  if (flush) return [2, ...r];
  if (r[0] === r[1] || r[1] === r[2]) return [1, r[1], r[0] === r[1] ? r[2] : r[0]];
  return [0, ...r];
}
export const HAND_NAMES = ["High card", "Pair", "Flush", "Straight", "Three of a kind", "Straight flush"];
const compare = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; };

/** The day's poker hands: { player, dealer }, three cards each. */
export function pokerDeal(day) {
  const deck = deckFor(day, "poker");
  return { player: [deck[0], deck[2], deck[4]], dealer: [deck[1], deck[3], deck[5]] };
}

/**
 * Settle the poker hand. `ante` is the bet; playing on costs up to the same again (`extra`).
 * Folding loses the ante. If the dealer doesn't have queen high or better, the ante wins and
 * the extra bet is returned. Otherwise the better hand takes both bets.
 */
export function pokerResult(day, ante, extra, play) {
  const { player, dealer } = pokerDeal(day);
  const mine = rank3(player), his = rank3(dealer);
  const qualifies = compare(his, [0, 12, 0, 0]) >= 0;
  let delta = -ante, outcome = "fold";
  if (play) {
    const diff = compare(mine, his);
    if (!qualifies) { delta = ante; outcome = "unqualified"; }
    else { delta = Math.sign(diff) * (ante + extra) + 0; outcome = diff > 0 ? "win" : diff < 0 ? "lose" : "tie"; }
  }
  return { delta, outcome, player, dealer, hands: [HAND_NAMES[mine[0]], HAND_NAMES[his[0]]], qualifies };
}

function playPoker(day, bet, { play }, bankroll) {
  if (typeof play !== "boolean") return null;
  return { ...pokerResult(day, bet, Math.min(bet, bankroll - bet), play), play };
}

/* ---------------- Craps ---------------- */

/** The day's dice: every roll until the pass line is settled. { rolls: [[d1, d2], ...], point, pass }. */
export function craps(day) {
  const rng = rngFor(day, "craps");
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

export const CRAPS_BETS = { pass: ["Pass", "1 to 1"], dont: ["Don't pass", "1 to 1"] };

function playCraps(day, bet, { pick }) {
  if (!(pick in CRAPS_BETS)) return null;
  const game = craps(day);
  const first = game.rolls[0][0] + game.rolls[0][1];
  // Don't pass is the mirror of pass, except a 12 on the first roll is a stand-off.
  const delta = pick === "pass" ? (game.pass ? bet : -bet) : game.point === null && first === 12 ? 0 : game.pass ? -bet : bet;
  return { delta, ...game, pick };
}

/* ---------------- The day ---------------- */

const PLAYERS = { roulette: playRoulette, blackjack: playBlackjack, baccarat: playBaccarat, poker: playPoker, craps: playCraps };

/**
 * Play one table. `play` is { bet, ...choice } (the choice depends on the table). Returns the
 * result with `delta` (the change in bankroll), or null if the bet or the choice isn't allowed.
 */
export function playTable(day, index, bankroll, play) {
  const bet = play?.bet;
  if (!Number.isInteger(bet) || bet < 1 || bet > bankroll) return null;
  const result = PLAYERS[TABLES[index]](day, bet, play, bankroll);
  return result && { table: TABLES[index], bet, ...result };
}

/**
 * Replay a whole day from its plays. Returns { bankroll, results, bust }, or null unless
 * `plays` is exactly one complete day: all five tables, or every table up to going bust.
 */
export function playDay(day, plays) {
  if (!Array.isArray(plays) || plays.length > TABLES.length) return null;
  let bankroll = START;
  const results = [];
  for (let i = 0; i < plays.length; i++) {
    if (bankroll === 0) return null;
    const result = playTable(day, i, bankroll, plays[i]);
    if (!result) return null;
    bankroll += result.delta;
    results.push(result);
  }
  if (bankroll > 0 && results.length < TABLES.length) return null;
  return { bankroll, results, bust: bankroll === 0 };
}

/** A bankroll as a multiple of the start, e.g. "2.4×". */
export const multiple = (bankroll) => `${(Math.floor((bankroll / START) * 10) / 10).toFixed(1).replace(/\.0$/, "")}×`;

/** Short result text: the multiple, or where it went wrong. Also what the hub shows. */
export const resultLabel = ({ bankroll, bust }) => (bust ? "Bust" : multiple(bankroll));

/** The text players copy to share: the multiple and how each table went. `title` is e.g. "Stakes #12". */
export function shareText(title, { bankroll, deltas, bust }) {
  const blocks = deltas.map((d) => (d > 0 ? "🟩" : d < 0 ? "🟥" : "⬜")).join("");
  return `${title} · ${bust ? "Bust" : multiple(bankroll)}\n🎲 ${blocks} ${START} → ${bankroll}`;
}
