// Risk UI: up to five win-or-lose hands at the tables. Rules live in core/tables.js.
import {
  GAME_ID, HANDS, TABLES, TABLE_NAMES, RANKS, SUITS, ROULETTE_PICKS, SICBO_PICKS, BACCARAT_PICKS, CRAPS_PICKS,
  rouletteColor, handTotal, blackjack, playTable, tenthsAfter, scoreAt, multiple, stepText, shareText,
} from "./core/tables.js";
import { puzzleNumber } from "../../shared/daily.js";
import { gameStore, clientId } from "../../shared/storage.js";
import { activeDay } from "../../shared/account.js";
import { risk } from "../../shared/api.js";
import { confetti } from "../../shared/confetti.js";
import { modal, wireShare } from "../../shared/ui.js";
import { seriesState, saveHouse, lockIn, reportDay } from "../../shared/series.js";
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

// The run in progress: { mode, deal, base, hands, open, table, pick, shown, busy }.
// `deal` is the dealer (the server for the daily tables, the browser for practice), `base` the
// points being played for, `hands` every settled hand (with its `outcome`), `open` a blackjack
// hand still being played, `table` the one chosen for the next hand.
let S = null;

const outcomesOf = (run = S) => run.hands.map((h) => h.outcome);
const tenths = () => tenthsAfter(outcomesOf());
const points = (t = tenths()) => scoreAt(S.base, t);
const hand = () => S.hands.length; // the number of the hand about to be played, from 0

/**
 * The daily tables are dealt by the server (api/src/risk.js) from a seed only it can make, one
 * hand at a time, and only once the player has committed to it: nobody can look a hand up, and
 * reloading can't deal one again. Resolves to { status, body } like the API.
 */
const serverDealer = (day) => (action, extra) => risk(action, day, clientId(), extra);

/** Practice tables: the same rules, dealt in the browser from a random seed. */
function practiceDealer(base) {
  const seed = `practice-${Math.random().toString(36).slice(2)}`;
  const run = { base, hands: [], open: null, done: false };
  const view = () => { const t = tenthsAfter(run.hands.map((h) => h.outcome)); return { ...run, tenths: t, points: scoreAt(base, t) }; };
  return async (action, extra = {}) => {
    if (action === "stop") run.done = true;
    if (action === "play") {
      const n = run.hands.length;
      if (extra.table === "blackjack") {
        const moves = (run.open?.moves ?? "") + (extra.move ?? ""), h = blackjack(seed, moves, n);
        if (h.done) { run.hands.push({ table: "blackjack", moves, outcome: h.outcome, player: h.player, dealer: h.dealer }); run.open = null; }
        else run.open = { table: "blackjack", moves, player: h.player, dealer: h.dealer, total: handTotal(h.player) };
      } else run.hands.push(playTable(seed, n, extra));
      if (run.hands.length === HANDS) run.done = true;
    }
    return { status: 200, body: structuredClone(view()) };
  };
}

/**
 * Ask the dealer for something, with the buttons held while it answers. Resolves to the run, or
 * to null after showing what went wrong.
 */
async function ask(action, extra) {
  if (S.busy) return null;
  S.busy = true;
  view.querySelectorAll("button").forEach((b) => (b.disabled = true));
  const run = S, { status, body } = await S.deal(action, extra);
  if (S !== run) return null;
  S.busy = false;
  if (status >= 200 && status < 300) {
    S.base = body.base; S.hands = body.hands; S.open = body.open;
    return body;
  }
  trouble(status ? body?.error ?? "Something went wrong at the tables." : "Risk is dealt by the server, and it couldn't be reached. Check your connection and try again.");
  return null;
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
const top = (outcomes = outcomesOf()) => `
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
      ${hand() ? `<button class="dg-btn plain" type="button" id="stopBtn">Stop at ${multiple(tenths())} and keep ${points()}</button>` : `<a class="dg-link" href="../../">Changed your mind? Bank your points on the hub instead</a>`}
    </section>`;
  view.querySelectorAll("[data-table]").forEach((b) => b.addEventListener("click", () => { S.table = b.dataset.table; renderTable(); }));
  $("#stopBtn")?.addEventListener("click", stop);
}

/** The chosen table, before anything is dealt: pick a side (or, at blackjack, ask for cards). */
function renderTable() {
  const table = S.table;
  S.pick = null;
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
  $("#dealBtn")?.addEventListener("click", async () => {
    if (!(await ask("play", { table: "blackjack" }))) return;
    S.open ? renderBlackjack(true) : settle(S.hands.at(-1));
  });
  view.querySelectorAll("[data-pick]").forEach((b) => b.addEventListener("click", async () => {
    S.pick = b.dataset.pick;
    if (!(await ask("play", { table, pick: S.pick }))) return;
    if (table !== "craps") return settle(S.hands.at(-1));
    S.shown = 0;
    rollDice();
  }));
}

/* ---------------- Blackjack: your move ---------------- */

