// A Cloudflare Turnstile token for the day's series submit, so the server can tell a browser
// from a script (api/src/lib/turnstile.js). The widget is invisible and never blocks: without
// a token the day still counts for the player, it just doesn't appear on the public boards.

// The site key from Cloudflare's dashboard (Turnstile → the widget, in Invisible mode). Public.
const SITE_KEY = "";
// Cloudflare's test key that always passes, for wrangler dev on localhost.
const TEST_SITE_KEY = "1x00000000000000000000AA";
const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=dgTurnstileReady";
const TIMEOUT_MS = 8000;

const local = () => ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);

let loading = null;
function loadTurnstile() {
  if (globalThis.turnstile) return Promise.resolve(globalThis.turnstile);
  loading ??= new Promise((resolve, reject) => {
    globalThis.dgTurnstileReady = () => resolve(globalThis.turnstile);
    const s = document.createElement("script");
    s.src = SCRIPT;
    s.onerror = () => { loading = null; s.remove(); reject(new Error("Turnstile didn't load")); };
    document.head.append(s);
  });
  return loading;
}

/** A fresh, single-use token, or null if Turnstile is off, blocked or too slow. Never throws. */
export async function humanToken() {
  const sitekey = local() ? TEST_SITE_KEY : SITE_KEY;
  if (!sitekey || location.protocol === "file:") return null;
  const box = document.createElement("div");
  box.style.cssText = "position:fixed;width:0;height:0;overflow:hidden";
  document.body.append(box);
  let id = null, timer;
  const deadline = new Promise((resolve) => { timer = setTimeout(() => resolve(null), TIMEOUT_MS); });
  const token = loadTurnstile().then((ts) => new Promise((resolve) => {
    id = ts.render(box, {
      sitekey,
      action: "series",
      callback: (t) => resolve(t),
      "error-callback": () => resolve(null),
      "timeout-callback": () => resolve(null),
    });
  }));
  try {
    return await Promise.race([token, deadline]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    if (id != null) try { globalThis.turnstile.remove(id); } catch { /* already gone */ }
    box.remove();
  }
}
