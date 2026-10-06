// Year: when was it invented or built? The screen is shared with Close (shared/numbergame.js).
import { GAME_ID, GUESSES, dailyThing, practiceThing, validGuess, score, feedback, shareText } from "./core/puzzle.js";
import { runNumberGame } from "../../shared/numbergame.js";

const puzzle = (thing) => ({ answer: thing.v, name: thing.name, emoji: thing.emoji, question: "What year was it invented or built?", unit: "AD", reveal: `${thing.v}.` });

runNumberGame({
  gameId: GAME_ID, guesses: GUESSES,
  daily: (day) => puzzle(dailyThing(day)), practice: () => puzzle(practiceThing()),
  parse: (text) => { const n = Number(text.trim()); return text.trim() && validGuess(n) ? n : null; },
  show: (n) => String(n),
  score, feedback, share: shareText,
  placeholder: "Year",
  titles: (p) => (p >= 100 ? "To the year." : p >= 70 ? "You know your history." : p >= 40 ? "Right era." : p > 0 ? "A few decades out." : "Another age entirely."),
  practiceLabel: "Try another one",
  help: `<li><b>One thing, one question.</b> Type the year it was invented or built.</li>
    <li><b>${GUESSES} guesses.</b> After each, you're told whether the answer is earlier or later, and how many years off you were.</li>
    <li><b>Exact is best.</b> The right year scores 100 on the first guess, 85 on the second, 70 on the third. Otherwise your nearest guess counts: within 40 years scores something.</li>`,
});
