// Full-screen confetti burst on a shared canvas. No-op when the player prefers reduced motion.
const COLORS = ["#F4F4F5", "#A78BFA", "#F59E4C", "#6FDC8C", "#5BB8F5"];
let canvas, ctx, parts = [], running = false;

export function confetti(count = 120) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.className = "dg-confetti";
    canvas.setAttribute("aria-hidden", "true");
    document.body.appendChild(canvas);
    ctx = canvas.getContext("2d");
  }
  const dpr = devicePixelRatio || 1;
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  for (let i = 0; i < count; i++) {
    parts.push({
      x: innerWidth / 2 + (Math.random() - 0.5) * 120, y: innerHeight * 0.45,
      vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 14 - 4,
      r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.4,
      w: 6 + Math.random() * 7, h: 4 + Math.random() * 5, c: COLORS[i % COLORS.length], life: 0,
    });
  }
  if (!running) {
    running = true;
    requestAnimationFrame(frame);
  }
}

function frame() {
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  parts = parts.filter((p) => p.y < innerHeight + 40 && p.life < 240);
  for (const p of parts) {
    p.vy += 0.38; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr; p.life++;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.r);
    ctx.fillStyle = p.c;
    ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    ctx.restore();
  }
  if (parts.length) requestAnimationFrame(frame);
  else { running = false; ctx.clearRect(0, 0, innerWidth, innerHeight); }
}
