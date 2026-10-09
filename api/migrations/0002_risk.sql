-- Risk is dealt by the server: one row per player per day holds the hands dealt so far, so a
-- hand, once committed to, can't be dealt again or swapped for another table.
CREATE TABLE IF NOT EXISTS risk_runs (
  day        TEXT    NOT NULL,              -- player's local date, 'YYYY-MM-DD'
  client_id  TEXT    NOT NULL,              -- anonymous per-browser ID
  base       INTEGER NOT NULL,              -- the day's score being played for, from the 'series' play
  state      TEXT    NOT NULL,              -- JSON: { hands: [...], open: null | { blackjack hand in play }, done }
  version    INTEGER NOT NULL DEFAULT 0,    -- bumped on every change, so two requests can't both deal the same hand
  updated_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (day, client_id)
);
