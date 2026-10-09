# Tasks

The backlog from the October 2026 review. **Delete a task from this file once it's done.** Each task is written to stand on its own, so it can be picked up in a fresh chat.

## Context for a new chat

- Read `README.md` and `docs/ARCHITECTURE.md` first. `npm test` runs everything (node:test, a fake D1 in `tests/helpers/fake-d1.js`).
- **Score and points are separate.** The day's **score** is 0–600, the skill result. It is what gets shared, shown on the bell curve, ranked on the leaderboards and compared with friends. The server works it out from its own plays, via the `series` game. **Points** are what a day banks into the spendable balance: the score as it is, or after Risk (0×–2×). Risk never moves the score. See `web/shared/scoring.js` and `web/shared/series.js`.
- **Decisions already made:**
  - Players keep choosing 3 of 5 games per act. An act's lineup locks once any of its games has been played that day.
  - Past days (Plus) keep an archive score marked "played later". It is not ranked and not part of a streak, but its points still bank.
  - Risk is dealt by the server (`api/src/risk.js`, secret `RISK_SECRET`) and only on the current day.
- **No accounts yet.** Identity is a per-browser `clientId`, and the wallet, Plus and unlocks live in localStorage. Anything marked *needs accounts* waits for that.
- **Dev:** `npm run db:migrate:local`, put `RISK_SECRET="..."` in `.dev.vars`, then use the `dev` preview (`wrangler dev`, port 8787).

## Before the next deploy

- [ ] Run `npm run db:migrate` **before deploying**. It adds `risk_runs` (`0002_risk.sql`) and the `plays.hidden` column (`0003_trust.sql`), and the new Worker fails to save plays without that column.
- [ ] `npx wrangler secret put RISK_SECRET`. Without it, Risk answers 503.
- [ ] Turnstile: add a widget in **Invisible** mode for the site's domain in the Cloudflare dashboard, put its site key in `SITE_KEY` in `web/shared/human.js`, deploy, and only then `npx wrangler secret put TURNSTILE_SECRET`. With the secret but no site key, every day is hidden from the leaderboards. Without the secret, nothing is checked.
- [ ] Optional: clear the local dev seed data (80 fake `seed-player-*` rows) by deleting `.wrangler/state` and re-running `npm run db:migrate:local`.

## Now / before launch

### Measure how long a day takes (S)
Nothing records timing yet, so we can't decide whether the day is too long (six games plus Risk is a guess of 10–15 minutes).
- Have each game send `startedAt`/`finishedAt` (or a duration in ms) inside its `answers` → store it in `plays.detail`. The `series` submit could carry first-start and last-finish times.
- Write a D1 query (or a small admin endpoint) for the median time per game and per full day.
- Then decide: keep 3+3, or go to 2 per act plus a bonus game, or make Know optional.
- Also use the medians to tune `MIN_GAP_MS` and `MIN_GAME_MS` in `api/src/games/series.js`. They hide days finished faster than a person could play them, judged from when each play arrived (`plays.created_at`), and are set loosely for now.

### Whole-day streak, shown prominently (S)
`dayStreak()` in `series.js` already counts days with a game played on time, but the hub only shows it in its subtitle (`web/assets/hub.js`, `$("today")`). Result screens show per-game streaks (`web/shared/ui.js → resultScreen`, from `storage.js → stats()`).
- Decide whether a streak day needs the whole series finished or just any game.
- Show it big on the hub (a flame or count next to the score), and use the whole-day streak on result screens instead of the per-game one.
- Test: `tests/series-day.test.js`.

### Tomorrow teaser at the end of the day (S)
The hub only shows a countdown once the day is final (`hub.js`, `#cd`). Add a line like "Tomorrow: a par 5, Middleman by speed…".
- Build it from tomorrow's seeded puzzles (`dailyCourse`, `dailyRounds`, …), showing categories and shapes, never answers.
- The API's `isRevealed` doesn't block this, because the puzzles are built in the browser. Keep the teaser vague so answers can't be read from it.

### Crowd answers for the other Know games (M)
Middleman already shows what everyone picked (`web/games/middleman/main.js`, around `round.top`). The others don't:
- Year and Jot only send their first guess as a pick (`api/src/games/year.js`, `jot.js`).
- Close sends no picks (`close.js`).
- Link sends only solved or missed (`link.js`).

Steps:
- Decide what to show: the spread of Close guesses, the most common opening years and words, and the solve rate per Link pair.
- Add picks on the server, then a small "what everyone said" block in `web/shared/numbergame.js` and in the Jot and Link pages, using `getStats`.
- Test: extend `tests/series.test.js` or the per-game tests.

## Spending points (no accounts needed)

All of these need a **purchase record (ledger)** first: `account.js` only knows the unlocked games (`spentPoints()`). Add a general list of purchases `{ id, kind, cost, at }` and make `spentPoints()` add them all up. A typical day banks about 350–450 points, while unlocking a game costs 20,000, so keep these prices well below that.

- [ ] **Ledger** (S). Lives in `web/shared/account.js`. Test it in `tests/series-day.test.js` (it already stubs localStorage).
- [ ] **Streak freeze** (M), about 1,500 points, hold at most 2. A freeze is used up automatically on a missed day inside `dayStreak()`. Depends on the ledger.
- [ ] **Buy a single past day** (S–M), about 3,000 points, as a taste of Plus. `activeDay()` in `account.js` currently allows past days only for Plus; add owned days. Past days bank their points (a deliberate choice), so check the price against what a past day can bank: at most 600, since Risk isn't offered on past days.
- [ ] **Share flair** (S), about 1,000 points. An emoji set or title in `seriesShare()` (`series.js`).
- [ ] **Celebration styles** (S), about 2,000 points. Palettes and shapes in `web/shared/confetti.js`.
- [ ] **Hub themes** (M), 5,000–8,000 points. Override the `:root` tokens in `web/shared/theme.css` via `data-theme`. Games set their own `--accent`, so leave it alone.
- [ ] **Risk cosmetics** (M), 3,000–5,000 points. Felts, card backs and dice in `web/games/house/style.css` and `main.js`.
- [ ] **Canvas game skins** (L), 2,000–4,000 points. Orbit, Pins, Skip, Hole and Stop each have their own renderer in `main.js`.

## Retention

- [ ] **Rank tiers and achievements** (M). Base them on scores (say, total of on-time daily scores, or average), not points, so Risk luck and archive days don't count. Possible sources: `playedDays()`, `seriesState()`, `dayStreak()`.
- [ ] **Web push reminders when the new day unlocks** (M–L). Needs a service worker, a manifest, VAPID keys, a `push_subscriptions` table, and a scheduled Worker (cron) to send them. No accounts needed. On iOS, push only works when the site is installed to the home screen.

## After accounts exist

- [ ] **Accounts** themselves. Move Plus, unlocks, the wallet and the ledger to the server. Cross-device streaks.
- [ ] **Chosen display names**, replacing the generated ones in `web/shared/names.js`. Needs moderation.
- [ ] **Real Friends board.** Friend codes, side-by-side scores, "Alex beat you" nudges. Replace `friendDay()` in `web/friends/friends.js`.
- [ ] **Weekly leagues.** About 30 players, promotion and relegation, built on `series` plays.
- [ ] **Email reminders.**
- [ ] **Real Plus payments.** Once Plus costs money, past-day points can't be farmed for free anymore.
