// Per-browser storage, namespaced per game. Best effort: private windows and blocked
// storage return null instead of throwing, and every game must still work without it.
import { dayKey, parseDayKey } from "./daily.js";

const PREFIX = "dg.v1";
/**
 * The day this page was opened on. A result saved for an earlier day than this was played
 * later (a Plus member going back): it keeps its score, but it doesn't count for streaks or
 * leaderboards. Using the day the page opened, not the moment of saving, means a game started
 * just before midnight still counts for the day it was started on.
 */
const OPENED = dayKey();

function read(key) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
}
function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

/** Anonymous random ID for this browser, sent with plays so one browser = one play per day. */
export function clientId() {
  let id = read(`${PREFIX}.clientId`);
  if (!id) {
    id = (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);
    write(`${PREFIX}.clientId`, id);
  }
  return id;
}

/** Storage scoped to one game: today's result, score history, streaks, one-off flags. */
export function gameStore(gameId) {
  const k = (s) => `${PREFIX}.${gameId}.${s}`;
  return {
    getDay: (day = dayKey()) => read(k(`day.${day}`)),
    saveDay(day, result, score) {
      write(k(`day.${day}`), result);
      if (day < OPENED) write(k("late"), { ...(read(k("late")) || {}), [day]: OPENED });
      if (read(k("progress"))?.day === day) write(k("progress"), null); // that day is finished: nothing left to pick up
      const h = read(k("history")) || {};
      h[day] = score;
      write(k("history"), h);
    },
    history: () => read(k("history")) || {},
    /** Was that day's result played on the day itself? */
    onTime: (day) => !(read(k("late")) || {})[day],
    stats() {
      const h = read(k("history")) || {};
      const late = read(k("late")) || {};
      for (const day of Object.keys(late)) delete h[day]; // days played later don't keep a streak going
      let streak = 0;
      const d = parseDayKey(dayKey());
      if (h[dayKey(d)] == null) d.setDate(d.getDate() - 1); // today not played yet: streak still alive
      while (h[dayKey(d)] != null) {
        streak++;
        d.setDate(d.getDate() - 1);
      }
      const scores = Object.values(read(k("history")) || {});
      return { streak, played: scores.length, best: scores.length ? Math.max(...scores) : 0 };
    },
    flag: (name) => read(k(`flag.${name}`)),
    setFlag: (name, v = true) => write(k(`flag.${name}`), v),
    // A daily game left part way through: what it needs to carry on from the same place, so
    // leaving the page (or the phone closing it) never restarts the day. One per game.
    progress: (day = dayKey()) => { const p = read(k("progress")); return p?.day === day ? p : null; },
    saveProgress: (day, data) => write(k("progress"), { ...data, day }),
    clearProgress: () => write(k("progress"), null),
  };
}
