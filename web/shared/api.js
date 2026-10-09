// Thin client for the Daily Hub API (api/ folder). Every call is optional:
// if the API is unreachable (offline, static hosting, local file), functions resolve
// to null and games carry on without the social features.

// Same-origin by default. To point at a separate API host, add to the page:
//   <meta name="dg-api" content="https://api.example.com">
const BASE = (globalThis.document?.querySelector('meta[name="dg-api"]')?.content || "").replace(/\/$/, "");
const TIMEOUT_MS = 6000;

/** Make a request: { status, body }, with status 0 when the API couldn't be reached. */
async function request(path, init = {}) {
  if (location.protocol === "file:") return { status: 0, body: null };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}/api${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: { "content-type": "application/json", ...(init.headers || {}) },
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  } catch {
    return { status: 0, body: null };
  } finally {
    clearTimeout(t);
  }
}

async function call(path, init = {}) {
  const { status, body } = await request(path, init);
  return (status >= 200 && status < 300) || status === 409 ? body : null;
}

/** Record a finished daily play. Returns { score, rank } or null. `extra` adds fields to the body (the series' `human` token). */
export const submitPlay = (game, day, clientId, answers, extra = {}) =>
  call(`/games/${encodeURIComponent(game)}/plays`, {
    method: "POST",
    body: JSON.stringify({ day, clientId, answers, ...extra }),
  });

/** Crowd stats for a day: players, score histogram, top answers per round.
 *  Pass `score` to also get how that score ranks against everyone else, and `clientId`
 *  so this browser's own stored play isn't counted among them. */
export function getStats(game, day, score, clientId) {
  const q = new URLSearchParams();
  if (score != null) q.set("score", String(Number(score)));
  if (score != null && clientId) q.set("clientId", clientId);
  return call(`/games/${encodeURIComponent(game)}/days/${encodeURIComponent(day)}/stats${String(q) ? `?${q}` : ""}`);
}

/**
 * Risk, dealt by the server. `action` is "state", "play" or "stop"; `extra` is the hand
 * ({ table, pick } or { table: "blackjack", move }). Resolves to { status, body }: the run on
 * success, { error } otherwise, and status 0 when the API couldn't be reached.
 */
export const risk = (action, day, clientId, extra = {}) =>
  request(`/risk/${action}`, { method: "POST", body: JSON.stringify({ day, clientId, ...extra }) });

/** The leaderboard for everyone: the best day's scores for `day`, or over the week to it (`scope` "week"). */
export const getLeaderboard = (day, clientId, scope = "day") =>
  call(`/leaderboard/${encodeURIComponent(day)}${scope === "week" ? "?scope=week" : ""}`, { headers: { "x-client-id": clientId } });
