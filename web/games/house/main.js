// Risk UI: up to five win-or-lose hands at the tables. Rules live in core/tables.js.
import {
  GAME_ID, HANDS, TABLES, TABLE_NAMES, RANKS, SUITS, ROULETTE_PICKS, SICBO_PICKS, BACCARAT_PICKS, CRAPS_PICKS,
  rouletteColor, handTotal, blackjack, craps, playTable, tenthsAfter, scoreAt, multiple, stepText, shareText,
} from "./core/tables.js";
import { puzzleNumber } from "../../shared/daily.js";
import { gameStore, clientId } from "../../shared/storage.js";
import { activeDay } from "../../shared/account.js";
import { submitPlay } from "../../shared/api.js";
import { confetti } from "../../shared/confetti.js";
import { modal, wireShare } from "../../shared/ui.js";
import { seriesState, saveHouse, lockIn } from "../../shared/series.js";
import { GAMES } from "../../shared/registry.js";

const META = GAMES.find((g) => g.id === GAME_ID);
const TODAY = activeDay(); // today, or an earlier day a Plus member has opened
const PUZZLE_NO = puzzleNumber(META.launchDay, TODAY);
const store = gameStore(GAME_ID);
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

const DEAL = reduce ? 0 : 260;    // ms between one dealt card and the next
const SPIN = reduce ? 0 : 2400;   // ms the wheel turns
const TUMBLE = reduce ? 0 : 650;  // ms the dice tumble
const PRACTICE_POINTS = 500;      // what a practice run pretends you brought

const $ = (s) => document.querySelector(s);
const view = $("#view");
$("#stamp").textContent = `No. ${PUZZLE_NO}`;

const RULES = {
  roulette: "One spin. Pick a side; zero beats them all.",
  blackjack: "Closest to 21 wins. The dealer stands on 17.",
  sicbo: "Three dice, one throw. Small is 4 to 10, big is 11 to 17. Three of a kind beats both.",
  baccarat: "Closest to 9 wins. Back the player or the banker; a tie is a push.",
  craps: "7 or 11 first wins the pass line; 2, 3 or 12 loses. Otherwise that number is the point: roll it again before a 7.",
};
const BLURBS = { roulette: "One spin of the wheel", blackjack: "Beat the dealer to 21", sicbo: "Three dice, one throw", baccarat: "Player or banker", craps: "Roll the dice yourself" };
const PICKS = { roulette: ROULETTE_PICKS, sicbo: SICBO_PICKS, baccarat: BACCARAT_PICKS, craps: CRAPS_PICKS };

// The run in progress: { mode, day, base, plays, outcomes, table, pick, moves, shown }.
// `day` is the date key, or a random word for a practice run, and seeds every hand.
// `base` is the day's points being risked. `table` is the one chosen for the next hand.
let S = null;

const tenths = () => tenthsAfter(S.outcomes);
const points = (t = tenths()) => scoreAt(S.base, t);
const hand = () => S.plays.length; // the number of the hand about to be played, from 0

/**
 * Remember the daily run after every step. The day's spins and cards are fixed, so without
 * this a reload would let a player see a hand and then choose again. `locked` is set once
 * cards or dice are out.
 */
function saveRun(locked = false) {
  if (S.mode !== "daily") return;
  store.setFlag("run", { day: TODAY, plays: S.plays, locked: locked ? { table: S.table, pick: S.pick, moves: S.moves } : null });
}

/* ---------------- Pieces ---------------- */

const tone = (n) => (n > 0 ? "up" : n < 0 ? "down" : "flat");
const segClass = (o) => (o > 0 ? "on" : o < 0 ? "bad" : "mid");

/** A card. `i` is its place in the deal (it slides in after i others); leave it out for a card already on the table. */
const card = (c, i = null) => `<span class="card ${c.s === 1 || c.s === 2 ? "warm" : ""} ${i === null ? "" : "in"}" style="--i:${i ?? 0}">${RANKS[c.r] ?? c.r}<i>${SUITS[c.s]}</i></span>`;
const hidden = (i = null) => `<span class="card back ${i === null ? "" : "in"}" style="--i:${i ?? 0}">?</span>`;
const cards = (who, html, total = "") => `<div class="hand"><span class="who">${who}</span><span class="cards">${html}</span><span class="sum">${total}</span></div>`;
/** Something that should only appear once the cards, wheel or dice have finished, `wait` ms from now. */
const late = (html, wait) => `<span class="late" style="--wait:${wait}ms">${html}</span>`;

