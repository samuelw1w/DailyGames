# Adding a new game

Each game is one folder plus a registry entry. The steps below use a game called `oddone` as the example.

## 1. Frontend: `web/games/oddone/`

```
web/games/oddone/
├── index.html     # copy Middleman's and change the title, logo and script
├── style.css      # game-only styles; colors, fonts and buttons come from shared/theme.css
├── main.js        # UI
└── core/          # rules + data, with no DOM, storage or network code
    └── puzzle.js
```

Use the shared helpers instead of writing your own:

```js
import { hash, mulberry32 } from "../../../shared/random.js";  // in core/
import { dayKey, puzzleNumber } from "../../shared/daily.js";
import { gameStore, clientId } from "../../shared/storage.js";
import { submitPlay, getStats } from "../../shared/api.js";
```

- Build the daily puzzle from `mulberry32(hash("oddone:" + day))`. Prefix the seed with the game ID so games don't share puzzles.
- Save the result with `gameStore("oddone").saveDay(day, result, score)`. The `result` object must include `total` so the hub can show the score.
- Treat the API as optional: `submitPlay` and `getStats` resolve to `null` when it's unreachable.

## 2. Hub: `web/shared/registry.js`

```js
{ id: "oddone", name: "Odd One Out", tagline: "…", icon: "🧩", accent: "#3EE0B0",
  path: "games/oddone/", launchDay: "2026-11-01", maxScore: 100, status: "live" }
```

Use `status: "soon"` to show a teaser card before launch.

## 3. Backend (only if the game sends plays): `api/src/games/oddone.js`

```js
import { dailyPuzzle, scoreAnswers } from "../../../web/games/oddone/core/puzzle.js";
import { HttpError } from "../lib/http.js";

export default {
  id: "oddone",
  maxScore: 100,
  checkAnswers(day, answers) {
    // Validate `answers`, throw new HttpError(400, "…") if invalid.
    // Return { score, picks: [{ round, answer }], detail }.
  },
};
```

Then register it in `api/src/games/index.js`. No database changes are needed: `plays` and `picks` are shared by all games.

## 4. Tests: `tests/oddone-core.test.js`
At minimum, check that the same day gives the same puzzle, that every puzzle for the next year is valid, and that scoring stays within bounds. `tests/middleman-core.test.js` is a template, and `tests/api.test.js` shows how to test the endpoints against a real SQLite database.
