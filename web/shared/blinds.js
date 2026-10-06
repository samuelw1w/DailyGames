// Blinds: the transition from one game to the next. Leaving a game for another, a stack of
// horizontal slats closes over it from the top down in the next game's own colour, and the next
// game opens the same way. Every other page change (the hub, Friends, Plus) is a plain one.
// A plain script (not a module) loaded in <head>, so a page being arrived at is covered before
// it first paints. Every page works the same without it.
(() => {
  // ---- the feel ----
  const SLATS = 12;        // horizontal strips
  const CLOSE_MS = 340;    // one slat closing
  const OPEN_MS = 440;     // one slat opening
  const STAGGER_MS = 22;   // delay between neighbouring slats
  const JITTER_MS = 50;    // random extra delay per slat, for the uneven look
  const EASE_IN = "cubic-bezier(0.7, 0, 0.84, 0)";
  const EASE_OUT = "cubic-bezier(0.16, 1, 0.3, 1)";
  const KEY = "dg.blinds"; // sessionStorage: { color, at } while going from one page to the next

  const root = document.documentElement;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || !root.animate) return;

  // Arriving from a page that closed its blinds: stay covered (CSS) until the slats take over.
  let arriving = null;
  try {
    arriving = JSON.parse(sessionStorage.getItem(KEY));
    sessionStorage.removeItem(KEY);
  } catch { /* storage unavailable */ }
  if (arriving && Date.now() - arriving.at < 4000) {
    root.style.setProperty("--blinds", arriving.color);
    root.classList.add("dg-covered");
  } else arriving = null;

  let slats = [];
  function build(color) {
    if (!slats.length) {
      const el = document.createElement("div");
      el.className = "dg-blinds";
      el.setAttribute("aria-hidden", "true");
      slats = Array.from({ length: SLATS }, () => el.appendChild(document.createElement("i")));
      document.body.appendChild(el);
    }
    slats.forEach((s) => (s.style.background = color));
  }

  // Animations stand still in a hidden tab, so each run also ends on a timer: switching away
  // mid-transition never leaves a page covered or a link not followed.
  const run = (from, to, duration, easing, origin) => Promise.race([
    Promise.all(slats.map((s, i) => {
      s.style.transformOrigin = origin;
      return s.animate([{ transform: `scaleY(${from})` }, { transform: `scaleY(${to})` }],
        { duration, easing, delay: i * STAGGER_MS + Math.random() * JITTER_MS, fill: "both" }).finished;
    })),
    new Promise((done) => setTimeout(done, duration + SLATS * STAGGER_MS + JITTER_MS + 150)),
  ]);
  const reset = () => slats.forEach((s) => s.getAnimations().forEach((a) => a.cancel()));

  let busy = false;
  /** Close the blinds in `color`, then go to `url`. */
  async function go(url, color) {
    if (busy) return;
    busy = true;
    build(color);
    await run(0, 1, CLOSE_MS, EASE_IN, "top");
    try { sessionStorage.setItem(KEY, JSON.stringify({ color, at: Date.now() })); } catch { /* storage unavailable */ }
    location.href = url;
  }

  // Each game's colour by id, filled in by the page's scripts (shared/ui.js) from the registry.
  const gameColors = {};

  /** The game a path belongs to ("pins" for /games/pins/), or null. */
  const gameOf = (path) => /\/games\/([^/]+)\//.exec(path)?.[1] ?? null;

  // Links from one game to another close the blinds first. Everything else is left alone.
  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest?.("a[href]");
    if (!a || a.target || a.hasAttribute("download")) return;
    const url = new URL(a.href, location.href);
    const from = gameOf(location.pathname), to = gameOf(url.pathname);
    if (url.origin !== location.origin || !from || !to || from === to) return;
    e.preventDefault();
    go(url.href, gameColors[to] ?? getComputedStyle(a).getPropertyValue("--accent").trim());
  });

  // Coming back with the Back button can show this page as it was left, blinds closed: open them.
  addEventListener("pageshow", (e) => { if (e.persisted) { reset(); busy = false; } });

  if (arriving) {
    document.addEventListener("DOMContentLoaded", async () => {
      build(arriving.color);
      root.classList.remove("dg-covered");
      await run(1, 0, OPEN_MS, EASE_OUT, "bottom");
      reset();
    });
  }

  globalThis.dgBlinds = { setGameColors: (colors) => Object.assign(gameColors, colors) };
})();