const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const die = (n) => `<span class="die">${Array.from({ length: 9 }, (_, i) => `<i class="${PIPS[n]?.includes(i) ? "on" : ""}"></i>`).join("")}</span>`;

/** Top of every screen: which hand this is, the multiplier, and how the earlier hands went. */
const top = (outcomes = S.outcomes) => `
  <div class="dg-row"><span>Hand ${Math.min(outcomes.length, HANDS - 1) + 1} of ${HANDS}</span><span>Multiplier <b id="mult">${multiple(tenthsAfter(outcomes))}</b></span></div>
  <div class="dg-segs" id="segs" aria-hidden="true">${Array.from({ length: HANDS }, (_, i) => `<i class="${i < outcomes.length ? segClass(outcomes[i]) : i === outcomes.length ? "now" : ""}"></i>`).join("")}</div>`;

/* ---------------- Choosing a table, then a side ---------------- */

/** Between hands: choose any table for the next one, or stop with what you have. */
function renderPicker() {
  S.table = null;
  const left = HANDS - hand();
  view.innerHTML = `${top()}
    <section class="table dg-enter">
      <h2>${hand() ? "Where next?" : "Pick a table"}</h2>
      <p class="rule">${left} ${left === 1 ? "hand" : "hands"} left. Each one you win adds 0.2× to your ${S.base} points; each one you lose takes 0.2× away.</p>
      <div class="picker">${TABLES.map((t) => `<button class="opt" type="button" data-table="${t}"><span>${TABLE_NAMES[t]}</span><small>${BLURBS[t]}</small></button>`).join("")}</div>
      ${hand() ? `<button class="dg-btn plain" type="button" id="stopBtn">Stop at ${multiple(tenths())} and keep ${points()}</button>` : `<a class="dg-link" href="../../">Changed your mind? Lock your points in on the hub</a>`}
    </section>`;
  view.querySelectorAll("[data-table]").forEach((b) => b.addEventListener("click", () => { S.table = b.dataset.table; renderTable(); }));
  $("#stopBtn")?.addEventListener("click", finish);
}

/** The chosen table, before anything is dealt: pick a side (or, at blackjack, ask for cards). */
function renderTable() {
  const table = S.table;
  S.pick = null;
  S.moves = "";
  const felt = {
    roulette: `<div class="wheel"><span>?</span></div>`,
    blackjack: cards("Dealer", hidden() + hidden()) + cards("You", hidden() + hidden()),
    sicbo: `<div class="dice">${die(0)}${die(0)}${die(0)}</div>`,
    baccarat: cards("Player", hidden() + hidden()) + cards("Banker", hidden() + hidden()),
    craps: `<div class="dice">${die(0)}${die(0)}</div>`,
  }[table];
  const choices = table === "blackjack" ? `<button class="dg-btn" type="button" id="dealBtn">Deal</button>`
    : `<div class="opts" style="--cols:2">${Object.entries(PICKS[table]).map(([k, label]) => `<button class="opt" type="button" data-pick="${k}">${label}</button>`).join("")}</div>`;
  view.innerHTML = `${top()}
    <section class="table dg-enter">
      <h2>${TABLE_NAMES[table]}</h2>
      <p class="rule">${RULES[table]}</p>
      <div class="felt">${felt}</div>
      ${choices}
      <button class="dg-link" type="button" id="backBtn">Choose another table</button>
    </section>`;
  $("#backBtn").addEventListener("click", renderPicker);
  $("#dealBtn")?.addEventListener("click", () => {
    saveRun(true);
    blackjack(S.day, "", hand()).done ? settle({ table, moves: "" }) : renderBlackjack(true);
  });
  view.querySelectorAll("[data-pick]").forEach((b) => b.addEventListener("click", () => {
    S.pick = b.dataset.pick;
    if (table !== "craps") return settle({ table, pick: S.pick });
    saveRun(true);
    S.shown = 0;
    rollDice();
  }));
}

