# Daily Hub

A hub of small daily puzzle games. Everyone gets the same puzzles each day, and a new set unlocks at midnight in the player's own time zone.

**Games**

| Game | Folder | What it is |
| --- | --- | --- |
| Middleman | [`web/games/middleman`](web/games/middleman) | Name the thing halfway between two others by weight, speed, size, age or price. |
| Orbit | [`web/games/orbit`](web/games/orbit) | A ship circles a planet. Tap to let go and sling it from planet to planet; reach the goal in five jumps. |
| Pins | [`web/games/pins`](web/games/pins) | Three frames of bowling. One tap sets where the ball starts, a second sets its hook. Every ball has its own drift and a small random slip on release. |
| Spot | [`web/games/spot`](web/games/spot) | Five penalty kicks at a small goal. Tap to shoot where the fast-moving reticle is, allow for the wind, and read the keeper's routine. |
| Skip | [`web/games/skip`](web/games/skip) | Skip a stone. Tap each time it touches the water; every hop is a different length and height, and the timing tightens with every skip. |
| Pegs | [`web/games/pegs`](web/games/pegs) | A ball slides across the top; tap to drop it through a field of pegs. Clear every yellow peg with five balls. |
| Stakes | [`web/games/stakes`](web/games/stakes) | Start with 100 and play one hand at each of five casino tables: roulette, blackjack, baccarat, three card poker and craps. The result is how many times over you multiplied it. |

## How it's built

```
DailyGames/
├── web/                     # Everything the browser loads (static files, no build step)
│   ├── index.html           # The hub: one card per game
│   ├── assets/              # Hub-only CSS and JS
│   ├── shared/              # Used by the hub and every game
│   │   ├── theme.css        #   house style: dark page, quiet cards, one accent color per game
│   │   ├── registry.js      #   the list of games shown on the hub
│   │   ├── random.js        #   seeded randomness (same puzzle for everyone)
│   │   ├── daily.js         #   date keys, puzzle numbers, countdown
│   │   ├── storage.js       #   per-browser results and streaks
│   │   ├── api.js           #   optional calls to the backend
│   │   ├── ui.js            #   help dialog, copy button, countdown, "you beat X%"
│   │   └── confetti.js
│   └── games/
│       ├── middleman/
│       │   ├── index.html, style.css, main.js   # UI
│       │   └── core/                            # Rules and data, shared with the API
│       │       ├── catalog.js                   #   every answer and its value
│       │       └── puzzle.js                    #   daily puzzle, scoring, search
│       ├── orbit/
│       │   ├── index.html, style.css, main.js   # UI (canvas)
│       │   └── core/
│       │       ├── sim.js                       #   physics and level builder
│       │       ├── levels.js                    #   checked level seeds, one per day (generated)
│       │       ├── solver.js                    #   finds routes; used to pick fair levels
│       │       └── puzzle.js                    #   daily level, scoring, share text
│       ├── pins/                                # same shape: UI + core/sim.js (ball and pins), core/puzzle.js (frames, scoring)
│       ├── spot/                                # UI + core/sim.js (reticle, keeper, kicks)
│       ├── skip/                                # UI + core/sim.js (touches, timing windows)
│       ├── pegs/                                # UI + core/sim.js (ball and pegs), levels.js, solver.js, puzzle.js
│       └── stakes/                              # UI + core/tables.js (the five casino tables)
├── api/                     # Backend (Cloudflare Worker)
│   ├── src/
│   │   ├── index.js         # Router
│   │   ├── plays.js         # Submit a play, read a day's stats (game-agnostic)
│   │   ├── games/           # One module per game: validates answers, computes the score
│   │   └── lib/             # HTTP and date helpers
│   └── migrations/          # D1 (SQLite) schema
├── tools/                   # `npm run orbit:levels` and `npm run pegs:levels` rebuild the checked level lists
├── tests/                   # `npm test`: game rules + API against a real SQLite DB
├── docs/                    # Architecture, API reference, adding a new game
└── wrangler.toml            # One deploy serves both web/ and the API
```

- **Frontend:** plain HTML, CSS and ES modules. No framework and no build step; open the files in any editor and they are what ships.
- **Backend:** one [Cloudflare Worker](https://developers.cloudflare.com/workers/) with a [D1](https://developers.cloudflare.com/d1/) database. It serves the static site from `web/` and handles `/api/*`. It records each day's plays, rescoring them on the server, and returns crowd stats: how many people played, the score spread, and the most-picked answers.
- **The site works without the backend.** If the API is unreachable, games still play and save streaks locally; only the "what everyone picked" and "you beat X%" parts are hidden.

More detail: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [docs/API.md](docs/API.md) · [docs/ADDING_A_GAME.md](docs/ADDING_A_GAME.md)

## Run it locally

Needs Node 22.5 or newer.

```sh
npm install
npm run db:migrate:local   # creates the local SQLite database
npm run dev                # http://localhost:8787
npm test
```

## Deploy (free Cloudflare account)

```sh
npx wrangler login
npx wrangler d1 create daily-games      # copy the database_id it prints into wrangler.toml
npm run db:migrate                      # create the tables in the real database
npm run deploy                          # prints your URL, e.g. https://daily-games.<you>.workers.dev
```

After that, `npm run deploy` publishes any change. To use your own domain, add it under the Worker's **Settings → Domains & Routes** in the Cloudflare dashboard.

**Changing a game's catalog** (for example `web/games/middleman/core/catalog.js`) changes the puzzles for every date, including today. Deploy those edits right after midnight. The same goes for Orbit's physics (`web/games/orbit/core/sim.js`): after any change there, run `npm run orbit:levels` to rebuild the list of fair levels. Pegs works the same way with `npm run pegs:levels`.
