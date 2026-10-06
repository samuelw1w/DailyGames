// Jot UI. Rules live in core/puzzle.js.
import { GAME_ID, GUESSES, LENGTH, dailyWord, practiceWord, validGuess, shared, score, shareText } from "./core/puzzle.js";
import { puzzleNumber } from "../../shared/daily.js";
import { gameStore, clientId } from "../../shared/storage.js";
import { activeDay } from "../../shared/account.js";
import { submitPlay } from "../../shared/api.js";
import { confetti } from "../../shared/confetti.js";
import { modal, resultScreen, lockScreen } from "../../shared/ui.js";
import { GAMES } from "../../shared/registry.js";

const META = GAMES.find((g) => g.id === GAME_ID);
const TODAY = activeDay(); // today, or an earlier day a Plus member has opened
const PUZZLE_NO = puzzleNumber(META.launchDay, TODAY);
const store = gameStore(GAME_ID);
const $ = (s) => document.querySelector(s);
const view = $("#view");
$("#stamp").textContent = `No. ${PUZZLE_NO}`;

// The game in progress: { mode, word, guesses, notes }. `notes` maps a letter to "out" or
// "in": the player's own jottings, which never affect the score.
let S = null;

const rowsHtml = (word, guesses) => guesses.map((g) => `<div class="jot-row ${g === word ? "hit" : ""}"><b>${g}</b><span>${g === word ? "Found it" : `<i>${shared(word, g)}</i>in common`}</span></div>`).join("");

function startGame(mode, saved = null) {
  S = { mode, word: mode === "daily" ? dailyWord(TODAY) : practiceWord(), guesses: saved?.guesses ?? [], notes: saved?.notes ?? {} };
  render();
}

/** Keep the day's guesses and notes, so leaving the page carries on from here. */
const save = () => S.mode === "daily" && store.saveProgress(TODAY, { guesses: S.guesses, notes: S.notes });

function render() {
  const { word, guesses, mode } = S, left = GUESSES - guesses.length;
  $("#sub").textContent = `${mode === "daily" ? "" : "Practice · "}Find the five-letter word`;
  view.innerHTML = `
    <section class="jot dg-enter">
      <div class="dg-segs" aria-hidden="true">${Array.from({ length: GUESSES }, (_, n) => `<i class="${n < guesses.length ? "on" : n === guesses.length ? "now" : ""}"></i>`).join("")}</div>
      <div class="jot-rows" aria-live="polite">${rowsHtml(word, guesses)}</div>
      <form class="jot-form" id="form" autocomplete="off">
        <input id="guess" type="text" maxlength="${LENGTH}" autocapitalize="none" spellcheck="false" placeholder="·····" aria-label="Your guess">
        <button class="dg-btn" type="submit">Guess</button>
      </form>
      <p class="jot-hint" id="hint">${guesses.length ? `${left} ${left === 1 ? "guess" : "guesses"} left` : "Any five letters will do. You're told how many are in the word."}</p>
      <div class="alpha" role="group" aria-label="Your notes">${[..."abcdefghijklmnopqrstuvwxyz"].map((ch) => `<button type="button" data-ch="${ch}" class="${S.notes[ch] ?? ""}" aria-label="${ch}${S.notes[ch] ? `, marked ${S.notes[ch]}` : ""}">${ch}</button>`).join("")}</div>
    </section>`;
  const input = $("#guess");
  $("#form").addEventListener("submit", (e) => {
    e.preventDefault();
    const g = input.value.trim().toLowerCase();
    if (!validGuess(g)) { $("#hint").textContent = "Type five letters."; input.focus(); return; }
    if (S.guesses.includes(g)) { $("#hint").textContent = "You've tried that one."; input.select(); return; }
    S.guesses.push(g);
    if (g === word || S.guesses.length === GUESSES) return finish();
    save();
    render();
  });
  // Notes cycle: plain, crossed out, marked as in.
  view.querySelectorAll("[data-ch]").forEach((b) => b.addEventListener("click", () => {
    const next = { undefined: "out", out: "in", in: undefined }[S.notes[b.dataset.ch]];
    if (next) S.notes[b.dataset.ch] = next; else delete S.notes[b.dataset.ch];
    b.className = next ?? "";
    save();
  }));
  setTimeout(() => $("#guess")?.focus({ preventScroll: true }), 60);
}

function finish() {
  const { mode, word, guesses } = S;
  const points = score(word, guesses);
  const result = { total: points, points, guesses, label: guesses.includes(word) ? `in ${guesses.length}` : "missed" };
  let sent = null;
  if (mode === "daily") {
    store.saveDay(TODAY, result, points);
    sent = submitPlay(GAME_ID, TODAY, clientId(), { guesses });
  }
  if (points >= 84) confetti(130);
  showSummary(mode, word, result, sent);
}

function showSummary(mode, word, result, sent = null) {
  S = null;
  const daily = mode === "daily", found = result.guesses.includes(word), n = result.guesses.length;
  $("#sub").textContent = daily ? "Today's word" : "Practice";
  resultScreen(view, {
    gameId: GAME_ID, day: TODAY, daily, result, sent,
    big: found ? n : word.toUpperCase(), unit: found ? `${n === 1 ? "guess" : "guesses"} to find ${word.toUpperCase()}` : "was the word",
    title: !found ? "It got away." : n <= 3 ? "Pure deduction." : n <= 5 ? "Neatly worked out." : "Got there.",
    body: `<div class="jot-rows">${rowsHtml(word, result.guesses)}</div>`,
    share: shareText(daily ? `Jot #${PUZZLE_NO}` : "Jot practice", word, result.guesses, result.points),
    practiceLabel: "Try another word",
    onPractice: () => startGame("practice"), onBack: showSaved, onDaily: () => startGame("daily"),
  });
}

const showSaved = () => showSummary("daily", dailyWord(TODAY), store.getDay(TODAY));

const howTo = () => modal({
  title: "How to play",
  body: `<ol>
    <li><b>Find the hidden five-letter word.</b> It has no repeated letters.</li>
    <li><b>Each guess gets one number:</b> how many of its letters are in the word. Not which ones, and not where.</li>
    <li><b>Any five letters count as a guess,</b> so use guesses to test letters: AEIOU is fair game.</li>
    <li><b>Keep notes.</b> Tap a letter below the box to cross it out; tap again to mark it as in.</li>
    <li><b>${GUESSES} guesses.</b> Find it within three for full marks.</li>
  </ol>`,
  onClose: () => $("#guess")?.focus(),
});
$("#howBtn").addEventListener("click", howTo);

// A game the player hasn't unlocked shows how to open it instead.
if (!lockScreen(GAME_ID, view)) {
  if (store.getDay(TODAY)?.guesses) showSaved();
  else {
    startGame("daily", store.progress(TODAY));
    if (!store.flag("seenHelp")) { store.setFlag("seenHelp"); howTo(); }
  }
}
