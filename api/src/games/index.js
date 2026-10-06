// Server-side game registry. Each module exports:
//   id         string, matches web/shared/registry.js
//   maxScore   number, used for the score histogram
//   checkAnswers(day, answers) -> { score, picks: [{ round, answer }], detail }
//     Throws HttpError(400) for invalid input. `picks` may be empty for games without answers.
import middleman from "./middleman.js";
import orbit from "./orbit.js";
import pins from "./pins.js";
import skip from "./skip.js";
import spot from "./spot.js";

export const GAMES = new Map([middleman, orbit, pins, skip, spot].map((g) => [g.id, g]));
