// Server-side game registry. Each module exports:
//   id         string, matches web/shared/registry.js
//   maxScore   number, used for the score histogram
//   checkAnswers(day, answers, { clientId, db }) -> { score, picks: [{ round, answer }], detail }
//     May be async. Throws HttpError(400) for invalid input. `picks` may be empty for games
//     without answers. Most games only need the day; `series` reads the player's other plays.
import close from "./close.js";
import hole from "./hole.js";
import house from "./house.js";
import jot from "./jot.js";
import link from "./link.js";
import middleman from "./middleman.js";
import orbit from "./orbit.js";
import pins from "./pins.js";
import series from "./series.js";
import skip from "./skip.js";
import stop from "./stop.js";
import year from "./year.js";

export const GAMES = new Map([close, hole, house, jot, link, middleman, orbit, pins, series, skip, stop, year].map((g) => [g.id, g]));