/** `fresh` is true for the opening deal (all four cards slide in), false after a hit (just the new one). */
function renderBlackjack(fresh) {
  const h = S.open;
  const mine = h.player.map((c, i) => card(c, fresh ? i * 2 : i === h.player.length - 1 && h.moves ? 0 : null)).join("");
  const wait = fresh ? 4 * DEAL : h.moves ? DEAL : 0;
  view.innerHTML = `${top()}
    <section class="table">
      <h2>Blackjack</h2>
      <div class="felt">${cards("Dealer", card(h.dealer[0], fresh ? 1 : null) + hidden(fresh ? 3 : null))}${cards("You", mine, late(handTotal(h.player), wait))}</div>
      <div class="opts late" style="--cols:2;--wait:${wait}ms">
        <button class="opt" type="button" data-move="H">Hit</button><button class="opt" type="button" data-move="S">Stand</button>
      </div>
    </section>`;
  view.querySelectorAll("[data-move]").forEach((b) => b.addEventListener("click", async () => {
    if (!(await ask("play", { table: "blackjack", move: b.dataset.move }))) return;
    S.open ? renderBlackjack(false) : settle(S.hands.at(-1));
  }));
}

/* ---------------- Craps: roll by roll ---------------- */

/** Throw the next roll of the hand just dealt. The result shows once the line is decided. */
function rollDice() {
  const run = S, r = S.hands.at(-1), rolls = r.rolls;
  const k = S.shown++;
  const [a, b] = rolls[k], total = a + b, first = rolls[0][0] + rolls[0][1], over = S.shown === rolls.length;
  const history = rolls.slice(0, k).map(([x, y]) => x + y).join(" · ");
  // Outcomes before this hand: the multiplier at the top doesn't move until the line is decided.
  const call = over ? `${total}.` : k === 0 ? `${total}. That's the point.` : `${total}. Roll again.`;
  view.innerHTML = `${top(outcomesOf().slice(0, -1))}
    <section class="table">
      <h2>Craps</h2>
      <p class="rule">${k === 0 ? `You're on ${CRAPS_PICKS[S.pick].toLowerCase()}. The come-out roll.` : `The point is ${first}. ${S.pick === "pass" ? "You need it again before a 7." : "You need a 7 before it comes again."}`}</p>
      <div class="felt"><div class="dice tumble">${die(a)}${die(b)}</div><p class="rolls">${history}</p></div>
      <div class="outcome flat late" style="--wait:${TUMBLE}ms"><span>${call}</span></div>
      ${over ? "" : `<button class="dg-btn late" style="--wait:${TUMBLE}ms" type="button" id="rollBtn">Roll</button>`}
    </section>`;
  tumble(view.querySelector(".dice"), [a, b]);
  if (over) setTimeout(() => { if (S === run && S.table === "craps") settle(r); }, TUMBLE + (reduce ? 0 : 600));
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

/** The hand `r` has been dealt (it is the last of S.hands): play it out on the felt, then move the multiplier. */
function settle(r) {
  const before = outcomesOf().slice(0, -1);
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

  S.table = null;
  const last = S.hands.length === HANDS;

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
    $("#segs").children[S.hands.length - 1].className = segClass(r.outcome);
    $("#nextBtn").addEventListener("click", () => (last ? finish() : renderPicker()));
    $("#stopBtn")?.addEventListener("click", stop);
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

/** Stop with the multiplier reached. The dealer closes the run, then the result is shown. */
async function stop() {
  if (await ask("stop")) finish();
}

/** The run is over (five hands, or stopped): bank the points it made and show how it went. */
function finish() {
  const { mode, base, hands } = S;
  const outcomes = outcomesOf(), total = points();
  const plays = hands.map(({ table, pick, moves }) => ({ table, pick, moves }));
  const result = { total, base, tenths: tenths(), outcomes, plays };
  result.label = multiple(result.tenths);
  if (mode === "daily") {
    store.saveDay(TODAY, result, total);
    saveHouse(TODAY, base, total, outcomes); // these are now the day's points; the day's score doesn't change
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
      <span class="big ${t < 10 ? "lost" : ""}">${multiple(t)}</span><span>${base} → ${total} points</span>
      <h2>${title}</h2>
      <p>${daily ? `${total.toLocaleString("en-US")} points banked. Your score for the day stays ${base}: Risk only plays for points.` : "Practice tables don't change your points."}</p>
    </div>
    <div class="dg-segs" aria-hidden="true">${Array.from({ length: HANDS }, (_, i) => `<i class="${i < outcomes.length ? segClass(outcomes[i]) : ""}"></i>`).join("")}</div>
    <div class="rows">${plays.map((p, i) => `<div class="row"><span>${TABLE_NAMES[p.table]}</span><span class="what">${playText(p)}</span><span class="n ${tone(outcomes[i])}">${stepText(outcomes[i])}</span></div>`).join("")}</div>
    <div class="dg-actions">
      <a class="dg-btn" href="../../">Back to the hub</a>
      <button class="dg-btn plain" id="copyBtn" type="button">Share</button>
      <button class="dg-link" id="practiceBtn" type="button">${daily ? "Play practice tables" : "More practice tables"}</button>
    </div>
  </section>`;
  wireShare($("#copyBtn"), shareText(daily ? `Risk #${PUZZLE_NO}` : "Risk practice", outcomes));
  $("#practiceBtn").addEventListener("click", () => { startGame("practice", PRACTICE_POINTS); window.scrollTo({ top: 0 }); });
}