/* ---------------- Blackjack: your move ---------------- */

/** `fresh` is true for the opening deal (all four cards slide in), false after a hit (just the new one). */
function renderBlackjack(fresh) {
  const h = blackjack(S.day, S.moves, hand());
  const mine = h.player.map((c, i) => card(c, fresh ? i * 2 : i === h.player.length - 1 && S.moves ? 0 : null)).join("");
  const wait = fresh ? 4 * DEAL : S.moves ? DEAL : 0;
  view.innerHTML = `${top()}
    <section class="table">
      <h2>Blackjack</h2>
      <div class="felt">${cards("Dealer", card(h.dealer[0], fresh ? 1 : null) + hidden(fresh ? 3 : null))}${cards("You", mine, late(handTotal(h.player), wait))}</div>
      <div class="opts late" style="--cols:2;--wait:${wait}ms">
        <button class="opt" type="button" data-move="H">Hit</button><button class="opt" type="button" data-move="S">Stand</button>
      </div>
    </section>`;
  view.querySelectorAll("[data-move]").forEach((b) => b.addEventListener("click", () => {
    S.moves += b.dataset.move;
    saveRun(true);
    if (blackjack(S.day, S.moves, hand()).done) settle({ table: "blackjack", moves: S.moves });
    else renderBlackjack(false);
  }));
}

/* ---------------- Craps: roll by roll ---------------- */

