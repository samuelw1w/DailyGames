/**
 * BellCurve: where a score sits among everyone's, as an animated bell curve. No dependencies.
 *
 *   import { bellCurve } from "./bell-curve.js";
 *   bellCurve(el, { mean: 388, spread: 92, histogram: [...10 counts], max: 600, score: 432, betterThan: 64, players: 1203 });
 *
 * The curve is a normal curve with the day's average and spread; the day's real scores sit
 * behind it as faint bars (same scale), so a lopsided day still shows honestly. The part of
 * the curve below the player's score fills in from the left, the marker drops onto it, and
 * the "you beat" figure counts up. Colours come from the theme tokens; reduced motion skips
 * the animation.
 */
import { RollingNumber } from "./rolling-number.js";

const W = 320, H = 140, BASE = 112, TOP = 30; // drawing box: the curve lives between TOP and BASE; the label sits above TOP
const fmt = (n) => n.toLocaleString("en-US");

export function bellCurve(el, { mean, spread, histogram = [], max, score, betterThan, players }) {
  // A spread of almost nothing (a handful of players) would draw a spike; keep it a curve.
  const sd = Math.max(spread || 0, max * 0.06);
  const pdf = (v) => Math.exp(-0.5 * ((v - mean) / sd) ** 2) / (sd * Math.sqrt(2 * Math.PI));
  const width = max / (histogram.length || 1);
  const density = histogram.map((n) => (players ? n / (players * width) : 0));
  const peak = Math.max(pdf(mean), ...density) || 1;
  const x = (v) => (Math.max(0, Math.min(max, v)) / max) * W;
  const y = (d) => BASE - (d / peak) * (BASE - TOP);

  const steps = 96;
  const pts = Array.from({ length: steps + 1 }, (_, i) => { const v = (i / steps) * max; return [x(v), y(pdf(v))]; });
  const line = pts.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)} ${py.toFixed(1)}`).join(" ");
  const area = `${line} L${W} ${BASE} L0 ${BASE} Z`;
  const bars = density.map((d, i) => `<rect x="${(x(i * width) + 1).toFixed(1)}" y="${y(d).toFixed(1)}" width="${(x(width) - 2).toFixed(1)}" height="${(BASE - y(d)).toFixed(1)}" rx="2"/>`).join("");
  const sx = x(score), sy = y(pdf(score));
  const id = `bc${Math.random().toString(36).slice(2, 8)}`;

  el.classList.add("bell");
  el.innerHTML = `
    <p class="bell-head">You beat <b class="bell-pct"></b> of ${fmt(players)} ${players === 1 ? "player" : "players"} today</p>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Today's scores: an average of ${fmt(Math.round(mean))} out of ${fmt(max)}. Yours, ${fmt(score)}, beat ${betterThan}% of players.">
      <defs><clipPath id="${id}"><rect class="bell-sweep" x="0" y="0" width="${sx.toFixed(1)}" height="${H}"/></clipPath></defs>
      <g class="bell-bars">${bars}</g>
      <path class="bell-area" d="${area}"/>
      <path class="bell-below" d="${area}" clip-path="url(#${id})"/>
      <path class="bell-line" d="${line}" pathLength="1"/>
      <line class="bell-axis" x1="0" x2="${W}" y1="${BASE}" y2="${BASE}"/>
      <g class="bell-mean"><line x1="${x(mean).toFixed(1)}" x2="${x(mean).toFixed(1)}" y1="${y(pdf(mean)).toFixed(1)}" y2="${BASE}"/></g>
      <g class="bell-you" style="--x:${sx.toFixed(1)}px">
        <line class="bell-stem" x1="${sx.toFixed(1)}" x2="${sx.toFixed(1)}" y1="17" y2="${(sy - 6).toFixed(1)}"/>
        <line x1="${sx.toFixed(1)}" x2="${sx.toFixed(1)}" y1="${sy.toFixed(1)}" y2="${BASE}"/>
        <circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="4.5"/>
        <text x="${sx.toFixed(1)}" y="11" text-anchor="${sx < 40 ? "start" : sx > W - 40 ? "end" : "middle"}">You · ${fmt(score)}</text>
      </g>
      <g class="bell-ticks">
        <text x="0" y="${H - 6}">0</text>
        <text x="${(W / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle">${fmt(Math.round(max / 2))}</text>
        <text x="${W}" y="${H - 6}" text-anchor="end">${fmt(max)}</text>
      </g>
    </svg>
    <p class="bell-foot">The average today is <b>${fmt(Math.round(mean))}</b>.</p>`;

  const pct = new RollingNumber(el.querySelector(".bell-pct"), { value: 0, format: { maximumFractionDigits: 0 } });
  el.querySelector(".bell-pct").insertAdjacentText("beforeend", "%");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) { el.classList.add("bell-in"); pct.set(betterThan, { instant: true }); return; }
  // Start drawing once it's on screen, so the animation isn't spent below the fold.
  const go = () => { el.classList.add("bell-in"); setTimeout(() => pct.set(betterThan), 650); };
  if (!("IntersectionObserver" in globalThis)) return go();
  const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) { io.disconnect(); requestAnimationFrame(go); } }, { threshold: 0.4 });
  io.observe(el);
}
