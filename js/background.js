// Parallax backdrop: distant mountain, meadows and forest bands with cypress spires.
// Each layer is drawn into cached canvas chunks so scrolling costs only a few drawImage calls.
import { hash } from './rng.js';
import { mix, rgba } from './color.js';

const CW = 600; // chunk width in layer units
const TOP = 420; // layer content above the ridge baseline
const BOT = 520; // and below it
const MAX_CHUNKS = 6;
const PAD = 6; // extra layer units rendered on each side of a chunk so scaled edges don't seam

// ridge: baseline as a fraction of view height above the screen centre.
const LAYERS = [
  { kind: 'meadow', f: 0.06, ridge: 0.3, haze: 0.62, amp: 70, k: 0.0011, forestTop: true },
  { kind: 'forest', f: 0.13, ridge: 0.25, haze: 0.48, size: 0.75, cypress: 0.35 },
  { kind: 'meadow', f: 0.24, ridge: 0.17, haze: 0.3, amp: 90, k: 0.0016 },
  { kind: 'forest', f: 0.42, ridge: 0.07, haze: 0.12, size: 1.05, cypress: 0.55 },
];

export class Background {
  constructor() {
    this.layers = LAYERS.map((l) => ({ ...l, cache: new Map() }));
    this.key = '';
  }

  configure(palette, seed, res) {
    const key = `${seed}|${res}|${palette.sky}`;
    if (key === this.key) return;
    this.key = key;
    this.pal = palette;
    this.seed = seed;
    this.res = res; // device pixels per layer unit
    for (const l of this.layers) {
      l.cache.clear();
      const pal = palette;
      const h = l.haze + pal.mist * 0.35 * (1 - l.f);
      l.col = {
        meadow: mix(pal.meadow, pal.haze, h),
        meadowDark: mix(pal.grassDark, pal.haze, h),
        bush: mix(pal.bush, pal.haze, h),
        bushLight: mix(pal.bushLight, pal.haze, h),
        bushDark: mix(pal.bushDark, pal.haze, h),
        cypress: mix(pal.cypress, pal.haze, h),
        line: mix(pal.ink, pal.haze, Math.min(1, h + 0.25)),
      };
    }
  }

  draw(ctx, cam, W, H, dpr, viewH, scale, progress) {
    const pal = this.pal;
    const g = ctx.createLinearGradient(0, 0, 0, H * dpr);
    g.addColorStop(0, pal.skyTop);
    g.addColorStop(0.55, pal.sky);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W * dpr, H * dpr);

    this.drawSun(ctx, W, H, dpr, viewH, scale);
    this.drawMountain(ctx, W, H, dpr, viewH, scale, progress, cam);

