# Architecture

## The pieces

```
 Browser                                   Cloudflare (one Worker)
 ───────                                   ───────────────────────
 web/index.html (hub)          ──GET──▶    static files from web/
 web/games/<game>/             ──GET──▶    static files from web/
   main.js ─┐
            ├─ core/ (rules)   ◀── same file imported by ──┐
            └─ shared/api.js   ──/api/*──▶  api/src/index.js │
                                              plays.js       │
                                              games/<game>.js┘
                                              D1 database (plays, picks)
```

### Rules live in one place
Each game keeps its rules and data in `web/games/<game>/core/`. That folder has no DOM, storage or network code, so:

- the browser imports it to build today's puzzle and score answers instantly, and
- the API imports the **same file** (`api/src/games/<game>.js`) to rebuild the puzzle for a date and rescore what the player sent.

The client never sends a score. It sends its answers, and the server works out the score, so a tampered client can't post 500/500. For Orbit the "answers" are the ticks at which the player tapped: the physics runs in fixed ticks with no engine-dependent maths, so the server replays the taps and gets the exact same flight.

### Daily puzzles without a server
`shared/random.js` turns a string like `"middleman:2026-10-05"` into a seeded random sequence. Every device generates the same puzzle for the same date without asking a server, and the game works offline.

The date is the player's **local** date (`shared/daily.js`), so the puzzle flips at their own midnight. The API accepts plays for any date that is "today" somewhere on Earth (UTC −1 day to +1 day).

### Storage
- **In the browser** (`shared/storage.js`): each game's daily results, history and streak, under keys like `dg.v1.middleman.day.2026-10-05`. Plus one anonymous `clientId` per browser.
- **On the server** (`api/migrations/`):
  - `plays`: one row per finished daily game: game, day, clientId, server-computed score, and JSON detail. `UNIQUE (game, day, client_id)` means one play per browser per day; the first result counts.
  - `picks`: a running count of each answer per round, so "most picked" is one indexed read.
  - `risk_runs`: one row per player per day for Risk: the hands dealt so far, so a hand is dealt once and only after the player commits to it.

### The day's score, and Risk
The day's score (0 to 600) is posted as the `series` game with only the lineup; the server adds up the plays it already holds (`web/shared/scoring.js` turns each game's server score into 0 to 100). That score feeds the bell curve, the leaderboards, and Risk's starting points.

Risk is the one game the browser can't deal: its hands would be readable in the JS and the same for everyone. `api/src/risk.js` deals each hand from an HMAC of the day and client id under the `RISK_SECRET` secret, after the player has chosen a table and side, and stores it in `risk_runs`. Practice tables still deal in the browser from a random seed.

Both tables are keyed by `game`, so new games need no schema changes.

### Hosting
`wrangler.toml` points `[assets]` at `web/`. Cloudflare serves those files directly from its edge, which is free and doesn't count as Worker requests. Only `/api/*` runs Worker code. Site and API share an origin, so no CORS setup is needed. If you ever host the site elsewhere, set `ALLOWED_ORIGINS` and add `<meta name="dg-api" content="https://your-api">` to the pages.

## Known limits and next steps
- **One play per browser, not per person.** Clearing storage or using another browser allows another play. Good enough for crowd stats. Accounts would fix it if leaderboards are added.
- **No rate limiting yet.** Before promoting the site widely, add Cloudflare's rate-limiting rules on `/api/*/plays`, or [Turnstile](https://developers.cloudflare.com/turnstile/) on submit.
- **Streaks are per browser.** Cross-device streaks need accounts.
- **Catalog edits change puzzles.** Puzzles are derived from the catalog, so editing it changes every date's puzzle, past days included. If stable history matters later, store each day's generated puzzle in D1 the first time it's requested.
