// Middleman game rules. Pure functions only (no DOM, no storage, no network),
// so the browser and the API import this same file and always agree on
// today's puzzle and on scores.
import { RAW } from "./catalog.js";
import { hash, mulberry32, shuffle } from "../../../shared/random.js";

export const GAME_ID = "middleman";
export const ROUNDS_PER_DAY = 5;

/* ---------- Scales ---------- */
export const SCALES = {
  weight: { label: "Weight", icon: "⚖️", log: true, span: [1.5, 6.5], q: "Name something that weighs right in between.", lo: "light", hi: "heavy", loC: "lighter", hiC: "heavier" },
  speed: { label: "Speed", icon: "💨", log: true, span: [1.2, 5], q: "Name something whose top speed is right in between.", lo: "slow", hi: "fast", loC: "slower", hiC: "faster" },
  size: { label: "Size", icon: "📏", log: true, span: [1.5, 6.5], q: "Name something whose length or height is right in between.", lo: "small", hi: "big", loC: "smaller", hiC: "bigger" },
  year: { label: "Age", icon: "⏳", log: false, span: [250, 5500], q: "Name something invented or built right in between.", lo: "early", hi: "late", loC: "older", hiC: "newer" },
  price: { label: "Price", icon: "🏷️", log: true, span: [1.5, 6.5], q: "Name something that typically costs right in between.", lo: "cheap", hi: "pricey", loC: "cheaper", hiC: "pricier" },
};
export const SCALE_KEYS = Object.keys(SCALES);

