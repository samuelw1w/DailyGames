// Link UI. Rules live in core/puzzle.js.
import { GAME_ID, ROUNDS, TRIES, dailyLinks, practiceLinks, clean, scoreRound, playGame, shareText } from "./core/puzzle.js";
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

// The day in progress: { mode, links, n, answers }. `answers[n]` is { guesses, hint } for round n.
let S = null;

const segClass = (r) => (!r.solved ? "bad" : r.points >= 20 ? "on" : "mid");

function startGame(mode, saved = null) {
  S = { mode, links: mode === "daily" ? dailyLinks(TODAY) : practiceLinks(), n: saved?.n ?? 0, answers: saved?.answers ?? Array.from({ length: ROUNDS }, () => ({ guesses: [], hint: false })) };
  render();
}

/** Keep the day's tries, so leaving the page carries on from the same pair. */
const save = () => S.mode === "daily" && store.saveProgress(TODAY, { n: S.n, answers: S.answers });

/** Draw round `S.n`. Once it's settled (solved or out of tries) the answer is shown with a button on. */
function render() {
  const [first, link, second] = S.links[S.n], answer = S.answers[S.n];
  const round = scoreRound(link, answer), over = round.solved || answer.guesses.length === TRIES;
  const left = TRIES - answer.guesses.length;
  $("#sub").textContent = `${S.mode === "daily" ? "" : "Practice · "}One word finishes the first and starts the second`;
  const done = S.answers.slice(0, S.n).map((a, k) => scoreRound(S.links[k][1], a));
  view.innerHTML = `
    <section class="link">
      <div class="dg-segs" aria-hidden="true">${Array.from({ length: ROUNDS }, (_, k) => `<i class="${k < done.length ? segClass(done[k]) : k === S.n ? (over ? segClass(round) : "now") : ""}"></i>`).join("")}</div>
      <div class="trio ${over ? (round.solved ? "solved" : "missed") : ""}"><span>${first}</span><span class="gap">${over ? link : answer.hint ? `${link[0]}${"·".repeat(link.length - 1)}` : "?"}</span><span>${second}</span></div>
      <p class="pairs" aria-live="polite">${over ? `<b>${first}${link}</b> and <b>${link}${second}</b>${round.solved ? ` · +${round.points}` : ""}` : answer.guesses.length ? `Not ${answer.guesses.at(-1).toUpperCase()}.` : ""}</p>
      ${over ? `<button class="dg-btn" type="button" id="nextBtn">${S.n === ROUNDS - 1 ? "See result" : "Next pair"}</button>` : `
      <form class="link-form" id="form" autocomplete="off">
        <input id="guess" type="text" maxlength="14" autocapitalize="none" spellcheck="false" placeholder="The linking word" aria-label="The linking word">
        <button class="dg-btn" type="submit">Try</button>
      </form>
      <div class="link-foot"><span>${left} ${left === 1 ? "try" : "tries"} left</span>${answer.hint ? "<span>Hint used</span>" : `<button class="dg-link" type="button" id="hintBtn">Show the first letter</button>`}</div>`}
    </section>`;

  $("#form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const g = clean($("#guess").value);
    if (!g) return $("#guess").focus();
    answer.guesses.push(g);
    save();
    render();
  });
  $("#hintBtn")?.addEventListener("click", () => { answer.hint = true; save(); render(); });
  $("#nextBtn")?.addEventListener("click", () => (S.n === ROUNDS - 1 ? finish() : (S.n++, save(), render())));
  setTimeout(() => ($("#guess") ?? $("#nextBtn"))?.focus({ preventScroll: true }), 60);
}

function finish() {
  const { mode, links, answers } = S;
  const scored = playGame(links, answers);
  const result = { total: scored.total, points: scored.total, answers, label: `${scored.rounds.filter((r) => r.solved).length}/${ROUNDS}` };
  let sent = null;
  if (mode === "daily") {
    store.saveDay(TODAY, result, result.total);
    sent = submitPlay(GAME_ID, TODAY, clientId(), { answers });
  }
  if (result.total >= 85) confetti(130);
  showSummary(mode, links, result, sent);
}

function showSummary(mode, links, result, sent = null) {
  S = null;
  const daily = mode === "daily";
  const { rounds, total } = playGame(links, result.answers);
  const solved = rounds.filter((r) => r.solved).length;
  $("#sub").textContent = daily ? "Today's links" : "Practice";
  resultScreen(view, {
    gameId: GAME_ID, day: TODAY, daily, result, sent,
    big: solved, unit: `of ${ROUNDS} linked`,
    title: total === 100 ? "Five clean links." : solved === ROUNDS ? "All linked up." : solved >= 3 ? "Most of the chain." : solved ? "A link or two." : "Unlinked.",
    body: `<div class="dg-segs" aria-hidden="true">${rounds.map((r) => `<i class="${segClass(r)}"></i>`).join("")}</div>
      <div class="rows">${links.map(([a, link, b], n) => `<div class="row ${rounds[n].solved ? "" : "missed"}"><span>${a}<b>${link}</b>${b}</span><span class="n">${rounds[n].solved ? `+${rounds[n].points}` : "missed"}</span></div>`).join("")}</div>`,
    share: shareText(daily ? `Link #${PUZZLE_NO}` : "Link practice", rounds, result.answers.map((a) => a.hint), total),
    practiceLabel: "Try five more",
    onPractice: () => startGame("practice"), onBack: showSaved, onDaily: () => startGame("daily"),
  });
}

const showSaved = () => showSummary("daily", dailyLinks(TODAY), store.getDay(TODAY));

const howTo = () => modal({
  title: "How to play",
  body: `<ol>
    <li><b>Find the word in the middle.</b> It finishes the first word and starts the second: SUN ? HOUSE is LIGHT, for sunlight and lighthouse.</li>
    <li><b>${ROUNDS} pairs, ${TRIES} tries each.</b> A pair is worth 20 points, and 5 less for each wrong try.</li>
    <li><b>Stuck?</b> You can see the first letter, for 8 points.</li>
  </ol>`,
  onClose: () => $("#guess")?.focus(),
});
$("#howBtn").addEventListener("click", howTo);

// A game the player hasn't unlocked shows how to open it instead.
if (!lockScreen(GAME_ID, view)) {
  if (store.getDay(TODAY)?.answers) showSaved();
  else {
    startGame("daily", store.progress(TODAY));
    if (!store.flag("seenHelp")) { store.setFlag("seenHelp"); howTo(); }
  }
}