    for (let i = 0; i < this.layers.length; i++) {
      const l = this.layers[i];
      const s = scale * (1 + (cam.zoomScale - 1) * l.f); // far layers zoom less
      const ox = cam.x * l.f;
      const baseY = H / 2 - l.ridge * viewH * scale - cam.dy * l.f * scale;
      const left = ox - W / 2 / s;
      const right = ox + W / 2 / s;
      const i0 = Math.floor(left / CW);
      const i1 = Math.floor(right / CW);
      const dpx = s * dpr;
      for (let c = i0; c <= i1; c++) {
        const chunk = this.chunk(l, i, c);
        const sx = (W / 2 + (c * CW - ox) * s) * dpr;
        const sy = (baseY - TOP * s) * dpr;
        const pad = PAD * this.res;
        // draw only the inner part of the padded chunk, with a 1px overlap
        ctx.drawImage(chunk, pad, 0, CW * this.res, chunk.height, Math.floor(sx), sy, Math.ceil(CW * dpx) + 1, (TOP + BOT) * dpx);
      }
      const bottom = (baseY + BOT * s) * dpr;
      if (bottom < H * dpr) {
        ctx.fillStyle = l.kind === 'forest' ? l.col.bushDark : l.col.meadow;
        ctx.fillRect(0, bottom - 1, W * dpr, H * dpr - bottom + 1);
      }
      if (pal.mist > 0) {
        const mg = ctx.createLinearGradient(0, (baseY - 140 * s) * dpr, 0, (baseY + 260 * s) * dpr);
        mg.addColorStop(0, rgba(pal.haze, 0));
        mg.addColorStop(1, rgba(pal.haze, 0.55 * pal.mist));
        ctx.fillStyle = mg;
        ctx.fillRect(0, (baseY - 140 * s) * dpr, W * dpr, H * dpr);
      }
      for (const [k, v] of l.cache) if (k < i0 - 2 || k > i1 + 2) l.cache.delete(k);
    }
  }

  drawSun(ctx, W, H, dpr, viewH, scale) {
    const pal = this.pal;
    const x = W * 0.22 * dpr;
    const y = (H / 2 - viewH * 0.42 * scale) * dpr;
    const r = Math.max(40, viewH * 0.06 * scale) * dpr;
    const g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r * 3);
    g.addColorStop(0, rgba('#ffffff', 0.55));
    g.addColorStop(1, rgba(pal.sky, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - r * 3, y - r * 3, r * 6, r * 6);
  }

  // The goal: a mountain on the horizon that grows as you travel.
  drawMountain(ctx, W, H, dpr, viewH, scale, progress, cam) {
    const pal = this.pal;
    const base = (H / 2 - 0.31 * viewH * scale - cam.dy * 0.03 * scale) * dpr;
    // keep the peak inside the sky
    const size = Math.min((0.17 + 0.33 * progress) * Math.min(viewH * scale, W * 1.3) * dpr, (base - 24 * dpr) / 1.06);
    const cx = (W * 0.7 - cam.x * 0.004 * scale) * dpr;
    const col = mix(pal.mountain, pal.haze, 0.35 - progress * 0.25);
    const shade = mix(col, pal.ink, 0.12);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx - size * 1.9, base + 2);
    ctx.bezierCurveTo(cx - size * 1.1, base - size * 0.25, cx - size * 0.5, base - size * 0.75, cx - size * 0.12, base - size * 0.97);
    ctx.quadraticCurveTo(cx, base - size * 1.05, cx + size * 0.12, base - size * 0.95);
    ctx.bezierCurveTo(cx + size * 0.45, base - size * 0.7, cx + size * 0.75, base - size * 0.45, cx + size * 1.0, base - size * 0.42);
    ctx.bezierCurveTo(cx + size * 1.3, base - size * 0.4, cx + size * 1.6, base - size * 0.15, cx + size * 2.1, base + 2);
    ctx.closePath();
    ctx.fillStyle = col;
    ctx.fill();
    ctx.clip();
    // shaded right flank
    ctx.beginPath();
    ctx.moveTo(cx, base - size * 1.05);
    ctx.bezierCurveTo(cx + size * 0.1, base - size * 0.6, cx + size * 0.05, base - size * 0.3, cx + size * 0.3, base);
    ctx.lineTo(cx + size * 2.2, base);
    ctx.lineTo(cx + size * 2.2, base - size * 1.2);
    ctx.closePath();
    ctx.fillStyle = shade;
    ctx.fill();
    // snow cap
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.32, base - size * 0.8);
    ctx.quadraticCurveTo(cx - size * 0.2, base - size * 0.72, cx - size * 0.1, base - size * 0.78);
    ctx.quadraticCurveTo(cx, base - size * 0.7, cx + size * 0.08, base - size * 0.77);
    ctx.quadraticCurveTo(cx + size * 0.2, base - size * 0.7, cx + size * 0.32, base - size * 0.78);
    ctx.lineTo(cx + size * 0.2, base - size * 1.2);
    ctx.lineTo(cx - size * 0.2, base - size * 1.2);
    ctx.closePath();
    ctx.fillStyle = rgba(pal.snow, 0.9);
    ctx.fill();
    ctx.restore();
  }

  chunk(l, li, c) {
    let cv = l.cache.get(c);
    if (cv) return cv;
    if (l.cache.size >= MAX_CHUNKS) l.cache.delete(l.cache.keys().next().value);
    cv = document.createElement('canvas');
    const r = this.res;
    cv.width = Math.ceil((CW + PAD * 2) * r);
    cv.height = Math.ceil((TOP + BOT) * r);
    const ctx = cv.getContext('2d');
    ctx.setTransform(r, 0, 0, r, (PAD - c * CW) * r, TOP * r);
    const seed = this.seed * 7 + li * 101;
    if (l.kind === 'meadow') this.drawMeadow(ctx, l, c, seed);
    else this.drawForest(ctx, l, c, seed);
    l.cache.set(c, cv);
    return cv;
  }

  ridgeY(l, x, seed) {
    const p = hash(seed, 3) * 1000;
    return -(l.amp * (0.5 + 0.5 * Math.sin(x * l.k + p)) + l.amp * 0.45 * (0.5 + 0.5 * Math.sin(x * l.k * 2.7 + p * 1.7)));
  }

  drawMeadow(ctx, l, c, seed) {
    const x0 = c * CW - PAD - 2;
    const x1 = (c + 1) * CW + PAD + 2;
    if (l.forestTop) this.forestStrip(ctx, l, c, seed + 9, (x) => this.ridgeY(l, x, seed) + 26, 0.5);
    ctx.beginPath();
    ctx.moveTo(x0, BOT);
    for (let x = x0; x <= x1; x += 8) ctx.lineTo(x, this.ridgeY(l, x, seed));
    ctx.lineTo(x1, BOT);
    ctx.closePath();
    ctx.fillStyle = l.col.meadow;
    ctx.fill();

    // grass hatching and lone round trees, placed per cell so neighbouring chunks agree
    const cell = 46;
    for (let k = Math.floor((x0 - 60) / cell); k <= Math.ceil((x1 + 60) / cell); k++) {
      const h = hash(k, seed);
      const x = k * cell + hash(k, seed + 1) * cell;
      const ry = this.ridgeY(l, x, seed);
      if (h < 0.5) {
        ctx.strokeStyle = rgba(l.col.meadowDark, 0.7);
        ctx.lineWidth = 1.2;
        const y = ry + 20 + hash(k, seed + 2) * 300;
        ctx.beginPath();
        for (let j = 0; j < 3; j++) {
          ctx.moveTo(x + j * 4, y);
          ctx.lineTo(x + j * 4 + 1, y - 5);
        }
        ctx.stroke();
      }
      if (h > 0.9) {
        const y = ry + 30 + hash(k, seed + 4) * 120;
        this.lollipop(ctx, x, y, 0.8 + hash(k, seed + 5) * 0.4, l.col);
      }
    }
  }

  lollipop(ctx, x, y, s, col) {
    ctx.strokeStyle = col.line;
    ctx.lineWidth = 2 * s;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - 18 * s);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(x, y - 30 * s, 11 * s, 15 * s, 0, 0, Math.PI * 2);
    ctx.fillStyle = col.bushLight;
    ctx.fill();
    ctx.lineWidth = 1.2 * s;
    ctx.stroke();
  }

  drawForest(ctx, l, c, seed) {
    const base = (x) => -30 * (0.5 + 0.5 * Math.sin(x * 0.0021 + seed)) - 18 * Math.sin(x * 0.0057 + seed * 0.3);
    this.forestStrip(ctx, l, c, seed, base, l.size, l.cypress);
  }

  // A band of round bushes with cypress spires poking out. Rows of overlapping domes, each
  // lower row in front of the one above, so the mass reads as a deep forest without hard edges.
  forestStrip(ctx, l, c, seed, base, size, cypressChance = 0.25) {
    const x0 = c * CW - PAD;
    const x1 = (c + 1) * CW + PAD;
    const col = l.col;
    const cell = 34 * size;
    const k0 = Math.floor((x0 - 90 * size) / cell);
    const k1 = Math.ceil((x1 + 90 * size) / cell);
    const rows = 6;
    const rowGap = 34 * size;
    const solidTop = rows * rowGap;

    ctx.beginPath();
    ctx.moveTo(x0 - 2, BOT);
    for (let x = x0 - 2; x <= x1 + 2; x += 10) ctx.lineTo(x, base(x) + solidTop);
    ctx.lineTo(x1 + 2, BOT);
    ctx.closePath();
    ctx.fillStyle = col.bushDark;
    ctx.fill();

    const row = (ri) => {
      const off = (ri * 0.5) % 1;
      for (let k = k0; k <= k1; k++) {
        const h = hash(k, seed + ri * 13);
        const x = (k + off) * cell + (hash(k, seed + ri * 13 + 1) - 0.5) * cell * 0.6;
        const r = (ri === 0 ? 28 : 34) * size * (0.75 + h * 0.6);
        const y = base(x) + ri * rowGap - r * 0.35;
        const shade = hash(k, seed + ri * 13 + 2);
        let fill = shade < 0.33 ? col.bush : shade < 0.66 ? col.bushLight : mix(col.bush, col.bushDark, 0.5);
        fill = mix(fill, col.bushDark, Math.min(0.6, ri * 0.1));
        this.lump(ctx, x, y, r, fill, col, k * 31 + ri, seed + ri);
      }
    };

    row(0);
    for (let k = Math.floor(k0 / 3); k <= Math.ceil(k1 / 3); k++) {
      if (hash(k, seed + 77) > cypressChance) continue;
      const x = k * cell * 3 + hash(k, seed + 78) * cell * 3;
      const hgt = (130 + hash(k, seed + 79) * 170) * size;
      this.cypress(ctx, x, base(x) + 24 * size, hgt, (18 + hash(k, seed + 80) * 10) * size, col);
    }
    for (let ri = 1; ri <= rows; ri++) row(ri);
  }

  lump(ctx, x, y, r, fill, col, k, seed) {
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 1.05, 0, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = rgba(col.line, 0.5);
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 1.05, 0, Math.PI * 1.02, Math.PI * 1.98);
    ctx.stroke();
    // hatching like pen strokes on the leaves
    ctx.strokeStyle = rgba(col.line, 0.35);
    ctx.lineWidth = 1;
    ctx.beginPath();
    const n = 3 + Math.floor(hash(k, seed + 5) * 4);
    for (let j = 0; j < n; j++) {
      const a = Math.PI * (1.1 + 0.8 * hash(k * 7 + j, seed + 6));
      const rr = r * (0.45 + 0.4 * hash(k * 7 + j, seed + 7));
      const px = x + Math.cos(a) * rr;
      const py = y + Math.sin(a) * rr;
      ctx.moveTo(px, py);
      ctx.lineTo(px + 1.5, py + 5);
    }
    ctx.stroke();
  }

  cypress(ctx, x, y, h, w, col) {
    ctx.beginPath();
    ctx.moveTo(x - w / 2, y);
    ctx.quadraticCurveTo(x - w * 0.55, y - h * 0.55, x, y - h);
    ctx.quadraticCurveTo(x + w * 0.55, y - h * 0.55, x + w / 2, y);
    ctx.closePath();
    ctx.fillStyle = col.cypress;
    ctx.fill();
    ctx.strokeStyle = rgba(col.line, 0.6);
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.strokeStyle = rgba(col.line, 0.3);
    ctx.beginPath();
    for (let t = 0.15; t < 0.9; t += 0.12) {
      const yy = y - h * t;
      const ww = (w / 2) * (1 - t) * 0.7;
      ctx.moveTo(x - ww, yy);
      ctx.lineTo(x - ww * 0.4, yy - 6);
      ctx.moveTo(x + ww * 0.2, yy - 3);
      ctx.lineTo(x + ww * 0.6, yy - 9);
    }
    ctx.stroke();
  }
}
