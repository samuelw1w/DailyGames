# API reference

Base path: `/api`. All bodies are JSON. Errors look like `{ "error": "Human-readable message" }`.

### `GET /api/health`
`200 { "ok": true }`

### `GET /api/games`
Games the API knows about. `200 { "games": ["close", "hole", "house", "jot", "link", "middleman", "orbit", "pins", "series", "skip", "stop", "year"] }`

### `POST /api/games/:game/plays`
Record a finished daily game. Call this once, when the player finishes.

```json
{ "day": "2026-10-05", "clientId": "8f0c…", "answers": ["beagle", "average-us-home", null, "telescope", "lion"] }
```

| Field | Rule |
| --- | --- |
| `day` | `YYYY-MM-DD`, the player's local date. Must be "today" somewhere on Earth. |
| `clientId` | 8–64 chars of `A-Z a-z 0-9 -`. From `shared/storage.js → clientId()`. |
| `answers` | Game-specific. Middleman: one item ID per round, `null` if time ran out. Orbit: `{ "taps": [190, 501, 885], "assist": false }`, the physics tick of each launch (at most 5, increasing) and whether slow motion was used. The server replays the taps to get the result. |
| | Pins: `{ "balls": [[43, 37], [36, 55], …], "assist": false }`, for each ball the tick of the position tap and of the hook tap. |
| | Skip: `{ "throws": [[47], [50, 103, 167], []], "assist": false }`, for each of the three stones the tick of every tap after the throw. |
| | Hole: `{ "taps": [[68, 32], [40, 35], [54, 28]], "assist": false }`, for each swing or putt the tick of the aim tap and of the power tap. |
| | Stop: `{ "ticks": [48, 26, 8, 47, 21], "assist": false }`, the tick each round's needle was stopped on. |
| | Year: `{ "guesses": [1950, 1980, 1971] }`, up to three years in the order guessed. |
| | Close: `{ "guesses": [5, 1000, 30] }`, up to three estimates in the unit the question asked for. |
| | Jot: `{ "guesses": ["crane", "light", "until"] }`, up to eight five-letter guesses. |
| | Link: `{ "answers": [{ "guesses": ["rise", "fall"], "hint": true }, …] }`, one entry per pair. |
| | The day (id `series`): `{ "lineup": { "play": ["orbit", "pins", "stop"], "know": ["middleman", "year", "jot"] } }`, up to three different games from each act. The server adds up the plays it already holds for this client and day, each turned into 0 to 100 (`web/shared/scoring.js`), so every game in the lineup must have been posted first (`400` otherwise). This is the day's score: what the bell curve and the leaderboards use, and what Risk plays for. |
| | Risk (id `house`) can't be posted here (`400`): its hands are dealt by the server, see `/api/risk` below. |

Responses:
- `201 { "score": 412, "rank": { "players": 120, "betterThan": 64 } }`
- `409 { "alreadyPlayed": true, "score": 412, "rank": {…} }`: this browser already played today. The first play is kept.
- `400` for invalid input, `404` for an unknown game.

`betterThan` is the percentage of *other* players today with a lower score.

Orbit's score is `6 − jumps used` for reaching the goal (so 5 is a one-jump win) and `0` for running out of jumps. Pins is the bowling score out of 90 and Skip the best stone's skips out of 30. Stop, Year, Close, Jot and Link score 0 to 100 directly. Hole scores 4 for par, one more for each stroke under and one fewer for each over (0 to 8). The day (`series`) is 0 to 600. Risk's `house` play, recorded by the server when a run ends, is the points it made: the day's score times the multiplier (1.0× plus or minus 0.2× per hand), so 0 to 1,200.

### `GET /api/games/:game/days/:day/stats[?score=N]`
Crowd stats for a day. Future dates return `400`, so nobody can preview tomorrow's answers.

```json
{
  "game": "middleman",
  "day": "2026-10-05",
  "players": 120,
  "maxScore": 500,
  "averageScore": 301,
  "spread": 88,
  "histogram": [2, 3, 5, 9, 14, 22, 25, 21, 13, 6],
  "rounds": [
    { "round": 0, "total": 118, "top": [{ "answer": "beagle", "n": 31 }, { "answer": "otter", "n": 12 }] }
  ],
  "rank": { "players": 120, "betterThan": 64 }
}
```

- `histogram`: 10 equal score buckets from 0 to the game's max score (`maxScore`).
- `spread`: the standard deviation of the day's scores, with `averageScore` enough to draw a bell curve. For `series` this is the hub's curve.
- `rounds[].top`: the 5 most-picked answers. `total` counts all picks for that round (timeouts excluded). For Orbit a round is a jump and the answer is how it went: `hop`, `miss` or `goal`.
- `rank`: only when `?score=` is given.
- Cached for 30 seconds.

### `POST /api/risk/state` · `/api/risk/play` · `/api/risk/stop`
Risk, dealt by the server, one hand at a time. Every hand comes from a seed made from `RISK_SECRET`, the day and the client id, so each player gets their own hands and nobody can work one out in advance. A hand is only dealt once the player has committed to it, and a dealt hand can't be dealt again.

Every request is `{ "day": "2026-10-05", "clientId": "8f0c…" }`, plus for `play`:
- `{ "table": "roulette", "pick": "red" }`: roulette `red`, `black`, `odd`, `even`, `low`, `high`; sic bo `small`, `big`; baccarat `player`, `banker`; craps `pass`, `dont`. The hand is played out at once.
- `{ "table": "blackjack" }` deals a blackjack hand, then `{ "table": "blackjack", "move": "H" }` (hit) or `"S"` (stand) until it is settled. While it is open nothing else can be played.

Each answers with the day's run:

```json
{ "base": 457, "hands": [{ "table": "roulette", "pick": "red", "number": 32, "outcome": 1 }], "tenths": 12, "points": 548,
  "open": null, "done": false }
```

- `base`: the points being played for, taken from the day's `series` play (`409` until there is one).
- `hands`: every settled hand in full; `outcome` is 1 (won), 0 (push) or −1 (lost).
- `open`: a blackjack hand in play, `{ "moves": "H", "player": [...], "dealer": [up card], "total": 15 }`. The dealer's hole card isn't sent.
- `tenths` / `points`: the multiplier (10 is 1.0×) and `base` times it.
- `done`: after five hands, or `stop` (which needs at least one hand). The server then records a `house` play with the points.

`409` when the series isn't in yet, the run is over, or a blackjack hand must be finished first. `503` when the server has no `RISK_SECRET`.

### `GET /api/leaderboard/:day[?scope=week]`
The best day's scores (`series`, 0 to 600) for a day, or added up over the seven days ending on it. Players appear under a name made from their client id (`web/shared/names.js`, like "Swift Otter 42"); ids are never sent. Send the client id in an `x-client-id` header to have your row marked and your place returned.

```json
{ "day": "2026-10-08", "scope": "day", "from": "2026-10-08", "players": 81,
  "top": [{ "rank": 1, "name": "Steady Heron 28", "score": 600, "days": 1 }, …],
  "you": { "rank": 11, "name": "Proud Eagle 98", "score": 457, "days": 1 } }
```

`top` is the best twenty (ties go to whoever finished first). `you` is `null` without the header, and has a `null` rank and score if you haven't finished a day in the range.
