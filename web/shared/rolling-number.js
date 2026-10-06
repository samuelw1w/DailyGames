/**
 * RollingNumber — an odometer-style animated number, no dependencies.
 *
 *   import { RollingNumber } from "./rolling-number.js";
 *   const n = new RollingNumber(document.querySelector("#total"), { value: 0 });
 *   n.set(1284);              // rolls each digit to its new place
 *
 * Each digit is a vertical strip of 0–9 that springs to the new value.
 * When the number goes up, digits roll upward; when it goes down, downward.
 * New leading digits fade and grow in; dropped ones fade and shrink out.
 * Values can change mid-animation — the springs retarget smoothly.
 */
export class RollingNumber {
  constructor(el, opts = {}) {
    this.el = el;
    this.opts = {
      value: 0,
      // Spring feel. Lower damping = more bounce, higher stiffness = faster.
      stiffness: 140,
      damping: 21,
      mass: 1,
      // Any Intl.NumberFormat options, e.g. { style: "currency", currency: "USD" }
      format: { maximumFractionDigits: 0 },
      locale: undefined,
      ...opts,
    };
    this.fmt = new Intl.NumberFormat(this.opts.locale, this.opts.format);
    this.slots = new Map(); // key = position from the right
    this.value = null;
    this._raf = null;
    this._tick = this._tick.bind(this);

    el.classList.add("rn");
    el.setAttribute("role", "img");
    this.reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.set(this.opts.value, { instant: true });
  }

  set(value, { instant = false } = {}) {
    const prev = this.value;
    this.value = value;
    const text = this.fmt.format(value);
    this.el.setAttribute("aria-label", text);
    const dir = prev === null || value >= prev ? 1 : -1;
    const snap = instant || this.reduceMotion;

    const chars = [...text].reverse(); // index 0 = rightmost character
    const seen = new Set();

    chars.forEach((ch, key) => {
      seen.add(key);
      const isDigit = /\d/.test(ch);
      let slot = this.slots.get(key);

      // Character type changed at this position (e.g. digit ↔ comma): replace it
      if (slot && (slot.isDigit !== isDigit || (!isDigit && slot.ch !== ch))) {
        this._remove(key, slot, true);
        slot = null;
      }
      if (!slot) {
        slot = isDigit ? this._makeDigit(snap ? +ch : 0) : this._makeSymbol(ch);
        this.slots.set(key, slot);
        this._insert(key, slot, snap);
      }
      if (isDigit) this._target(slot, +ch, dir, snap);
    });

    // Positions no longer used (e.g. 1,000 → 999)
    for (const [key, slot] of this.slots) {
      if (!seen.has(key)) this._remove(key, slot, snap);
    }
    if (!snap) this._start();
  }

  /* ---------- building ---------- */

  _makeDigit(start) {
    const el = document.createElement("span");
    el.className = "rn-slot";
    el.setAttribute("aria-hidden", "true");
    const strip = document.createElement("span");
    strip.className = "rn-strip";
    // Three runs of 0–9 so a digit always has neighbours above and below
    for (let r = 0; r < 3; r++) for (let d = 0; d < 10; d++) {
      const s = document.createElement("span");
      s.textContent = d;
      strip.appendChild(s);
    }
    el.appendChild(strip);
    const slot = { el, strip, isDigit: true, pos: start, vel: 0, goal: start };
    this._paint(slot);
    return slot;
  }

  _makeSymbol(ch) {
    const el = document.createElement("span");
    el.className = "rn-slot rn-symbol";
    el.setAttribute("aria-hidden", "true");
    el.textContent = ch;
    return { el, ch, isDigit: false };
  }

  _insert(key, slot, snap) {
    // Keep DOM order left→right: insert before the slot with the next lower key
    let before = null;
    for (let k = key - 1; k >= 0; k--) {
      const s = this.slots.get(k);
      if (s && s.el.parentNode === this.el) { before = s.el; break; }
    }
    this.el.insertBefore(slot.el, before);
    if (snap) return;
    // Grow in from zero width
    const w = slot.el.getBoundingClientRect().width;
    slot.el.animate(
      [{ width: "0px", opacity: 0 }, { width: w + "px", opacity: 1 }],
      { duration: 450, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }
    );
  }

  _remove(key, slot, snap) {
    this.slots.delete(key);
    if (snap) { slot.el.remove(); return; }
    slot.dead = true;
    const w = slot.el.getBoundingClientRect().width;
    slot.el.animate(
      [{ width: w + "px", opacity: 1 }, { width: "0px", opacity: 0 }],
      { duration: 380, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "forwards" }
    ).finished.then(() => slot.el.remove());
  }

  /* ---------- motion ---------- */

  _target(slot, digit, dir, snap) {
    const current = ((Math.round(slot.goal) % 10) + 10) % 10;
    // Roll forward when counting up, backward when counting down
    const steps = dir > 0 ? (digit - current + 10) % 10 : -((current - digit + 10) % 10);
    slot.goal = Math.round(slot.goal) + steps;
    if (snap) { slot.pos = slot.goal; slot.vel = 0; this._paint(slot); }
  }

  _paint(slot) {
    // Wrap into the middle run of the strip; the strip repeats every 10
    const p = (((slot.pos % 10) + 10) % 10) + 10;
    slot.strip.style.transform = `translateY(calc(${-p} * var(--rn-step, 1.35em)))`;
  }

  _start() {
    if (!this._raf) { this._last = performance.now(); this._raf = requestAnimationFrame(this._tick); }
  }

  _tick(now) {
    const dt = Math.min((now - this._last) / 1000, 1 / 30);
    this._last = now;
    const { stiffness: k, damping: c, mass: m } = this.opts;
    let moving = false;

    for (const slot of this.slots.values()) {
      if (!slot.isDigit) continue;
      // Two sub-steps keep the spring stable on slow frames
      for (let i = 0; i < 2; i++) {
        const h = dt / 2;
        const force = -k * (slot.pos - slot.goal) - c * slot.vel;
        slot.vel += (force / m) * h;
        slot.pos += slot.vel * h;
      }
      if (Math.abs(slot.pos - slot.goal) < 0.001 && Math.abs(slot.vel) < 0.01) {
        slot.pos = slot.goal; slot.vel = 0;
      } else moving = true;
      this._paint(slot);
    }
    this._raf = moving ? requestAnimationFrame(this._tick) : null;
  }
}
