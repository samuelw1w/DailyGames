// Per-browser storage, namespaced per game. Best effort: private windows and blocked
// storage return null instead of throwing, and every game must still work without it.
import { dayKey, parseDayKey } from "./daily.js";

const PREFIX = "dg.v1";

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
      if (read(k("progress"))?.day === day) write(k("progress"), null); // that day is finished: nothing left to pick up
      const h = read(k("history")) || {};
      h[day] = score;
      write(k("history"), h);
    },
    history: () => read(k("history")) || {},
    stats() {
      const h = read(k("history")) || {};
      let streak = 0;
      const d = parseDayKey(dayKey());
      if (h[dayKey(d)] == null) d.setDate(d.getDate() - 1); // today not played yet: streak still alive
      while (h[dayKey(d)] != null) {
        streak++;
        d.setDate(d.getDate() - 1);
      }
      const scores = Object.values(h);
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
