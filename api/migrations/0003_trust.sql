-- Plays that look automated (no Turnstile pass, or a day finished faster than anyone could play
-- it) are still stored and scored, so Risk and the player's own view work as usual, but they
-- are left out of what everyone else sees: the leaderboards, the bell curve and the picks.
-- Why a play was hidden is kept in its detail JSON, under "flags".
ALTER TABLE plays ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0;
