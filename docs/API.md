# API reference

Base path: `/api`. All bodies are JSON. Errors look like `{ "error": "Human-readable message" }`.

### `GET /api/health`
`200 { "ok": true }`

### `GET /api/games`
Games the API knows about. `200 { "games": ["middleman"] }`

### `POST /api/games/:game/plays`
Record a finished daily game. Call this once, when the player finishes.

```json
{ "day": "2026-10-05", "clientId": "8f0c…", "answers": ["beagle", "average-us-home", null, "telescope", "lion"] }
```

| Field | Rule |
| --- | --- |
| `day` | `YYYY-MM-DD`, the player's local date. Must be "today" somewhere on Earth. |
| `clientId` | 8–64 chars of `A-Z a-z 0-9 -`. From `shared/storage.js → clientId()`. |
| `answers` | Game-specific. Middleman: one item ID per round, `null` if time ran out. |

Responses:
- `201 { "score": 412, "rank": { "players": 120, "betterThan": 64 } }`
- `409 { "alreadyPlayed": true, "score": 412, "rank": {…} }`: this browser already played today. The first play is kept.
- `400` for invalid input, `404` for an unknown game.

`betterThan` is the percentage of *other* players today with a lower score.

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
- `rounds[].top`: the 5 most-picked answers. `total` counts all picks for that round (timeouts excluded).
- `rank`: only when `?score=` is given.
- Cached for 30 seconds.
