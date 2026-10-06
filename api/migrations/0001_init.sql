-- Daily Hub schema. Shared by every game; rows are keyed by (game, day).

-- One row per finished daily play. A browser (client_id) can play each game once per day.
CREATE TABLE IF NOT EXISTS plays (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  game       TEXT    NOT NULL,              -- e.g. 'middleman'
  day        TEXT    NOT NULL,              -- player's local date, 'YYYY-MM-DD'
  client_id  TEXT    NOT NULL,              -- anonymous per-browser ID
  score      INTEGER NOT NULL,              -- recomputed by the server, never trusted from the client
  detail     TEXT,                          -- JSON with game-specific data (e.g. per-round scores)
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (game, day, client_id)
);
CREATE INDEX IF NOT EXISTS plays_by_day ON plays (game, day, score);

-- Running tally of which answer people chose for each round, so "what did everyone pick"
-- is a cheap read. Games without per-round answers simply never write here.
CREATE TABLE IF NOT EXISTS picks (
  game   TEXT    NOT NULL,
  day    TEXT    NOT NULL,
  round  INTEGER NOT NULL,                  -- 0-based round index
  answer TEXT    NOT NULL,                  -- game-defined answer ID
  n      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (game, day, round, answer)
);
