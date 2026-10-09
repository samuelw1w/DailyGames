// Daily Hub Worker. Serves the API under /api/*; everything else is the static site in /web
// (Cloudflare serves those files directly, see wrangler.toml).
import { HttpError, json, corsHeaders, withHeaders } from "./lib/http.js";
import { GAMES } from "./games/index.js";
import { submitPlay, dayStats } from "./plays.js";
import { riskState, riskPlay, riskStop } from "./risk.js";
import { leaderboard } from "./leaderboard.js";

const routes = [
  ["GET", /^\/api\/health$/, () => json({ ok: true })],
  ["GET", /^\/api\/games$/, () => json({ games: [...GAMES.keys()] })],
  ["POST", /^\/api\/games\/([a-z0-9-]+)\/plays$/, (req, env, [game]) => submitPlay(req, env, game)],
  ["GET", /^\/api\/games\/([a-z0-9-]+)\/days\/([0-9-]+)\/stats$/, (req, env, [game, day]) => dayStats(req, env, game, day)],
  ["POST", /^\/api\/risk\/state$/, (req, env) => riskState(req, env)],
  ["POST", /^\/api\/risk\/play$/, (req, env) => riskPlay(req, env)],
  ["POST", /^\/api\/risk\/stop$/, (req, env) => riskStop(req, env)],
  ["GET", /^\/api\/leaderboard\/([0-9-]+)$/, (req, env, [day]) => leaderboard(req, env, day)],
];

export async function handleApi(request, env) {
  const cors = corsHeaders(request, env);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  const { pathname } = new URL(request.url);
  try {
    for (const [method, pattern, handler] of routes) {
      const m = pathname.match(pattern);
      if (!m) continue;
      if (request.method !== method) continue;
      return withHeaders(await handler(request, env, m.slice(1)), cors);
    }
    throw new HttpError(404, "Not found.");
  } catch (err) {
    if (err instanceof HttpError) return withHeaders(json({ error: err.message }, err.status), cors);
    console.error(err);
    return withHeaders(json({ error: "Something went wrong on our side." }, 500), cors);
  }
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith("/api/")) return handleApi(request, env);
    // Static files normally never reach the Worker; this covers anything Cloudflare didn't match.
    return env.ASSETS ? env.ASSETS.fetch(request) : new Response("Not found", { status: 404 });
  },
};
