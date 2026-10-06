/**
 * ScoreRing — animated circular score (0–100), no dependencies.
 *
 *   import { ScoreRing } from "./score-ring.js";
 *   const ring = new ScoreRing(document.querySelector("#score"));
 *   ring.play(87);            // ring fills to 87%, number counts up and sharpens
 *
 * Colours come from CSS custom properties on the element (or any parent),
 * so each game can theme it:
 *   --ring-color   the progress arc and final number colour
 *   --ring-track   the empty track behind it
 */
export class ScoreRing {
  constructor(el, opts = {}) {
    this.el = el;
    this.opts = {
      max: 100,
      duration: 2200,           // ms for the full fill to `max`
      minDuration: 900,         // low scores still get a satisfying beat
      easing: [0.45, 0, 0.2, 1],// cubic-bezier for the fill
      stroke: 8,                // ring thickness (in a 100×100 viewBox)
      blur: 6,                  // starting blur on the number, in px
      ...opts,
    };
    this._ease = ScoreRing.bezier(...this.opts.easing);
    this.reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this._build();
    this._render(0);
  }

  _build() {
    const r = 50 - this.opts.stroke / 2;
    this.circ = 2 * Math.PI * r;
    this.el.classList.add("score-ring");
    this.el.setAttribute("role", "img");
    this.el.innerHTML = `
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle class="score-ring-track" cx="50" cy="50" r="${r}" stroke-width="${this.opts.stroke}" />
        <circle class="score-ring-arc" cx="50" cy="50" r="${r}" stroke-width="${this.opts.stroke}"
                stroke-dasharray="${this.circ}" stroke-dashoffset="${this.circ}" />
      </svg>
      <span class="score-ring-value" aria-hidden="true">0</span>`;
    this.arc = this.el.querySelector(".score-ring-arc");
    this.label = this.el.querySelector(".score-ring-value");
  }

  /** Animate from 0 to `score`. Returns a promise that resolves when done. */
  play(score) {
    const { max, duration, minDuration } = this.opts;
    score = Math.max(0, Math.min(max, score));
    this.el.setAttribute("aria-label", `Score: ${Math.round(score)} out of ${max}`);
    cancelAnimationFrame(this._raf);

    if (this.reduceMotion) { this._render(score); return Promise.resolve(); }

    // Duration scales with the score, so 40 doesn't crawl and 100 doesn't rush
    const ms = Math.max(minDuration, duration * (score / max));
    const start = performance.now();
    this._render(0);

    return new Promise((resolve) => {
      const tick = (now) => {
        const t = Math.min(1, (now - start) / ms);
        this._render(score * this._ease(t), t);
        if (t < 1) this._raf = requestAnimationFrame(tick);
        else { this.el.classList.add("is-done"); resolve(); }
      };
      this.el.classList.remove("is-done");
      this._raf = requestAnimationFrame(tick);
    });
  }

  /** Jump straight to a score without animating. */
  set(score) { cancelAnimationFrame(this._raf); this._render(score); this.el.classList.add("is-done"); }

  _render(value, t = 1) {
    const frac = value / this.opts.max;
    this.arc.style.strokeDashoffset = this.circ * (1 - frac);
    // Hide the round cap dot when the score is exactly 0
    this.arc.style.opacity = value <= 0.01 ? 0 : 1;
    this.label.textContent = Math.round(value);
    // The number starts soft and dim, then sharpens into the theme colour
    const settle = this._ease(t);
    this.el.style.setProperty("--ring-settle", settle);
    this.label.style.filter = `blur(${(1 - settle) * this.opts.blur}px)`;
  }

  /** Standard cubic-bezier easing, same curve shape as CSS. */
  static bezier(x1, y1, x2, y2) {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const x = (t) => ((ax * t + bx) * t + cx) * t;
    const y = (t) => ((ay * t + by) * t + cy) * t;
    const dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
    return (p) => {
      if (p <= 0) return 0;
      if (p >= 1) return 1;
      let t = p;
      for (let i = 0; i < 6; i++) {
        const d = dx(t);
        if (Math.abs(d) < 1e-6) break;
        t -= (x(t) - p) / d;
      }
      return y(Math.min(1, Math.max(0, t)));
    };
  }
}
