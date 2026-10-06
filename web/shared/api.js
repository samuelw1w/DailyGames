// Thin client for the Daily Hub API (api/ folder). Every call is optional:
// if the API is unreachable (offline, static hosting, local file), functions resolve
// to null and games carry on without the social features.

// Same-origin by default. To point at a separate API host, add to the page:
//   <meta name="dg-api" content="https://api.example.com">
const BASE = (globalThis.document?.querySelector('meta[name="dg-api"]')?.content || "").replace(/\/$/, "");
const TIMEOUT_MS = 6000;

async function call(path, init = {}) {
  if (location.protocol === "file:") return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}/api${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: { "content-type": "application/json", ...(init.headers || {}) },
    });
    const body = await res.json().catch(() => null);
    return res.ok || res.status === 409 ? body : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Record a finished daily play. Returns { score, rank } or null. */
export const submitPlay = (game, day, clientId, answers) =>
  call(`/games/${encodeURIComponent(game)}/plays`, {
    method: "POST",
    body: JSON.stringify({ day, clientId, answers }),
  });

/** Crowd stats for a day: players, score histogram, top answers per round.
 *  Pass `score` to also get how that score ranks against everyone else. */
export const getStats = (game, day, score) =>
  call(`/games/${encodeURIComponent(game)}/days/${encodeURIComponent(day)}/stats${score != null ? `?score=${Number(score)}` : ""}`);
