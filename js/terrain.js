// Terrain height field: a monotone cubic Hermite spline through control points,
// with optional gaps (chasms) where there is no ground.
// Coordinates follow the canvas: +y points down.

export class Terrain {
  constructor(points, gaps = []) {
    this.xs = points.map((p) => p.x);
    this.ys = points.map((p) => p.y);
    this.gaps = gaps;
    this.ms = tangents(this.xs, this.ys);
    this.last = 0;
    for (const g of gaps) {
      g.floor = Math.max(this.heightAt(g.x0), this.heightAt(g.x1)) + 450;
    }
  }

  segment(x) {
    const xs = this.xs;
    let i = this.last;
    if (x >= xs[i] && x < xs[i + 1]) return i;
    let lo = 0;
    let hi = xs.length - 2;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (xs[mid] <= x) lo = mid;
      else hi = mid - 1;
    }
    this.last = lo;
    return lo;
  }

  // Returns [y, dy/dx, d2y/dx2] at x.
  eval(x) {
    const xs = this.xs;
    const n = xs.length;
    if (x <= xs[0]) return [this.ys[0], 0, 0];
    if (x >= xs[n - 1]) return [this.ys[n - 1], 0, 0];
    const i = this.segment(x);
    const h = xs[i + 1] - xs[i];
    const t = (x - xs[i]) / h;
    const y0 = this.ys[i];
    const y1 = this.ys[i + 1];
    const m0 = this.ms[i] * h;
    const m1 = this.ms[i + 1] * h;
    const t2 = t * t;
    const t3 = t2 * t;
    const y = (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * m1;
    const d = ((6 * t2 - 6 * t) * y0 + (3 * t2 - 4 * t + 1) * m0 + (-6 * t2 + 6 * t) * y1 + (3 * t2 - 2 * t) * m1) / h;
    const dd = ((12 * t - 6) * y0 + (6 * t - 4) * m0 + (-12 * t + 6) * y1 + (6 * t - 2) * m1) / (h * h);
    return [y, d, dd];
  }

  heightAt(x) {
    return this.eval(x)[0];
  }

  slopeAt(x) {
    return this.eval(x)[1];
  }

  // Signed curvature; positive over crests (in canvas coordinates).
  curvatureAt(x) {
    const [, d, dd] = this.eval(x);
    return dd / Math.pow(1 + d * d, 1.5);
  }

  inGap(x) {
    for (const g of this.gaps) if (x > g.x0 && x < g.x1) return g;
    return null;
  }
}

// Fritsch–Butland / PCHIP tangents: smooth, never overshoots, flat at peaks and valleys.
function tangents(xs, ys) {
  const n = xs.length;
  const ms = new Array(n).fill(0);
  const h = [];
  const d = [];
  for (let i = 0; i < n - 1; i++) {
    h.push(xs[i + 1] - xs[i]);
    d.push((ys[i + 1] - ys[i]) / h[i]);
  }
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) continue;
    const w1 = 2 * h[i] + h[i - 1];
    const w2 = h[i] + 2 * h[i - 1];
    ms[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
  }
  return ms;
}
