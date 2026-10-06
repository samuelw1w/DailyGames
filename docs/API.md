# API reference

Base path: `/api`. All bodies are JSON. Errors look like `{ "error": "Human-readable message" }`.

### `GET /api/health`
`200 { "ok": true }`

### `GET /api/games`
Games the API knows about. `200 { "games": ["close", "hole", "house", "jot", "link", "middleman", "orbit", "pins", "skip", "stop", "year"] }`

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
| | Risk (id `house`): `{ "start": 638, "plays": [{ "table": "roulette", "pick": "red" }, { "table": "blackjack", "moves": "HS" }, { "table": "craps", "pick": "pass" }] }`. One to five hands in the order played; the player may stop after any of them. Each names its table and the side taken: roulette `red`, `black`, `odd`, `even`, `low`, `high`; sic bo `small`, `big`; baccarat `player`, `banker`; craps `pass`, `dont`; blackjack sends `moves` (H and S) instead. `start` (1 to 1000) is the day's Series points; the server can check every hand but not that number. |

Responses:
- `201 { "score": 412, "rank": { "players": 120, "betterThan": 64 } }`
- `409 { "alreadyPlayed": true, "score": 412, "rank": {…} }`: this browser already played today. The first play is kept.
- `400` for invalid input, `404` for an unknown game.

`betterThan` is the percentage of *other* players today with a lower score.

Orbit's score is `6 − jumps used` for reaching the goal (so 5 is a one-jump win) and `0` for running out of jumps. Pins is the bowling score out of 90 and Skip the best stone's skips out of 30. Stop, Year, Close, Jot and Link score 0 to 100 directly. Hole scores 4 for par, one more for each stroke under and one fewer for each over (0 to 8). Risk is `start` times the multiplier (1.0× plus or minus 0.2× per hand), so 0 to 2,000.

### `GET /api/games/:game/days/:day/stats[?score=N]`
Crowd stats for a day. Future dates return `400`, so nobody can preview tomorrow's answers.

```json
{
  "game": "middleman",
  "day": "2026-10-05",
  "players": 120,
  "averageScore": 301,
  "histogram": [2, 3, 5, 9, 14, 22, 25, 21, 13, 6],
  "rounds": [
    { "round": 0, "total": 118, "top": [{ "answer": "beagle", "n": 31 }, { "answer": "otter", "n": 12 }] }
  ],
  "rank": { "players": 120, "betterThan": 64 }
}
```

- `histogram`: 10 equal score buckets from 0 to the game's max score.
- `rounds[].top`: the 5 most-picked answers. `total` counts all picks for that round (timeouts excluded). For Orbit a round is a jump and the answer is how it went: `hop`, `miss` or `goal`.
- `rank`: only when `?score=` is given.
- Cached for 30 seconds.
