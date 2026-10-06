// Link game rules: five compound pairs a day and how each one scores. Pure functions only,
// so the browser and the API always agree.
import { LINKS } from "./links.js";
import { hash, mulberry32, shuffle } from "../../../shared/random.js";

export const GAME_ID = "link";
export const ROUNDS = 5;
export const TRIES = 3;
const ROUND_POINTS = 20;

/** The day's five puzzles, each [first, link, second]. Same for everyone. */
export const dailyLinks = (day) => shuffle(LINKS, mulberry32(hash(GAME_ID + ":" + day))).slice(0, ROUNDS);
export const practiceLinks = () => shuffle(LINKS, Math.random).slice(0, ROUNDS);

/** Tidy what was typed: lower case, letters only. */
export const clean = (text) => String(text).toLowerCase().replace(/[^a-z]/g, "");

/**
 * Score one round from what the player did: `guesses` in order (at most TRIES count) and
 * whether they took the `hint` (the first letter). Returns { solved, wrong, points }:
 * 20 for getting it straight off, 5 less for each wrong guess, 8 less for the hint.
 */
export function scoreRound(link, { guesses, hint }) {
  const tried = guesses.slice(0, TRIES).map(clean);
  const at = tried.indexOf(link);
  if (at < 0) return { solved: false, wrong: tried.length, points: 0 };
  return { solved: true, wrong: at, points: Math.max(4, ROUND_POINTS - 5 * at - (hint ? 8 : 0)) };
}

/**
 * Score a whole day. `answers` is one { guesses, hint } per round. Returns { rounds, total }
 * (total is 0 to 100), or null if `answers` isn't five well-formed rounds.
 */
export function playGame(links, answers) {
  if (!Array.isArray(answers) || answers.length !== ROUNDS) return null;
  const ok = answers.every((a) => a && typeof a.hint === "boolean" && Array.isArray(a.guesses) && a.guesses.length <= TRIES && a.guesses.every((g) => typeof g === "string" && g.length <= 24));
  if (!ok) return null;
  const rounds = answers.map((a, n) => scoreRound(links[n][1], a));
  return { rounds, total: rounds.reduce((sum, r) => sum + r.points, 0) };
}

/** The text players copy to share: one block per round. `title` is e.g. "Link #12". */
export const shareText = (title, rounds, hints, total) => `${title} · ${total}/100\n🔗 ${rounds.map((r, n) => (!r.solved ? "⬛" : hints[n] || r.wrong ? "🟨" : "🟩")).join("")}`;
