# API reference

Base path: `/api`. All bodies are JSON. Errors look like `{ "error": "Human-readable message" }`.

### `GET /api/health`
`200 { "ok": true }`

### `GET /api/games`
Games the API knows about. `200 { "games": ["middleman", "orbit", "pegs", "pins", "skip", "spot", "stakes"] }`

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
| | Spot: `{ "ticks": [129, 45, 100, 74, 61], "assist": false }`, the tick each of the five kicks was taken on. |
| | Skip: `{ "throws": [[47], [50, 103, 167], []], "assist": false }`, for each of the three stones the tick of every tap after the throw. |
| | Pegs: `{ "drops": [39, 2, 24], "assist": false }`, the launcher tick each ball was dropped on. |
| | Stakes: `{ "plays": [{ "bet": 25, "pick": "red" }, { "bet": 19, "moves": "HS" }, { "bet": 24, "pick": "banker" }, { "bet": 18, "play": true }, { "bet": 9, "pick": "pass" }] }`, one bet and choice per table played (fewer than five only if the bankroll hit zero). |

Responses:
- `201 { "score": 412, "rank": { "players": 120, "betterThan": 64 } }`
- `409 { "alreadyPlayed": true, "score": 412, "rank": {…} }`: this browser already played today. The first play is kept.
- `400` for invalid input, `404` for an unknown game.

`betterThan` is the percentage of *other* players today with a lower score.

Orbit's score is `6 − jumps used` for reaching the goal (so 5 is a one-jump win) and `0` for running out of jumps. Pins is the bowling score out of 90, Spot the goals out of 5, Skip the best stone's skips out of 30. Pegs is yellow pegs cleared (out of 10) plus 2 for each ball left over when all are cleared. Stakes is the final bankroll, starting from 100; its score chart tops out at 1000 but bigger wins are possible.

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
