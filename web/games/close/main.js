// Close: one estimate, three guesses. The screen is shared with Year (shared/numbergame.js).
import { GAME_ID, GUESSES, SPOT_ON, MEASURES, dailyQuestion, practiceQuestion, validGuess, score, feedback, shareText } from "./core/puzzle.js";
import { fmt } from "../middleman/core/puzzle.js";
import { runNumberGame } from "../../shared/numbergame.js";

const tidy = (n) => (n >= 100 ? Math.round(n).toLocaleString("en-US") : String(Number(n.toPrecision(3))));
const puzzle = (q) => {
  const said = fmt[q.scale](q.item.v);
  return { answer: q.answer, name: q.item.name, emoji: q.item.emoji, question: MEASURES[q.scale], unit: q.unit.label, reveal: `About ${said.main}${said.sub ? ` (${said.sub})` : ""}.` };
};

runNumberGame({
  gameId: GAME_ID, guesses: GUESSES,
  daily: (day) => puzzle(dailyQuestion(day)), practice: () => puzzle(practiceQuestion()),
  parse: (text) => { const n = Number(text.replace(/[,\s$]/g, "")); return text.trim() && validGuess(n) ? n : null; },
  show: tidy,
  score, feedback, share: shareText,
  placeholder: "Your estimate",
  titles: (p) => (p >= 100 ? "Spot on." : p >= 75 ? "Very close." : p >= 45 ? "In the right area." : p > 0 ? "Roughly." : "Not close."),
  practiceLabel: "Try another one",
  help: `<li><b>One thing, one estimate.</b> How heavy, how fast, how big or how much. Type a number in the unit shown.</li>
    <li><b>${GUESSES} guesses.</b> After each, you're told whether to go higher or lower and how far off you were.</li>
    <li><b>Close counts.</b> Within ${SPOT_ON}% is spot on and scores 100. Twice too big or half too small scores 50; four times out scores nothing. Later guesses are worth a little less.</li>
    <li>Values are typical, rounded figures, the same ones Middleman uses.</li>`,
});