/** Throw the next roll. The hand settles once the line is decided. */
function rollDice() {
  const run = S, rolls = craps(S.day, hand()).rolls;
  const k = S.shown++;
  const [a, b] = rolls[k], total = a + b, first = rolls[0][0] + rolls[0][1], over = S.shown === rolls.length;
  const history = rolls.slice(0, k).map(([x, y]) => x + y).join(" · ");
  const call = over ? `${total}.` : k === 0 ? `${total}. That's the point.` : `${total}. Roll again.`;
  view.innerHTML = `${top()}
    <section class="table">
      <h2>Craps</h2>
      <p class="rule">${k === 0 ? `You're on ${CRAPS_PICKS[S.pick].toLowerCase()}. The come-out roll.` : `The point is ${first}. ${S.pick === "pass" ? "You need it again before a 7." : "You need a 7 before it comes again."}`}</p>
      <div class="felt"><div class="dice tumble">${die(a)}${die(b)}</div><p class="rolls">${history}</p></div>
      <div class="outcome flat late" style="--wait:${TUMBLE}ms"><span>${call}</span></div>
      ${over ? "" : `<button class="dg-btn late" style="--wait:${TUMBLE}ms" type="button" id="rollBtn">Roll</button>`}
    </section>`;
  tumble(view.querySelector(".dice"), [a, b]);
  if (over) setTimeout(() => { if (S === run && S.table === "craps") settle({ table: "craps", pick: S.pick }); }, TUMBLE + (reduce ? 0 : 600));
  else $("#rollBtn").addEventListener("click", rollDice);
}

/** Flicker random faces on the dice, then land on the real ones. */
function tumble(el, faces) {
  if (!TUMBLE) return;
  const show = (dice) => { el.innerHTML = dice.map(die).join(""); };
  const flick = setInterval(() => show(faces.map(() => 1 + Math.floor(Math.random() * 6))), 70);
  setTimeout(() => { clearInterval(flick); if (el.isConnected) { show(faces); el.classList.remove("tumble"); } }, TUMBLE);
}

/* ---------------- Settling a hand ---------------- */

/** The choice is made: play the hand out, move the multiplier, show what happened. */
function settle(play) {
  const before = S.outcomes.slice();
  const r = playTable(S.day, hand(), play);
  const picked = r.pick ? PICKS[r.table][r.pick].toLowerCase() : "";

  // `wait` is how long the cards or dice take to come out before the result may show.
  let felt = "", detail = "", wait = 0;
  if (r.table === "roulette") {
    felt = `<div class="wheel" id="wheel"><span>?</span><b class="ball"></b></div>`;
    detail = `${r.number} ${rouletteColor(r.number)}. You had ${picked}.`;
  } else if (r.table === "blackjack") {
    const p = handTotal(r.player), d = handTotal(r.dealer);
    // A natural shows all four cards at once. Otherwise the player's last card (after a hit)
    // lands first, then the dealer turns his hole card and draws.
    const opening = !r.moves, drew = r.moves.endsWith("H") ? 1 : 0;
    const mine = r.player.map((c, i) => card(c, opening ? i * 2 : drew && i === r.player.length - 1 ? 0 : null)).join("");
    const his = r.dealer.map((c, i) => card(c, opening ? (i === 0 ? 1 : i + 2) : i === 0 ? null : drew + i - 1)).join("");
    wait = (opening ? r.dealer.length + 2 : drew + r.dealer.length - 1) * DEAL;
    felt = cards("Dealer", his, late(d, wait)) + cards("You", mine, p);
    detail = p > 21 ? `You went bust on ${p}.` : d > 21 ? `Dealer went bust on ${d}.` : p === 21 && r.player.length === 2 && r.outcome > 0 ? "Blackjack." : `Your ${p} against the dealer's ${d}.`;
  } else if (r.table === "sicbo") {
    const total = r.dice[0] + r.dice[1] + r.dice[2], triple = r.dice[0] === r.dice[1] && r.dice[1] === r.dice[2];
    wait = TUMBLE;
    felt = `<div class="dice tumble" id="sicDice">${r.dice.map(die).join("")}</div>`;
    detail = `${triple ? `Three ${r.dice[0]}s` : `${r.dice.join(", ")}: ${total}, ${total <= 10 ? "small" : "big"}`}. You had ${picked}.`;
  } else if (r.table === "baccarat") {
    // Dealt in turn: player, banker, player, banker, then any third cards.
    const order = (side, i) => (i < 2 ? i * 2 + side : 4 + (side && r.player.length === 3 ? 1 : 0));
    wait = (r.player.length + r.banker.length) * DEAL;
    felt = cards("Player", r.player.map((c, i) => card(c, order(0, i))).join(""), late(r.totals[0], wait)) + cards("Banker", r.banker.map((c, i) => card(c, order(1, i))).join(""), late(r.totals[1], wait));
    detail = `${r.winner === "tie" ? "A tie" : `${BACCARAT_PICKS[r.winner]} wins`}, ${r.totals[0]} to ${r.totals[1]}. You had ${picked}.`;
  } else {
    const [a, b] = r.rolls.at(-1), first = r.rolls[0][0] + r.rolls[0][1];
    felt = `<div class="dice">${die(a)}${die(b)}</div><p class="rolls">${r.rolls.map(([x, y]) => x + y).join(" · ")}</p>`;
    detail = `${r.rolls.length === 1 ? `${first} on the come-out roll` : r.pass ? `The point was ${r.point}, and it came back` : `The point was ${r.point}, but a 7 came first`}. You had ${picked}.`;
  }

  S.plays.push(play);
  S.outcomes.push(r.outcome);
  S.table = null;
  S.moves = "";
  saveRun();
  const last = S.plays.length === HANDS;

  // Draw with the old multiplier and the hand still open; they update when the result shows.
  view.innerHTML = `${top(before)}
    <section class="table">
      <h2>${TABLE_NAMES[r.table]}</h2>
      <div class="felt">${felt}</div>
      <div id="after" hidden>
        <div class="outcome ${tone(r.outcome)} dg-enter"><b>${stepText(r.outcome)}</b><span>${detail}</span><span>Now ${multiple(tenths())}: ${S.base} points would be ${points()}.</span></div>
        <button class="dg-btn" type="button" id="nextBtn">${last ? "See result" : "Play another hand"}</button>
        ${last ? "" : `<button class="dg-btn plain" type="button" id="stopBtn">Stop at ${multiple(tenths())} and keep ${points()}</button>`}
      </div>
    </section>`;

  const run = S;
  const reveal = () => {
    if (S !== run || !$("#after")) return; // the player has moved on
    $("#after").hidden = false;
    $("#mult").textContent = multiple(tenths());
    $("#segs").children[S.plays.length - 1].className = segClass(r.outcome);
    $("#nextBtn").addEventListener("click", () => (last ? finish() : renderPicker()));
    $("#stopBtn")?.addEventListener("click", finish);
    $("#nextBtn").focus({ preventScroll: true });
  };
  if (r.table === "sicbo") tumble($("#sicDice"), r.dice);
  if (r.table === "roulette") spinWheel($("#wheel"), r.number, reveal);
  else setTimeout(reveal, wait + (wait ? 250 : 0));
}

