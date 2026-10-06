// Stakes UI: five tables, one bankroll. Rules live in core/tables.js.
import {
  GAME_ID, START, TABLES, TABLE_NAMES, RANKS, SUITS, ROULETTE_BETS, BACCARAT_BETS, CRAPS_BETS,
  rouletteColor, handTotal, blackjack, pokerDeal, playTable, multiple, resultLabel, shareText,
} from "./core/tables.js";
import { dayKey, puzzleNumber } from "../../shared/daily.js";
import { gameStore, clientId } from "../../shared/storage.js";
import { submitPlay } from "../../shared/api.js";
import { confetti } from "../../shared/confetti.js";
import { modal, wireCopy, startCountdown, showRank } from "../../shared/ui.js";
import { GAMES } from "../../shared/registry.js";

const META = GAMES.find((g) => g.id === GAME_ID);
const TODAY = dayKey();
const PUZZLE_NO = puzzleNumber(META.launchDay, TODAY);
const store = gameStore(GAME_ID);

const $ = (s) => document.querySelector(s);
const view = $("#view");
$("#stamp").textContent = `No. ${PUZZLE_NO}`;

const RULES = {
  roulette: "One spin. Colors and halves pay 1 to 1, dozens 2 to 1, a single number 35 to 1.",
  blackjack: "Closest to 21 wins. A natural pays 3 to 2. The dealer stands on 17.",
  baccarat: "Closest to 9 wins. Player pays 1 to 1, Banker 19 to 20, a Tie 8 to 1.",
  poker: "Three cards each. Play on to match your bet, or fold. The dealer needs queen high.",
  craps: "7 or 11 first wins the pass line; 2, 3 or 12 loses. Otherwise, hit that number again before a 7.",
};

// The day in progress: { mode, day, index, bankroll, plays, deltas, bet, moves }.
// `day` is the date key, or a random word for a practice run, and seeds every table.
let S = null;

/**
 * Remember the daily run after every step. The day's spin and cards are fixed, so without
 * this a reload would let a player look at a table and then bet on it again.
 */
function saveRun(dealt = false) {
  if (S.mode === "daily") store.setFlag("run", { day: TODAY, plays: S.plays, bet: S.bet, moves: S.moves, dealt });
}

/* ---------------- Pieces ---------------- */

const card = (c) => `<span class="card ${c.s === 1 || c.s === 2 ? "warm" : ""}">${RANKS[c.r] ?? c.r}<i>${SUITS[c.s]}</i></span>`;
const hidden = `<span class="card back">?</span>`;
const hand = (who, cards, sum = "") => `<div class="hand"><span class="who">${who}</span><span class="cards">${cards}</span><span class="sum">${sum}</span></div>`;
const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "Push");
const tone = (n) => (n > 0 ? "up" : n < 0 ? "down" : "flat");

/** The four stakes on offer: a tenth, a quarter, half, or everything. */
function stakes() {
  const b = S.bankroll;
  return [...new Set([Math.ceil(b / 10), Math.ceil(b / 4), Math.ceil(b / 2), b])];
}

function stakeHtml() {
  const options = stakes();
  if (!options.includes(S.bet)) S.bet = options[Math.min(1, options.length - 1)];
  return `<p class="lab">Your bet</p><div class="stake" role="group" aria-label="Your bet">${options.map((n) =>
    `<button class="opt" type="button" data-bet="${n}" aria-pressed="${n === S.bet}">${n}<small>${n === S.bankroll ? "All in" : `${Math.round((100 * n) / S.bankroll)}%`}</small></button>`).join("")}</div>`;
}

const opt = (key, label, note = "", cls = "") => `<button class="opt ${cls}" type="button" data-pick="${key}">${label}${note ? `<small>${note}</small>` : ""}</button>`;

/* ---------------- A table ---------------- */

function startGame(mode) {
  S = { mode, day: mode === "daily" ? TODAY : `practice-${Math.random().toString(36).slice(2)}`, index: 0, bankroll: START, plays: [], deltas: [], bet: 0, moves: "" };
  $("#sub").textContent = mode === "daily" ? "Five tables. One bankroll" : "Practice tables";
  renderTable();
}

function renderSegs() {
  $("#segs").innerHTML = TABLES.map((_, i) => `<i class="${i < S.deltas.length ? (S.deltas[i] > 0 ? "on" : S.deltas[i] < 0 ? "bad" : "mid") : i === S.index ? "now" : ""}"></i>`).join("");
}