/** A door that isn't open: say why, and offer the hub and a practice run. `retry` adds a Try again button. */
function closed(title, text, retry = false) {
  S = null;
  $("#sub").textContent = "The day's finale";
  view.innerHTML = `
  <section class="dg-summary dg-enter">
    <div class="dg-verdict"><span class="big lost">${title}</span><p>${text}</p></div>
    <div class="dg-actions">
      ${retry ? `<button class="dg-btn" id="retryBtn" type="button">Try again</button>` : ""}
      <a class="dg-btn ${retry ? "plain" : ""}" href="../../">Back to the hub</a>
      <button class="dg-link" id="practiceBtn" type="button">Play practice tables</button>
    </div>
  </section>`;
  $("#retryBtn")?.addEventListener("click", boot);
  $("#practiceBtn").addEventListener("click", () => startGame("practice", PRACTICE_POINTS));
}

/** Something went wrong mid-run (usually the connection). The run is safe on the server: try again picks it up. */
function trouble(text) {
  if (S?.mode === "daily") closed("Hold on", text, true);
  else closed("Hold on", text);
}

/** Today's finished result, if there is one in the current format. */
function savedDay() {
  const saved = store.getDay(TODAY);
  return Array.isArray(saved?.outcomes) && saved.plays?.every((p) => p.table) ? saved : null;
}

function startGame(mode, base) {
  S = { mode, deal: mode === "daily" ? serverDealer(TODAY) : practiceDealer(base), base, hands: [], open: null, table: null, pick: null, shown: 0, busy: false };
  $("#sub").textContent = mode === "daily" ? `Playing for today's ${base} points` : `Practice, with ${base} points`;
  renderPicker();
}

/* ---------------- Help ---------------- */

function howTo() {
  modal({
    title: "How to play",
    body: `<ol>
      <li><b>You're risking today's points, not your score.</b> Your score for the day is already set. Here you play for the points it banks: you start at 1.0×, every hand you win adds 0.2×, every hand you lose takes 0.2× away, and a push changes nothing.</li>
      <li><b>Up to ${HANDS} hands, at any tables.</b> Roulette, blackjack, sic bo, baccarat or craps. Play all five at one table, or never touch the ones you don't fancy.</li>
      <li><b>Every hand is win or lose.</b> No chips and no long shots: red or black, small or big, player or banker.</li>
      <li><b>Stop whenever you like.</b> Win all five and your points are doubled. Lose all five and they're gone.</li>
      <li><b>Every player gets their own hands.</b> The server deals each one only once you've chosen, so there's nothing to look up.</li>
    </ol>`,
  });
}
$("#howBtn").addEventListener("click", howTo);

/* ---------------- Boot ---------------- */

/**
 * Risk is the finale of the Series: the door opens once the day's games are played, and closes
 * for good once the day's points are banked or the tables have been played. The server deals
 * the hands, so it needs the day's score first (reportDay), then picks up wherever the run is.
 */
async function boot() {
  const series = seriesState(TODAY);
  if (savedDay()) return showSummary("daily", savedDay());
  if (series.final) return closed(series.final.total.toLocaleString("en-US"), "You banked today's points, so the tables are closed until tomorrow.");
  if (series.late) return closed("Not today", "Risk is only dealt on the day itself. Bank this day's points on the hub.");
  if (!series.complete) return closed(`${series.played} of ${series.open.length}`, "Risk opens when you've played all of today's series.");
  if (series.total === 0) { lockIn(TODAY); return closed("0", "No points today, so there's nothing to risk."); }

  S = null;
  $("#sub").textContent = "Finding your table";
  view.innerHTML = `<section class="table dg-enter"><p class="rule">Shuffling…</p></section>`;
  if (!(await reportDay(TODAY))) return closed("Hold on", "Risk plays for the score the server has for today's series, and it couldn't be sent. Check your connection and try again, or bank your points on the hub.", true);
  startGame("daily", series.total);
  const run = await ask("state");
  if (!run) return;
  if (run.done && !run.hands.length) return closed("0", "The server has no points for today's series, so there's nothing to risk. Bank your day on the hub.");
  if (run.done) return finish();
  $("#sub").textContent = `Playing for today's ${run.base} points`;
  if (run.open) { S.table = "blackjack"; renderBlackjack(false); } // cards were already out when the page closed
  else renderPicker();
  if (!store.flag("seenHelp")) {
    store.setFlag("seenHelp");
    howTo();
  }
}
boot();