/** Lowercase, strip accents, punctuation and a leading article. Used for search and IDs. */
export const norm = (s) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 .\-']/g, " ").replace(/^(a|an|the)\s+/, "").replace(/\s+/g, " ").trim();
export const slug = (s) => norm(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

for (const key of SCALE_KEYS) {
  const sc = SCALES[key];
  sc.key = key;
  sc.items = RAW[key].trim().split("\n").map((line) => {
    const [name, emoji, v, aliases] = line.split("|");
    return { id: slug(name), name, emoji, v: Number(v), keys: [name, ...(aliases ? aliases.split(",") : [])].map(norm) };
  });
  sc.byId = new Map(sc.items.map((it) => [it.id, it]));
  if (sc.byId.size !== sc.items.length) throw new Error(`Duplicate item name in scale "${key}"`);
}

/* ---------- Math ---------- */
const f = (sc, v) => (sc.log ? Math.log10(v) : v);
/** Where value v sits between a (0) and b (1), on the scale's own axis (log or linear). */
export const posOf = (sc, v, a, b) => (f(sc, v) - f(sc, a.v)) / (f(sc, b.v) - f(sc, a.v));
export const midValue = (sc, a, b) => {
  const m = (f(sc, a.v) + f(sc, b.v)) / 2;
  return sc.log ? 10 ** m : m;
};
/** 100 at the exact middle, 0 at or beyond either end. */
export const scoreFor = (pos) => {
  const e = Math.abs(pos - 0.5) * 2;
  return e >= 1 ? 0 : Math.round(100 * (1 - e) ** 1.3);
};
/** 0–4 tier used for colours and the share grid. */
export const grade = (s) => (s >= 95 ? 4 : s >= 75 ? 3 : s >= 45 ? 2 : s > 0 ? 1 : 0);
export const SQUARES = ["🟥", "🟧", "🟨", "🟩", "🎯"];

/* ---------- Puzzles ---------- */
export function pickPair(sc, rng) {
  const it = sc.items, n = it.length;
  for (let t = 0; t < 5000; t++) {
    const i = Math.floor(rng() * n), j = Math.floor(rng() * n);
    if (i === j || it[i].emoji === it[j].emoji) continue;
    const [a, b] = it[i].v < it[j].v ? [it[i], it[j]] : [it[j], it[i]];
    const span = f(sc, b.v) - f(sc, a.v);
    if (span < sc.span[0] || span > sc.span[1]) continue;
    const near = it.filter((k) => k !== a && k !== b && Math.abs(posOf(sc, k.v, a, b) - 0.5) < 0.12).length;
    if (near >= 3) return { a, b };
  }
  return { a: it[0], b: it[n - 1] };
}

function roundsFrom(rng) {
  return shuffle(SCALE_KEYS, rng).map((scale) => ({ scale, ...pickPair(SCALES[scale], rng) }));
}
/** The puzzle everyone gets for a date key like "2026-10-05". */
export const dailyRounds = (day) => roundsFrom(mulberry32(hash(`${GAME_ID}:${day}`)));
/** A fresh random puzzle for practice mode. */
export const practiceRounds = () => roundsFrom(mulberry32((Math.random() * 2 ** 32) >>> 0));

/** Score one answer (an item id, or null for "ran out of time") against a round. */
export function scoreAnswer(round, itemId) {
  if (itemId == null) return { item: null, pos: null, score: 0 };
  const sc = SCALES[round.scale];
  const item = sc.byId.get(itemId);
  if (!item || item === round.a || item === round.b) return null; // not a legal answer
  const pos = posOf(sc, item.v, round.a, round.b);
  return { item, pos, score: scoreFor(pos) };
}

/** The catalog items closest to the true middle, excluding the endpoints and `exclude`. */
export function closest(round, count = 3, exclude = null) {
  const sc = SCALES[round.scale];
  return sc.items
    .filter((k) => k !== round.a && k !== round.b && k !== exclude)
    .map((k) => ({ item: k, pos: posOf(sc, k.v, round.a, round.b) }))
    .sort((x, y) => Math.abs(x.pos - 0.5) - Math.abs(y.pos - 0.5))
    .slice(0, count);
}

/** Autocomplete: best matches for typed text, never the round's own endpoints. */
export function search(round, text, limit = 6) {
  const q = norm(text);
  if (!q) return [];
  const scored = [];
  for (const it of SCALES[round.scale].items) {
    if (it === round.a || it === round.b) continue;
    let best = 9;
    for (const k of it.keys) {
      if (k === q) best = Math.min(best, 0);
      else if (k.startsWith(q)) best = Math.min(best, 1);
      else if ((" " + k).includes(" " + q)) best = Math.min(best, 2);
      else if (k.includes(q)) best = Math.min(best, 3);
    }
    if (best < 9) scored.push([best, it]);
  }
  scored.sort((x, y) => x[0] - y[0] || x[1].name.length - y[1].name.length);
  return scored.slice(0, limit).map((x) => x[1]);
}

/* ---------- Display formatting ---------- */
const sig = (n, s = 2) => {
  if (n === 0) return "0";
  const v = Number(n.toPrecision(s));
  return v >= 1000 ? v.toLocaleString("en-US") : String(v);
};
export const fmt = {
  weight(kg) {
    let main, sub;
    if (kg < 0.001) main = sig(kg * 1e6) + " mg"; else if (kg < 1) main = sig(kg * 1000) + " g"; else if (kg < 1000) main = sig(kg) + " kg"; else main = sig(kg / 1000) + " t";
    if (kg < 0.0283) sub = null; else if (kg < 0.454) sub = sig(kg * 35.274) + " oz"; else if (kg < 1814) sub = sig(kg * 2.2046) + " lb"; else sub = sig(kg / 907.18) + " US tons";
    return { main, sub };
  },
  speed(mph) {
    return { main: sig(mph) + " mph", sub: mph >= 0.5 ? sig(mph * 1.609) + " km/h" : null };
  },
  size(m) {
    let main, sub = null;
    if (m < 0.001) main = sig(m * 1e6) + " µm"; else if (m < 0.01) main = sig(m * 1000) + " mm"; else if (m < 1) main = sig(m * 100) + " cm"; else if (m < 1000) main = sig(m) + " m"; else main = sig(m / 1000) + " km";
    if (m >= 0.01 && m < 0.3) sub = sig(m * 39.37) + " in"; else if (m >= 0.3 && m < 1609) sub = sig(m * 3.2808) + " ft"; else if (m >= 1609) sub = sig(m / 1609.34) + " mi";
    return { main, sub };
  },
  year(y, now = new Date().getFullYear()) {
    y = Math.round(y);
    return { main: y < 0 ? (-y).toLocaleString("en-US") + " BCE" : String(y), sub: (now - y).toLocaleString("en-US") + " yrs ago" };
  },
  price(d) {
    let main;
    if (d < 1) main = Math.round(d * 100) + "¢";
    else if (d < 10) main = "$" + (Number.isInteger(+d.toFixed(2)) ? d.toFixed(0) : d.toFixed(2));
    else if (d < 1e6) main = "$" + Number(d.toPrecision(2)).toLocaleString("en-US");
    else if (d < 1e9) main = "$" + sig(d / 1e6) + "M";
    else main = "$" + sig(d / 1e9) + "B";
    return { main, sub: null };
  },
};