/** Draw the current table before any choice is made. `dealt` is true once blackjack or poker cards are out. */
function renderTable(dealt = false) {
  const table = TABLES[S.index];
  let felt = "", controls = "";

  if (table === "roulette") {
    felt = `<div class="wheel">?</div>`;
    controls = `${stakeHtml()}<p class="lab">Bet on</p>
      <div class="opts" style="--cols:3">${Object.entries(ROULETTE_BETS).map(([k, [label, pays]]) => opt(k, label, `${pays} to 1`)).join("")}</div>
      <p class="lab">Or one number, 35 to 1</p>
      <div class="numbers">${Array.from({ length: 37 }, (_, n) => opt(`n${n}`, n, "", rouletteColor(n))).join("")}</div>`;
  } else if (table === "baccarat") {
    felt = hand("Player", hidden + hidden) + hand("Banker", hidden + hidden);
    controls = `${stakeHtml()}<p class="lab">Bet on</p><div class="opts" style="--cols:3">${Object.entries(BACCARAT_BETS).map(([k, [label, pays]]) => opt(k, label, pays)).join("")}</div>`;
  } else if (table === "craps") {
    felt = `<div class="dice"><span class="roll"><span class="die">?</span><span class="die">?</span></span></div>`;
    controls = `${stakeHtml()}<p class="lab">Bet on</p><div class="opts">${Object.entries(CRAPS_BETS).map(([k, [label, pays]]) => opt(k, label, pays)).join("")}</div>`;
  } else if (table === "blackjack") {
    if (!dealt) {
      felt = hand("Dealer", hidden + hidden) + hand("You", hidden + hidden);
      controls = `${stakeHtml()}<button class="dg-btn" type="button" data-deal>Deal</button>`;
    } else {
      const h = blackjack(S.day, S.moves);
      felt = hand("Dealer", card(h.dealer[0]) + hidden) + hand("You", h.player.map(card).join(""), handTotal(h.player));
      const canDouble = !S.moves && S.bankroll >= S.bet * 2;
      controls = `<div class="opts" style="--cols:3">${opt("H", "Hit")}${opt("S", "Stand")}<button class="opt" type="button" data-pick="D" ${canDouble ? "" : "disabled"}>Double<small>bet ${S.bet * 2}</small></button></div>`;
    }
  } else if (table === "poker") {
    if (!dealt) {
      felt = hand("Dealer", hidden + hidden + hidden) + hand("You", hidden + hidden + hidden);
      controls = `${stakeHtml()}<button class="dg-btn" type="button" data-deal>Deal</button>`;
    } else {
      const extra = Math.min(S.bet, S.bankroll - S.bet);
      felt = hand("Dealer", hidden + hidden + hidden) + hand("You", pokerDeal(S.day).player.map(card).join(""));
      controls = `<div class="opts">${opt("play", "Play", extra ? `bet ${extra} more` : "nothing more to bet")}${opt("fold", "Fold", `lose ${S.bet}`)}</div>`;
    }
  }

  view.innerHTML = `
    <div class="dg-row"><span>Table ${S.index + 1} of ${TABLES.length}</span><span>Bankroll <b>${S.bankroll}</b></span></div>
    <div class="dg-segs" id="segs" aria-hidden="true"></div>
    <section class="table ${dealt ? "" : "dg-enter"}">
      <h2>${TABLE_NAMES[table]}</h2>
      <p class="rule">${RULES[table]}</p>
      <div class="felt">${felt}</div>
      ${controls}
    </section>`;
  renderSegs();

  view.querySelectorAll("[data-bet]").forEach((b) => b.addEventListener("click", () => {
    S.bet = Number(b.dataset.bet);
    view.querySelectorAll("[data-bet]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  }));
  view.querySelector("[data-deal]")?.addEventListener("click", () => {
    S.moves = "";
    saveRun(true);
    // A natural on either side ends blackjack before any choice.
    if (table === "blackjack" && blackjack(S.day).done) settle({ bet: S.bet, moves: "" });
    else renderTable(true);
  });
  view.querySelectorAll("[data-pick]").forEach((b) => b.addEventListener("click", () => choose(b.dataset.pick)));
}

function choose(pick) {
  const table = TABLES[S.index];
  if (table === "blackjack") {
    S.moves += pick;
    saveRun(true);
    if (blackjack(S.day, S.moves).done) settle({ bet: S.bet, moves: S.moves });
    else renderTable(true);
  } else if (table === "poker") settle({ bet: S.bet, play: pick === "play" });
  else settle({ bet: S.bet, pick });
}

/** The choice is made: play the table out, move the money, show what happened. */
function settle(play) {
  const r = playTable(S.day, S.index, S.bankroll, play);
  S.plays.push(play);
  S.deltas.push(r.delta);
  S.bankroll += r.delta;
  const last = S.index === TABLES.length - 1 || S.bankroll === 0;

  let felt = "", detail = "";
  if (r.table === "roulette") {
    felt = `<div class="wheel ${rouletteColor(r.number)}">${r.number}</div>`;
    detail = `${r.number} ${rouletteColor(r.number)}. You bet ${r.bet} on ${r.pick in ROULETTE_BETS ? ROULETTE_BETS[r.pick][0].toLowerCase() : r.pick.slice(1)}.`;
  } else if (r.table === "blackjack") {
    const p = handTotal(r.player), d = handTotal(r.dealer);
    felt = hand("Dealer", r.dealer.map(card).join(""), d) + hand("You", r.player.map(card).join(""), p);
    detail = p > 21 ? `You went bust on ${p}.` : d > 21 ? `Dealer went bust on ${d}.` : p === 21 && r.player.length === 2 && r.delta > 0 ? "Blackjack." : `Your ${p} against the dealer's ${d}.`;
  } else if (r.table === "baccarat") {
    felt = hand("Player", r.player.map(card).join(""), r.totals[0]) + hand("Banker", r.banker.map(card).join(""), r.totals[1]);
    detail = `${r.winner === "tie" ? "A tie" : `${BACCARAT_BETS[r.winner][0]} wins`}, ${r.totals[0]} to ${r.totals[1]}. You bet ${r.bet} on ${BACCARAT_BETS[r.pick][0].toLowerCase()}.`;
  } else if (r.table === "poker") {
    felt = hand("Dealer", r.dealer.map(card).join(""), r.hands[1]) + hand("You", r.player.map(card).join(""), r.hands[0]);
    detail = { fold: "You folded.", unqualified: "The dealer didn't have queen high, so only your first bet pays.", win: "Your hand wins both bets.", lose: "The dealer's hand takes both bets.", tie: "Same hand. Bets returned." }[r.outcome];
  } else {
    felt = `<div class="dice">${r.rolls.map(([a, b], i) => `<span class="roll ${i === r.rolls.length - 1 ? "last" : ""}" style="animation-delay:${i * 0.12}s"><span class="die">${a}</span><span class="die">${b}</span>${a + b}</span>`).join("")}</div>`;
    const first = r.rolls[0][0] + r.rolls[0][1];
    detail = r.point === null ? `${first} on the first roll.` : r.pass ? `The point was ${r.point}, and it came back.` : `The point was ${r.point}, but a 7 came first.`;
  }

  view.innerHTML = `
    <div class="dg-row"><span>Table ${S.index + 1} of ${TABLES.length}</span><span>Bankroll <b>${S.bankroll}</b></span></div>
    <div class="dg-segs" id="segs" aria-hidden="true"></div>
    <section class="table">
      <h2>${TABLE_NAMES[r.table]}</h2>
      <div class="felt">${felt}</div>
      <div class="outcome ${tone(r.delta)} dg-enter"><b>${signed(r.delta)}</b><span>${detail}</span></div>
      <button class="dg-btn" type="button" id="nextBtn">${S.bankroll === 0 ? "Bust. See result" : last ? "See result" : `Next: ${TABLE_NAMES[TABLES[S.index + 1]]}`}</button>
    </section>`;
  S.index++;
  S.moves = "";
  saveRun();
  renderSegs();
  $("#nextBtn").addEventListener("click", () => (last ? finish() : renderTable()));
  $("#nextBtn").focus({ preventScroll: true });
}

function finish() {
  const { mode, bankroll, plays, deltas } = S;
  const result = { total: bankroll, bankroll, deltas, plays, bust: bankroll === 0 };
  result.label = resultLabel(result);
  let sent = null;
  if (mode === "daily") {
    store.saveDay(TODAY, result, bankroll);
    sent = submitPlay(GAME_ID, TODAY, clientId(), { plays });
  }
  if (bankroll >= START * 2) confetti(bankroll >= START * 5 ? 200 : 110);
  showSummary(mode, result, sent);
}

/* ---------------- Result ---------------- */

/** What the player did at a table, in a few words, for the summary. */
function playText(table, play) {
  if (table === "roulette") return play.pick in ROULETTE_BETS ? ROULETTE_BETS[play.pick][0] : `Number ${play.pick.slice(1)}`;
  if (table === "blackjack") return play.moves ? [...play.moves].map((m) => ({ H: "Hit", S: "Stand", D: "Double" })[m]).join(", ") : "Dealt";
  if (table === "baccarat") return BACCARAT_BETS[play.pick][0];
  if (table === "poker") return play.play ? "Played" : "Folded";
  return CRAPS_BETS[play.pick][0];
}

function showSummary(mode, result, sent = null) {
  S = null;
  const daily = mode === "daily";
  const { bankroll, deltas, plays, bust } = result;
  const title = bust ? `Bust at table ${deltas.length}.` : bankroll >= START * 5 ? "The house is worried." : bankroll >= START * 2 ? "Doubled up." : bankroll > START ? "Up on the day." : bankroll === START ? "Dead even." : "The house wins.";
  const share = shareText(daily ? `Stakes #${PUZZLE_NO}` : "Stakes practice", result);
  const st = store.stats();
  $("#sub").textContent = daily ? "Today's tables" : "Practice tables";

  view.innerHTML = `
  <section class="dg-summary dg-enter">
    <div class="dg-verdict">
      <span class="big ${bust ? "lost" : ""}">${bust ? "Bust" : multiple(bankroll)}</span><span>${START} → ${bankroll}</span>
      <h2>${title}</h2>
      ${daily ? "" : "<p>Practice tables don't count toward your streak.</p>"}
    </div>
    <div class="dg-segs" aria-hidden="true">${TABLES.map((_, i) => `<i class="${i < deltas.length ? (deltas[i] > 0 ? "on" : deltas[i] < 0 ? "bad" : "mid") : ""}"></i>`).join("")}</div>
    <p class="dg-rank" id="rank" hidden></p>
    <div class="rows">${deltas.map((d, i) => `<div class="row"><span>${TABLE_NAMES[TABLES[i]]}</span>
      <span class="what">${plays[i].bet} · ${playText(TABLES[i], plays[i])}</span><span class="n ${tone(d)}">${signed(d)}</span></div>`).join("")}</div>
    ${daily ? `<div class="dg-stats">
      <div class="dg-stat"><b>${st.streak}</b><span>Day streak</span></div>
      <div class="dg-stat"><b>${st.played}</b><span>Played</span></div>
      <div class="dg-stat"><b>${multiple(st.best || bankroll)}</b><span>Best day</span></div>
      <div class="dg-stat"><b id="cd">--:--:--</b><span>Next puzzle</span></div></div>` : ""}
    <div class="dg-actions">
      <button class="dg-btn" id="copyBtn" type="button">Copy result</button>
      <button class="dg-btn plain" id="practiceBtn" type="button">${daily ? "Play practice tables" : "More practice tables"}</button>
      ${!daily ? (store.getDay(TODAY) ? `<button class="dg-btn plain" id="backBtn" type="button">Back to today's result</button>` : `<button class="dg-btn plain" id="dailyBtn" type="button">Play today's tables</button>`) : ""}
    </div>
  </section>`;

  wireCopy($("#copyBtn"), share);
  $("#practiceBtn").addEventListener("click", () => { startGame("practice"); window.scrollTo({ top: 0 }); });
  $("#backBtn")?.addEventListener("click", showSaved);
  $("#dailyBtn")?.addEventListener("click", () => startGame("daily"));
  startCountdown($("#cd"));
  if (daily) showRank($("#rank"), sent, GAME_ID, TODAY, bankroll);
}

const showSaved = () => showSummary("daily", store.getDay(TODAY));

/* ---------------- Help ---------------- */

function howTo() {
  modal({
    title: "How to play",
    body: `<ol>
      <li><b>Start with ${START}.</b> Play one hand at each of five tables: roulette, blackjack, baccarat, three card poker and craps.</li>
      <li><b>Your bankroll carries on.</b> At every table you choose how much of it to bet, from a tenth to all of it, then how to play.</li>
      <li><b>Finish with as much as you can.</b> Your result is how many times over you multiplied your ${START}. Hit zero and you're out.</li>
      <li><b>Everyone gets the same tables.</b> The spin, the cards and the dice are the same for every player today. Only the choices differ.</li>
    </ol>`,
  });
}
$("#howBtn").addEventListener("click", howTo);

/* ---------------- Boot ---------------- */
if (store.getDay(TODAY)?.plays) showSaved();
else {
  startGame("daily");
  // Pick up a run that was interrupted, at the table and the cards it had reached.
  const run = store.flag("run");
  if (run?.day === TODAY) {
    for (const play of run.plays) {
      const r = playTable(S.day, S.index, S.bankroll, play);
      if (!r) break;
      S.plays.push(play); S.deltas.push(r.delta); S.bankroll += r.delta; S.index++;
    }
    if (S.bankroll === 0 || S.index === TABLES.length) finish();
    else {
      const dealt = !!run.dealt && run.plays.length === S.plays.length && run.bet >= 1 && run.bet <= S.bankroll;
      if (dealt) { S.bet = run.bet; S.moves = TABLES[S.index] === "blackjack" ? run.moves : ""; }
      if (dealt && TABLES[S.index] === "blackjack" && blackjack(S.day, S.moves)?.done) settle({ bet: S.bet, moves: S.moves });
      else renderTable(dealt);
    }
  }
  if (!store.flag("seenHelp")) {
    store.setFlag("seenHelp");
    howTo();
  }
}
