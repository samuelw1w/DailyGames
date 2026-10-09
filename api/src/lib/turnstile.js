// Cloudflare Turnstile: proof that a browser, not a script, sent the day's series. The page gets
// a token from an invisible widget (web/shared/human.js) and the server checks it here.
// https://developers.cloudflare.com/turnstile/get-started/server-side-validation/

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
let warned = false;

/**
 * Did `token` pass Turnstile? True when no TURNSTILE_SECRET is set (local dev, tests), so a
 * deploy without the secret is unguarded: see "Before the next deploy" in TASKS.md. If
 * Cloudflare can't be reached, the play is let through rather than hidden: a script can't
 * cause that outage, and real players shouldn't pay for it.
 */
export async function isHuman(token, request, env) {
  if (!env.TURNSTILE_SECRET) {
    if (!warned) console.warn("TURNSTILE_SECRET isn't set: series plays aren't checked for a human.");
    warned = true;
    return true;
  }
  if (typeof token !== "string" || !token || token.length > 2048) return false;
  const form = new FormData();
  form.append("secret", env.TURNSTILE_SECRET);
  form.append("response", token);
  const ip = request.headers.get("cf-connecting-ip");
  if (ip) form.append("remoteip", ip);
  try {
    const res = await fetch(VERIFY_URL, { method: "POST", body: form });
    if (!res.ok) throw new Error(`siteverify answered ${res.status}`);
    return (await res.json()).success === true;
  } catch (err) {
    console.error("Turnstile check failed, letting the play through:", err);
    return true;
  }
}
