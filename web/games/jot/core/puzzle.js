// Jot game rules: a hidden five-letter word, and guesses that are only told how many letters
// they share with it. Pure functions only, so the browser and the API always agree.
import { WORDS } from "./words.js";
import { hash, mulberry32 } from "../../../shared/random.js";

export const GAME_ID = "jot";
export const GUESSES = 8;
export const LENGTH = 5;

/** The day's hidden word. Same for everyone. */
export const dailyWord = (day) => WORDS[Math.floor(mulberry32(hash(GAME_ID + ":" + day))() * WORDS.length)];
export const practiceWord = () => WORDS[Math.floor(Math.random() * WORDS.length)];

/** Any five letters can be guessed: there is no dictionary to fall foul of. */
export const validGuess = (g) => typeof g === "string" && /^[a-z]{5}$/.test(g);

/** How many letters two words share, wherever they sit. A repeated letter only counts as often as both words have it. */
export function shared(a, b) {
  const left = [...b];
  let n = 0;
  for (const ch of a) {
    const at = left.indexOf(ch);
    if (at >= 0) { n++; left.splice(at, 1); }
  }
  return n;
}

/** Points, 0 to 100: full marks within three guesses, then less for each one after. Unsolved, a little for getting warm. */
export function score(answer, guesses) {
  const at = guesses.slice(0, GUESSES).indexOf(answer);
  if (at >= 0) return [100, 100, 100, 92, 84, 74, 64, 54][at];
  return Math.max(0, ...guesses.map((g) => shared(answer, g))) * 5;
}

/** The text players copy to share: the count each guess got. `title` is e.g. "Jot #12". */
export const shareText = (title, answer, guesses, points) => `${title} · ${points}/100\n🔤 ${guesses.map((g) => (g === answer ? "✓" : shared(answer, g))).join("-")}`;
