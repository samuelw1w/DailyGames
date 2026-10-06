# Adding a new game

Each game is one folder plus a registry entry. The steps below use a game called `oddone` as the example.

## 1. Frontend: `web/games/oddone/`

```
web/games/oddone/
├── index.html     # copy Middleman's and change the title, logo and script
├── style.css      # game-only styles, plus the game's own --accent color; the rest comes from shared/theme.css
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
- Save the result with `gameStore("oddone").saveDay(day, result, score)`. The `result` object must include `total` so the hub can show the score. If "412/500" isn't the right way to say it, also save a short `label` (Orbit saves "3 jumps") and the hub shows that instead.
- Treat the API as optional: `submitPlay` and `getStats` resolve to `null` when it's unreachable.

## 2. Hub: `web/shared/registry.js`

```js
{ id: "oddone", name: "Odd One Out", tagline: "…", category: "Logic", accent: "#5BB8F5",
  path: "games/oddone/", launchDay: "2026-11-01", maxScore: 100, status: "live" }
```

Use `status: "soon"` to show a dimmed teaser card before launch. `category` is the hub section (Word, Knowledge, Play, Tables or Logic); add a new section by adding its name to `CATEGORIES` in the same file.

### Look and feel
Every page shares one style: near-black page, quiet rounded cards, white type with grey secondary text. Each game has **its own accent color that no other game uses**. Set it in the registry (`accent`) and at the top of the game's `style.css`:

```css
:root { --accent: #5bb8f5; --tint: 5%; }   /* --tint washes the page background with the accent */
```

Orbit is the reference for how a game should look: the scene drawn straight on the page with a few thin lines, white for the thing you control, the accent for the thing you aim at, and nothing decorative. Pins, Spot and Skip follow it.

Build the page from the shared pieces in `shared/theme.css`: `dg-head` (Hub / name / "No. 12" and a one-line subtitle), `dg-row` (a left/right line of facts), `dg-segs` (segmented progress bar), `dg-card`, `dg-btn`, `dg-stats`, `dg-links`, and for one-tap games `dg-zone` (the whole play area as one button), `dg-stage` (the canvas), `dg-tap` (the prompt card), `dg-summary` and `dg-verdict` (the result screen). `shared/ui.js` has the help dialog, copy button, countdown and rank line. Use the accent for the thing the player should look at, and keep everything else white or grey.

### One-tap games
Action games like Orbit follow these rules:

- **The game moves, the player picks the moment.** The only input is a tap. The whole play area is the button, and Space does the same on a keyboard. No drag, swipe, hold, pinch or multi-touch.
- **Fixed-timestep physics** in `core/`, using only `+ - * /` and `Math.sqrt`, so the same tap timing gives the same result on every device and the server can replay it. See `orbit/core/sim.js`.
- **Generous timing.** Orbit's levels are only used if they can be won through launch windows of at least a fifth of a second. Spot only keeps a kick if it offers a scoring chance a quarter of a second long.
- **Randomness is seeded, never `Math.random()`.** Pins' release slip and Skip's uneven hops come from the day's seed, so they feel random to the player but the server can still replay them.
- **Slow motion** as an optional assist. Results earned with it are marked (🐢) in stats and shares.

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

`answers` can be any JSON. For an action game, send the inputs (Orbit sends the tick of each tap) and replay them on the server.

Then register it in `api/src/games/index.js`. No database changes are needed: `plays` and `picks` are shared by all games.

## 4. Tests: `tests/oddone-core.test.js`
At minimum, check that the same day gives the same puzzle, that every puzzle for the next year is valid, and that scoring stays within bounds. `tests/middleman-core.test.js` is a template, and `tests/api.test.js` shows how to test the endpoints against a real SQLite database.
