// The screen shared by the two "type a number, three guesses" games (Year and Close).
// Each game passes in its own puzzle, scoring and wording; this file draws the question,
// takes the guesses, shows higher or lower after each, and ends on the shared result screen.
import { puzzleNumber } from "./daily.js";
import { activeDay } from "./account.js";
import { gameStore, clientId } from "./storage.js";
import { submitPlay } from "./api.js";
import { confetti } from "./confetti.js";
import { modal, resultScreen, lockScreen, esc } from "./ui.js";
import { GAMES } from "./registry.js";

/**
 * Run a number game on the current page.
 *   gameId, guesses           the game's id and how many guesses it allows
 *   daily(day), practice()    return a puzzle: { answer, name, emoji, question, unit, reveal }
 *                             (`unit` is the label beside the box, `reveal` the answer in words)
 *   parse(text)               the typed text as a number, or null if it isn't a usable guess
 *   show(n)                   a guess as text
 *   score(answer, guesses)    points, 0 to 100
 *   feedback(answer, guess)   { dir: "exact" | "Higher" | ..., text }
 *   share(title, answer, guesses, points)
 *   placeholder, titles(points), help (HTML list items), practiceLabel
 */
export function runNumberGame(g) {
  const meta = GAMES.find((x) => x.id === g.gameId);
  const TODAY = activeDay(), NUMBER = puzzleNumber(meta.launchDay, TODAY);
  const store = gameStore(g.gameId);
  const $ = (s) => document.querySelector(s);
  const view = $("#view");
  $("#stamp").textContent = `No. ${NUMBER}`;
  let S = null; // { mode, puzzle, guesses }

  const rowsHtml = (puzzle, guesses) => guesses.map((x) => {
    const fb = g.feedback(puzzle.answer, x);
    return `<div class="ng-row ${fb.dir === "exact" ? "hit" : ""}"><b>${esc(g.show(x))}</b><span>${fb.dir === "exact" ? "" : esc(fb.dir)}</span><i>${esc(fb.text)}</i></div>`;
  }).join("");

  function start(mode, guesses = []) {
    S = { mode, puzzle: mode === "daily" ? g.daily(TODAY) : g.practice(), guesses };
    render();
  }

  function render() {
    const { puzzle, guesses, mode } = S;
    $("#sub").textContent = `${mode === "daily" ? "" : "Practice · "}${g.guesses} guesses`;
    view.innerHTML = `
      <section class="ng dg-enter">
        <div class="ng-thing"><span class="ng-emoji">${puzzle.emoji}</span><h2>${esc(puzzle.name)}</h2><p>${esc(puzzle.question)}</p></div>
        <div class="dg-segs" aria-hidden="true">${Array.from({ length: g.guesses }, (_, n) => `<i class="${n < guesses.length ? "on" : n === guesses.length ? "now" : ""}"></i>`).join("")}</div>
        <div class="ng-rows" aria-live="polite">${rowsHtml(puzzle, guesses)}</div>
        <form class="ng-form" id="form" autocomplete="off">
          <label class="ng-field"><input id="guess" type="text" inputmode="decimal" placeholder="${esc(g.placeholder)}" aria-label="Your guess"><span>${esc(puzzle.unit)}</span></label>
          <button class="dg-btn" type="submit">Guess</button>
        </form>
        <p class="ng-hint" id="hint">${guesses.length ? `${g.guesses - guesses.length} ${g.guesses - guesses.length === 1 ? "guess" : "guesses"} left` : "Earlier guesses are worth more."}</p>
      </section>`;
    const input = $("#guess");
    $("#form").addEventListener("submit", (e) => {
      e.preventDefault();
      const value = g.parse(input.value);
      if (value === null) { $("#hint").textContent = "Type a number."; input.focus(); return; }
      S.guesses.push(value);
      const done = g.feedback(puzzle.answer, value).dir === "exact" || S.guesses.length === g.guesses;
      if (!done && S.mode === "daily") store.saveProgress(TODAY, { guesses: S.guesses });
      done ? finish() : render();
    });
    setTimeout(() => $("#guess")?.focus({ preventScroll: true }), 60);
  }

  function finish() {
    const { mode, puzzle, guesses } = S;
    const points = g.score(puzzle.answer, guesses);
    const result = { total: points, points, guesses, label: `${points}/100` };
    let sent = null;
    if (mode === "daily") {
      store.saveDay(TODAY, result, points);
      sent = submitPlay(g.gameId, TODAY, clientId(), { guesses });
    }
    if (points >= 85) confetti(130);
    summary(mode, puzzle, result, sent);
  }

  function summary(mode, puzzle, result, sent = null) {
    S = null;
    const daily = mode === "daily";
    $("#sub").textContent = daily ? "Today's answer" : "Practice";
    resultScreen(view, {
      gameId: g.gameId, day: TODAY, daily, result, sent,
      big: result.points, unit: "of 100", title: g.titles(result.points),
      body: `<div class="ng-thing"><span class="ng-emoji">${puzzle.emoji}</span><h2>${esc(puzzle.name)}</h2><p>${esc(puzzle.reveal)}</p></div>
        <div class="ng-rows">${rowsHtml(puzzle, result.guesses)}</div>`,
      share: g.share(daily ? `${meta.name} #${NUMBER}` : `${meta.name} practice`, puzzle.answer, result.guesses, result.points),
      practiceLabel: g.practiceLabel,
      onPractice: () => start("practice"), onBack: showSaved, onDaily: () => start("daily"),
    });
  }

  const showSaved = () => summary("daily", g.daily(TODAY), store.getDay(TODAY));
  const howTo = () => modal({ title: "How to play", body: `<ol>${g.help}</ol>`, onClose: () => $("#guess")?.focus() });
  $("#howBtn").addEventListener("click", howTo);

  if (lockScreen(g.gameId, view)) return; // not unlocked: the screen says how to open it
  if (store.getDay(TODAY)?.guesses) showSaved();
  else {
    start("daily", store.progress(TODAY)?.guesses ?? []);
    if (!store.flag("seenHelp")) { store.setFlag("seenHelp"); howTo(); }
  }
}
