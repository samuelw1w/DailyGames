# Daily Games

A hub of small daily puzzle games. Everyone gets the same puzzles each day, and a new set unlocks at midnight in the player's own time zone.

**Games**

| Game | Folder | What it is |
| --- | --- | --- |
| Middleman | [`web/games/middleman`](web/games/middleman) | Name the thing halfway between two others by weight, speed, size, age or price. |

## How it's built

```
DailyGames/
├── web/                     # Everything the browser loads (static files, no build step)
│   ├── index.html           # The hub: one card per game
│   ├── assets/              # Hub-only CSS and JS
│   ├── shared/              # Used by the hub and every game
│   │   ├── theme.css        #   house style: colors, fonts, cards, buttons
│   │   ├── registry.js      #   the list of games shown on the hub
│   │   ├── random.js        #   seeded randomness (same puzzle for everyone)
│   │   ├── daily.js         #   date keys, puzzle numbers, countdown
│   │   ├── storage.js       #   per-browser results and streaks
│   │   ├── api.js           #   optional calls to the backend
│   │   └── confetti.js
│   └── games/
│       └── middleman/
│           ├── index.html, style.css, main.js   # UI
│           └── core/                            # Rules and data, shared with the API
│               ├── catalog.js                   #   every answer and its value
│               └── puzzle.js                    #   daily puzzle, scoring, search
├── api/                     # Backend (Cloudflare Worker)
│   ├── src/
│   │   ├── index.js         # Router
│   │   ├── plays.js         # Submit a play, read a day's stats (game-agnostic)
│   │   ├── games/           # One module per game: validates answers, computes the score
│   │   └── lib/             # HTTP and date helpers
│   └── migrations/          # D1 (SQLite) schema
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

**Changing a game's catalog** (for example `web/games/middleman/core/catalog.js`) changes the puzzles for every date, including today. Deploy those edits right after midnight.
