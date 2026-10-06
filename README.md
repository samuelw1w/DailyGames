# Daily Hub

A hub of small daily puzzle games. Everyone gets the same puzzles each day, and a new set unlocks at midnight in the player's own time zone.

## The Series

Every day is one series of ten games, played in order:

1. **Play**: five games of timing (Orbit, Pins, Skip, Hole, Stop).
2. **Know**: five games of knowing (Middleman, Year, Close, Jot, Link).
3. **Risk**: optional. Lock in your points, or risk them at the casino tables. You start at 1.0× and play up to five win-or-lose hands at any tables you like: each win adds 0.2×, each loss takes 0.2× away, and you can stop after any hand. So the day ends somewhere between nothing and double.

Every game is worth up to 100 points. Three games in each act are free; the other two (Skip, Hole, Close and Link) start locked, so a new player's day is six games and out of 600 before Risk. The hub's **Episodes** tab lists the games on their own; a game played there counts toward the day's series just the same. The order of the games and how each result becomes points live in [`web/shared/series.js`](web/shared/series.js).

### Points, unlocking and Plus
- **Points.** A finished day's score is banked. The total is shown at the top of the hub as points to spend, and it is what friends see as your all-time score.
- **Unlocking.** A locked game costs 20,000 points and stays open for good. Spending lowers the balance, never the all-time total.
- **Plus.** The Subscribe button leads to `web/plus/`. Plus opens every game (and any added later), removes the ad slots, and lets earlier days be played from a day stepper on the hub.

**Plus is a preview, not a product yet.** There are no accounts and no payments: `web/shared/account.js` keeps a Plus switch, the unlocked games and nothing else in the browser's storage, the price on the page is a placeholder, and the "ads" are empty slots. Anyone can turn Plus on for free. All of that needs a server before it can be sold.

| Game | Act | What it is |
| --- | --- | --- |
| Orbit | Play | A ship circles a planet. Tap to let go and sling it from planet to planet; reach the goal in five jumps. |
| Pins | Play | Three frames of bowling. One tap sets where the ball starts, a second sets its hook. Every ball has its own drift and a small random slip on release. |
| Skip | Play | Skip a stone. Tap each time it touches the water; every hop is a different length and height. |
| Hole | Play | One golf hole a day, side on. One tap locks the aim, a second the power; on the green it switches to a putting view. |
| Stop | Play | A needle sweeps a dial. Tap to stop it on the mark. Five rounds, each faster. |
| Middleman | Know | Name the thing halfway between two others by weight, speed, size, age or price. |
| Year | Know | What year was it invented or built? Three guesses, told earlier or later each time. |
| Close | Know | One estimate: how heavy, how fast, how big, how much. Three guesses to get close. |
| Jot | Know | Find a hidden five-letter word. Each guess is only told how many letters it shares. |
| Link | Know | Find the word that finishes one word and starts another (SUN ? HOUSE is LIGHT). Five a day. |
| Risk | Finale | Up to five win-or-lose hands at roulette, blackjack, sic bo, baccarat or craps. Even-money choices only; each hand moves your multiplier by 0.2×. Lives in `web/games/house/`. |

Each game lives in `web/games/<id>/`. Every result screen, and the hub once the day is finished, has a **Share** button: it opens a preview of the message and ways to send it. The message ends with the site's address, which is a placeholder (`SITE` in `web/shared/ui.js`) until there is a real one.

The hub's **Friends** page (`web/friends/`) is a mock-up: the friends and their scores are made up in `friends.js` so the page can be tried before accounts exist. Your own scores on it are real. Year and Close ask about the same catalog of things as Middleman, so there is one set of facts to keep right.

## How it's built

```
DailyGames/
├── web/                     # Everything the browser loads (static files, no build step)
│   ├── index.html           # The hub: one card per game
│   ├── assets/              # Hub-only CSS and JS
│   ├── shared/              # Used by the hub and every game
│   │   ├── theme.css        #   house style: dark page, quiet cards, one accent color per game
│   │   ├── registry.js      #   every game: name, color, act
│   │   ├── series.js        #   the day's order of play, how results become points, the points wallet
│   │   ├── account.js       #   Plus, unlocked games, which day is being played (browser-only for now)
│   │   ├── numbergame.js    #   the screen Year and Close share
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
│       ├── skip/                                # UI + core/sim.js (touches, timing windows)
│       ├── hole/                                # UI + core/sim.js (the day's hole, shots, putts)
│       └── house/                               # UI + core/tables.js (the five casino tables)
├── api/                     # Backend (Cloudflare Worker)
│   ├── src/
│   │   ├── index.js         # Router
│   │   ├── plays.js         # Submit a play, read a day's stats (game-agnostic)
│   │   ├── games/           # One module per game: validates answers, computes the score
│   │   └── lib/             # HTTP and date helpers
│   └── migrations/          # D1 (SQLite) schema
├── tools/                   # `npm run orbit:levels` rebuilds Orbit's level list
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

**Changing a game's catalog** (for example `web/games/middleman/core/catalog.js`) changes the puzzles for every date, including today. Deploy those edits right after midnight. The same goes for Orbit's physics (`web/games/orbit/core/sim.js`): after any change there, run `npm run orbit:levels` to rebuild the list of fair levels.