/** Turn the wheel: the ball runs round the rim while numbers flick past, then it lands. */
function spinWheel(el, number, done) {
  const num = el.querySelector("span");
  const land = () => { num.textContent = number; el.classList.remove("spin"); el.classList.add(rouletteColor(number)); done(); };
  if (!SPIN) return land();
  el.classList.add("spin");
  const flick = setInterval(() => { num.textContent = Math.floor(Math.random() * 37); }, 80);
  setTimeout(() => { clearInterval(flick); if (el.isConnected) land(); }, SPIN);
}

function finish() {
  const { mode, base, plays, outcomes } = S;
  const total = points();
  const result = { total, base, tenths: tenths(), outcomes, plays };
  result.label = multiple(result.tenths);
  if (mode === "daily") {
    store.saveDay(TODAY, result, total);
    saveHouse(TODAY, base, total, outcomes); // this is now the day's final score
    submitPlay(GAME_ID, TODAY, clientId(), { plays, start: base });
  }
  if (result.tenths >= 16) confetti(result.tenths >= 20 ? 200 : 110);
  showSummary(mode, result);
}

/* ---------------- Result ---------------- */

/** What the player chose on a hand, in a word or two. */
const playText = (play) => (play.table === "blackjack" ? (play.moves ? [...play.moves].map((m) => ({ H: "Hit", S: "Stand" })[m]).join(", ") : "Dealt") : PICKS[play.table][play.pick]);

function showSummary(mode, result) {
  S = null;
  const daily = mode === "daily";
  const { base, total, outcomes, plays } = result, t = result.tenths;
  const title = t >= 20 ? "Five from five. Doubled." : t >= 16 ? "The tables were kind." : t > 10 ? "Up on the day." : t === 10 ? "Back where you started." : t > 0 ? "The tables took a cut." : "Lost the lot.";
  $("#sub").textContent = daily ? "Today's hands" : "Practice tables";
  view.innerHTML = `
  <section class="dg-summary dg-enter">
    <div class="dg-verdict">
      <span class="big ${t < 10 ? "lost" : ""}">${multiple(t)}</span><span>${base} → ${total}</span>
      <h2>${title}</h2>
      <p>${daily ? `Your score for the day is ${total.toLocaleString("en-US")}.` : "Practice tables don't change your day's score."}</p>
    </div>
    <div class="dg-segs" aria-hidden="true">${Array.from({ length: HANDS }, (_, i) => `<i class="${i < outcomes.length ? segClass(outcomes[i]) : ""}"></i>`).join("")}</div>
    <div class="rows">${plays.map((p, i) => `<div class="row"><span>${TABLE_NAMES[p.table]}</span><span class="what">${playText(p)}</span><span class="n ${tone(outcomes[i])}">${stepText(outcomes[i])}</span></div>`).join("")}</div>
    <div class="dg-actions">
      <a class="dg-btn" href="../../">Back to the hub</a>
      <button class="dg-btn plain" id="copyBtn" type="button">Share</button>
      <button class="dg-btn plain" id="practiceBtn" type="button">${daily ? "Play practice tables" : "More practice tables"}</button>
    </div>
  </section>`;
  wireShare($("#copyBtn"), shareText(daily ? `Risk #${PUZZLE_NO}` : "Risk practice", outcomes));
  $("#practiceBtn").addEventListener("click", () => { startGame("practice", PRACTICE_POINTS); window.scrollTo({ top: 0 }); });
}

/** A door that isn't open: say why, and offer the hub and a practice run. */
function closed(title, text) {
  S = null;
  $("#sub").textContent = "The day's finale";
  view.innerHTML = `
  <section class="dg-summary dg-enter">
    <div class="dg-verdict"><span class="big lost">${title}</span><p>${text}</p></div>
    <div class="dg-actions">
      <a class="dg-btn" href="../../">Back to the hub</a>
      <button class="dg-btn plain" id="practiceBtn" type="button">Play practice tables</button>
    </div>
  </section>`;
  $("#practiceBtn").addEventListener("click", () => startGame("practice", PRACTICE_POINTS));
}

/** Today's finished result, if there is one in the current format. */
function savedDay() {
  const saved = store.getDay(TODAY);
  return Array.isArray(saved?.outcomes) && saved.plays?.every((p) => p.table) ? saved : null;
}

function startGame(mode, base) {
  S = { mode, day: mode === "daily" ? TODAY : `practice-${Math.random().toString(36).slice(2)}`, base, plays: [], outcomes: [], table: null, pick: null, moves: "", shown: 0 };
  $("#sub").textContent = mode === "daily" ? `Risking today's ${base} points` : `Practice, with ${base} points`;
  renderPicker();
}

/* ---------------- Help ---------------- */

function howTo() {
  modal({
    title: "How to play",
    body: `<ol>
      <li><b>You're risking today's points.</b> You start at 1.0×. Every hand you win adds 0.2×; every hand you lose takes 0.2× away. A push changes nothing.</li>
      <li><b>Up to ${HANDS} hands, at any tables.</b> Roulette, blackjack, sic bo, baccarat or craps. Play all five at one table, or never touch the ones you don't fancy.</li>
      <li><b>Every hand is win or lose.</b> No chips and no long shots: red or black, small or big, player or banker.</li>
      <li><b>Stop whenever you like.</b> Win all five and your day is doubled. Lose all five and it's gone.</li>
    </ol>`,
  });
}
$("#howBtn").addEventListener("click", howTo);

/* ---------------- Boot ---------------- */

/** Bring back a daily run that was interrupted, at the hand (and the cards) it had reached. */
function resume(run) {
  for (const play of run.plays) {
    const r = playTable(S.day, hand(), play);
    if (!r || S.plays.length === HANDS) break;
    S.plays.push(play); S.outcomes.push(r.outcome);
  }
  if (S.plays.length === HANDS) return finish();
  const locked = run.plays.length === S.plays.length ? run.locked : null;
  // Cards or dice were already out when the page closed: carry on from there.
  if (locked?.table === "craps" && Object.hasOwn(CRAPS_PICKS, locked.pick)) { S.table = "craps"; return settle({ table: "craps", pick: locked.pick }); }
  if (locked?.table === "blackjack") {
    S.table = "blackjack";
    S.moves = typeof locked.moves === "string" && blackjack(S.day, locked.moves, hand()) ? locked.moves : "";
    return blackjack(S.day, S.moves, hand()).done ? settle({ table: "blackjack", moves: S.moves }) : renderBlackjack(false);
  }
  renderPicker();
}

// Risk is the finale of the Series: the door opens once all ten games are played, and closes
// for good once the day's score is locked in or the tables have been played.
const series = seriesState(TODAY);
if (savedDay()) showSummary("daily", savedDay());
else if (series.final) closed(series.final.total.toLocaleString("en-US"), "You locked in today's score, so the tables are closed until tomorrow.");
else if (!series.complete) closed(`${series.played} of 10`, "Risk opens when you've played all ten of today's games.");
else if (series.total === 0) { lockIn(TODAY); closed("0", "No points today, so there's nothing to risk."); }
else {
  startGame("daily", series.total);
  const run = store.flag("run");
  if (run?.day === TODAY && Array.isArray(run.plays)) resume(run);
  if (!store.flag("seenHelp")) {
    store.setFlag("seenHelp");
    howTo();
  }
}
