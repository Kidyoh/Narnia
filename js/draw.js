// World-space drawing: terrain, scenery, obstacles, pickups and the two riders.
// All functions draw in world units; the caller sets the camera transform.
import { hash } from './rng.js';
import { mix, rgba } from './color.js';
import { riderCenter } from './player.js';

export function drawTerrain(ctx, level, view, t) {
  const T = level.terrain;
  const pal = level.palette;
  const { left, right, bottom } = view;
  const step = Math.max(4, (right - left) / 220);

  // Ground polygons between gaps.
  const spans = [];
  let s0 = left;
  for (const g of level.gaps) {
    if (g.x1 < left || g.x0 > right) continue;
    if (g.x0 > s0) spans.push([s0, g.x0]);
    s0 = Math.max(s0, g.x1);
  }
  if (s0 < right) spans.push([s0, right]);

  // A shadowy ravine behind each gap.
  for (const g of level.gaps) {
    if (g.x1 < left - 50 || g.x0 > right + 50) continue;
    const top = Math.min(T.heightAt(g.x0), T.heightAt(g.x1));
    const grd = ctx.createLinearGradient(0, top, 0, top + 500);
    grd.addColorStop(0, rgba(pal.bushDark, 0));
    grd.addColorStop(1, rgba(pal.bushDark, 0.85));
    ctx.fillStyle = grd;
    ctx.fillRect(g.x0, top, g.x1 - g.x0, bottom - top + 10);
  }

  for (const [a, b] of spans) {
    ctx.beginPath();
    ctx.moveTo(a, bottom);
    for (let x = a; x < b; x += step) ctx.lineTo(x, T.heightAt(x));
    ctx.lineTo(b, T.heightAt(b));
    ctx.lineTo(b, bottom);
    ctx.closePath();
    ctx.fillStyle = pal.grass;
    ctx.fill();
  }

  // Cliff faces at gap edges: a thin rocky lip with a pen outline.
  for (const g of level.gaps) {
    if (g.x1 < left - 50 || g.x0 > right + 50) continue;
    for (const [ex, dir] of [
      [g.x0, -1],
      [g.x1, 1],
    ]) {
      const y = T.heightAt(ex);
      const face = (w) => {
        ctx.moveTo(ex, y);
        ctx.bezierCurveTo(ex - dir * 5, y + 50, ex + dir * 8, y + 120, ex + dir * 2, y + 260);
        ctx.lineTo(ex + dir * 2, bottom);
        if (w) {
          ctx.lineTo(ex + dir * w, bottom);
          ctx.lineTo(ex + dir * w, y + 6);
        }
      };
      const grd = ctx.createLinearGradient(0, y, 0, y + 320);
      grd.addColorStop(0, pal.cliff);
      grd.addColorStop(1, mix(pal.cliff, pal.bushDark, 0.7));
      ctx.beginPath();
      face(14);
      ctx.closePath();
      ctx.fillStyle = grd;
      ctx.fill();
      ctx.strokeStyle = rgba(pal.ink, 0.55);
      ctx.lineWidth = 2;
      ctx.beginPath();
      face(0);
      ctx.stroke();
    }
  }

  // Grass hatching and tiny white flowers, like the pen texture in the art.
  const seed = level.def.seed;
  const cell = 38;
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = rgba(pal.grassDark, 0.9);
  ctx.beginPath();
  const flowers = [];
  for (let k = Math.floor(left / cell); k <= Math.ceil(right / cell); k++) {
    const x = k * cell + hash(k, seed) * cell;
    if (T.inGap(x)) continue;
    const gy = T.heightAt(x);
    const h = hash(k, seed + 1);
    for (let j = 0; j < 2; j++) {
      const d = 14 + hash(k * 3 + j, seed + 2) * 420;
      const xx = x + j * 17;
      if (T.inGap(xx)) continue;
      const yy = T.heightAt(xx) + d;
      ctx.moveTo(xx, yy);
      ctx.lineTo(xx + 1, yy - 6);
      ctx.moveTo(xx + 4, yy + 1);
      ctx.lineTo(xx + 5, yy - 5);
    }
    if (h > 0.72) flowers.push([x + 9, gy + 10 + hash(k, seed + 3) * 160]);
  }
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,250,0.85)';
  for (const [x, y] of flowers) {
    ctx.beginPath();
    ctx.arc(x, y, 2.4, 0, Math.PI * 2);
    ctx.arc(x + 9, y + 4, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }

  // Big bushes far below the surface, framing the bottom like the illustration.
  // Several staggered rows of full domes; each lower row hides the bottoms of the row above.
  const bcell = 120;
  for (let ri = 0; ri < 6; ri++) {
    const depth = 360 + ri * 85;
    for (let k = Math.floor((left - 200) / bcell); k <= Math.ceil((right + 200) / bcell); k++) {
      const h = hash(k, seed + 50 + ri * 7);
      if (ri === 0 && h < 0.35) continue;
      const x = (k + (ri % 2) * 0.5) * bcell + (hash(k, seed + 51 + ri * 7) - 0.5) * bcell * 0.5;
      if (T.inGap(x)) continue;
      const r = 75 + hash(k, seed + 52 + ri * 7) * 55;
      const y = T.heightAt(x) + depth + hash(k, seed + 53 + ri * 7) * 50;
      if (y - r > bottom) continue;
      let fill = h < 0.45 ? pal.bush : h < 0.75 ? mix(pal.bush, pal.bushDark, 0.45) : pal.bushLight;
      fill = mix(fill, pal.bushDark, Math.min(0.5, ri * 0.09));
      ctx.beginPath();
      ctx.ellipse(x, y, r * 1.15, r, 0, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = rgba(pal.ink, 0.45);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.ellipse(x, y, r * 1.15, r, 0, Math.PI * 1.03, Math.PI * 1.97);
      ctx.stroke();
      ctx.strokeStyle = rgba(pal.ink, 0.22);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let j = 0; j < 7; j++) {
        const a = Math.PI * (1.1 + 0.8 * hash(k * 9 + j, seed + 54 + ri));
        const rr = r * (0.4 + 0.5 * hash(k * 9 + j, seed + 55 + ri));
        const px = x + Math.cos(a) * rr * 1.15;
        const py = y + Math.sin(a) * rr;
        ctx.moveTo(px, py);
        ctx.lineTo(px + 2, py + 7);
      }
      ctx.stroke();
    }
  }
}

// Trees standing on the meadow behind the riders. Purely decorative, never in the way.
export function drawScenery(ctx, level, view) {
  const T = level.terrain;
  const pal = level.palette;
  const seed = level.def.seed + 900;
  const cell = 230;
  for (let k = Math.floor((view.left - 100) / cell); k <= Math.ceil((view.right + 100) / cell); k++) {
    const h = hash(k, seed);
    if (h > 0.42) continue;
    const x = k * cell + hash(k, seed + 1) * cell * 0.7;
    if (T.inGap(x) || T.inGap(x - 30) || T.inGap(x + 30)) continue;
    if (Math.abs(x - level.endX) < 200) continue;
    if (level.rocks.some((r) => Math.abs(r.x - x) < 90)) continue;
    if (level.flags.some((f) => Math.abs(f.x - x) < 90)) continue;
    const y = T.heightAt(x) + 4;
    const s = 0.8 + hash(k, seed + 2) * 0.5;
    if (h < 0.16) drawCypress(ctx, x, y, 150 * s, 30 * s, pal);
    else drawRoundTree(ctx, x, y, s, pal);
  }
}

function drawCypress(ctx, x, y, h, w, pal) {
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y);
  ctx.quadraticCurveTo(x - w * 0.6, y - h * 0.55, x, y - h);
  ctx.quadraticCurveTo(x + w * 0.6, y - h * 0.55, x + w / 2, y);
  ctx.closePath();
  ctx.fillStyle = pal.cypress;
  ctx.fill();
  ctx.strokeStyle = rgba(pal.ink, 0.7);
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.strokeStyle = rgba(pal.ink, 0.35);
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  for (let t = 0.12; t < 0.9; t += 0.09) {
    const yy = y - h * t;
    const ww = (w / 2) * (1 - t) * 0.8;
    ctx.moveTo(x - ww, yy);
    ctx.lineTo(x - ww * 0.5, yy - 7);
    ctx.moveTo(x + ww * 0.1, yy - 4);
    ctx.lineTo(x + ww * 0.55, yy - 10);
  }
  ctx.stroke();
}

function drawRoundTree(ctx, x, y, s, pal) {
  ctx.strokeStyle = rgba(pal.ink, 0.85);
  ctx.lineWidth = 2.4 * s;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - 30 * s);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(x, y - 52 * s, 20 * s, 28 * s, 0, 0, Math.PI * 2);
  ctx.fillStyle = pal.bush;
  ctx.fill();
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.strokeStyle = rgba(pal.ink, 0.3);
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  for (let j = 0; j < 5; j++) {
    const px = x - 10 * s + (j % 3) * 7 * s;
    const py = y - 66 * s + Math.floor(j / 2) * 12 * s;
    ctx.moveTo(px, py);
    ctx.lineTo(px + 1.5, py + 5);
  }
  ctx.stroke();
}

export function drawRocks(ctx, level, view) {
  const pal = level.palette;
  for (const r of level.rocks) {
    if (r.x < view.left - 60 || r.x > view.right + 60) continue;
    const { x, y } = r;
    const rr = r.r;
    ctx.beginPath();
    ctx.moveTo(x - rr * 1.25, y + 3);
    ctx.bezierCurveTo(x - rr * 1.3, y - rr * 1.0, x - rr * 0.4, y - rr * 1.6, x + rr * 0.2, y - rr * 1.45);
    ctx.bezierCurveTo(x + rr * 0.9, y - rr * 1.35, x + rr * 1.4, y - rr * 0.6, x + rr * 1.25, y + 3);
    ctx.closePath();
    ctx.fillStyle = '#9a9680';
    ctx.fill();
    ctx.strokeStyle = '#3d3c30';
    ctx.lineWidth = 2.2;
    ctx.stroke();
    // shade + highlight
    ctx.beginPath();
    ctx.moveTo(x + rr * 0.1, y + 2);
    ctx.bezierCurveTo(x + rr * 0.6, y - rr * 0.5, x + rr * 0.9, y - rr * 0.9, x + rr * 0.6, y - rr * 1.3);
    ctx.bezierCurveTo(x + rr * 1.3, y - rr * 0.8, x + rr * 1.3, y - rr * 0.2, x + rr * 1.2, y + 2);
    ctx.closePath();
    ctx.fillStyle = 'rgba(40,40,30,0.25)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,240,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - rr * 0.8, y - rr * 0.6);
    ctx.quadraticCurveTo(x - rr * 0.6, y - rr * 1.15, x - rr * 0.1, y - rr * 1.25);
    ctx.stroke();
    // moss
    ctx.fillStyle = pal.bushLight;
    ctx.beginPath();
    ctx.ellipse(x - rr * 0.3, y - rr * 1.35, rr * 0.45, rr * 0.18, -0.2, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawDaisies(ctx, level, run, view, t) {
  for (let i = 0; i < level.daisies.length; i++) {
    if (run && run.got[i]) continue;
    const d = level.daisies[i];
    if (d.x < view.left - 30 || d.x > view.right + 30) continue;
    const bob = Math.sin(t * 3 + d.x * 0.02) * 4;
    drawDaisy(ctx, d.x, d.y + bob, 1, t * 0.8 + d.x);
  }
}

export function drawDaisy(ctx, x, y, s, rot) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot * 0.3);
  ctx.fillStyle = 'rgba(255,250,200,0.35)';
  ctx.beginPath();
  ctx.arc(0, 0, 20 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fffef6';
  ctx.strokeStyle = 'rgba(60,70,40,0.55)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    ctx.beginPath();
    ctx.ellipse(Math.cos(a) * 7 * s, Math.sin(a) * 7 * s, 5.5 * s, 3.2 * s, a, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = '#f2c230';
  ctx.beginPath();
  ctx.arc(0, 0, 4.5 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(120,80,10,0.7)';
  ctx.stroke();
  ctx.restore();
}

export function drawFlags(ctx, level, run, view, t) {
  const pal = level.palette;
  level.flags.forEach((f, i) => {
    if (f.x < view.left - 80 || f.x > view.right + 80) return;
    const reached = run && run.checkpoint >= i;
    ctx.strokeStyle = pal.ink;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(f.x, f.y + 4);
    ctx.lineTo(f.x, f.y - 90);
    ctx.stroke();
    const wave = Math.sin(t * 5 + i) * 4;
    ctx.beginPath();
    ctx.moveTo(f.x, f.y - 90);
    ctx.quadraticCurveTo(f.x + 22, f.y - 86 + wave, f.x + 44, f.y - 78 + wave);
    ctx.quadraticCurveTo(f.x + 22, f.y - 72 - wave * 0.5, f.x, f.y - 64);
    ctx.closePath();
    ctx.fillStyle = reached ? '#e9b93a' : '#c8553d';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });
}

// The finish: a lamp-post glowing in the meadow.
export function drawLamp(ctx, level, view, t) {
  const x = level.endX;
  if (x < view.left - 200 || x > view.right + 200) return;
  const y = level.endY;
  const top = y - 190;
  const glow = ctx.createRadialGradient(x, top, 4, x, top, 120 + Math.sin(t * 2) * 6);
  glow.addColorStop(0, 'rgba(255,230,140,0.85)');
  glow.addColorStop(0.3, 'rgba(255,220,120,0.35)');
  glow.addColorStop(1, 'rgba(255,220,120,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(x - 130, top - 130, 260, 260);
  ctx.fillStyle = '#23231f';
  ctx.strokeStyle = '#23231f';
  // base
  ctx.beginPath();
  ctx.moveTo(x - 14, y + 4);
  ctx.lineTo(x + 14, y + 4);
  ctx.lineTo(x + 8, y - 14);
  ctx.lineTo(x - 8, y - 14);
  ctx.closePath();
  ctx.fill();
  // post
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(x, y - 10);
  ctx.lineTo(x, top + 14);
  ctx.stroke();
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(x - 14, top + 34);
  ctx.lineTo(x + 14, top + 34);
  ctx.stroke();
  // lantern
  ctx.beginPath();
  ctx.moveTo(x - 13, top + 14);
  ctx.lineTo(x + 13, top + 14);
  ctx.lineTo(x + 17, top - 12);
  ctx.lineTo(x - 17, top - 12);
  ctx.closePath();
  ctx.fillStyle = '#ffe58f';
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, top - 12);
  ctx.lineTo(x, top + 14);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - 22, top - 12);
  ctx.lineTo(x + 22, top - 12);
  ctx.lineTo(x, top - 30);
  ctx.closePath();
  ctx.fillStyle = '#23231f';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, top - 33, 4, 0, Math.PI * 2);
  ctx.fill();
}

const C = {
  wood: '#8a5a32',
  woodDark: '#4e3019',
  coat: '#3f6b3b',
  coatDark: '#2a4a29',
  cloak: '#5f9447',
  skin: '#f3e4cf',
  hat: '#1d1d1b',
  trousers: '#2a2a28',
  hair: '#f6f2e2',
  scarf: '#b7412e',
  ink: '#1f2a1c',
};

// The gentleman in the top hat sits behind, the child up front pointing the way.
export function drawRiders(ctx, p, t, opts = {}) {
  const { pushing = false, blink = false, hatOff = false } = opts;
  if (blink && Math.floor(t * 12) % 2 === 0) return;
  const speed = p.grounded ? p.speed : Math.hypot(p.vx, p.vy);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.angle);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const flutter = Math.sin(t * 18) * 3;
  const trail = Math.min(1, speed / 700);

  // scarf trailing behind
  ctx.strokeStyle = C.scarf;
  ctx.lineWidth = 3.4;
  ctx.beginPath();
  ctx.moveTo(-15, -38);
  ctx.quadraticCurveTo(-26, -40 + flutter, -30 - 10 * trail, -36 - flutter * trail - 4 * (1 - trail) + 8 * (1 - trail));
  ctx.stroke();

  // gentleman legs, along the sled
  ctx.strokeStyle = C.trousers;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(-14, -12);
  ctx.lineTo(-1, -12);
  ctx.lineTo(1, -6);
  ctx.stroke();

  // gentleman body
  ctx.fillStyle = C.coat;
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-22, -8);
  ctx.quadraticCurveTo(-24, -26, -18, -38);
  ctx.lineTo(-10, -38);
  ctx.quadraticCurveTo(-6, -24, -6, -8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // coat tail flapping
  ctx.beginPath();
  ctx.moveTo(-22, -10);
  ctx.quadraticCurveTo(-30, -9 + flutter * 0.5 * trail, -32 - 4 * trail, -5 + flutter * trail * 0.6);
  ctx.lineTo(-20, -6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // gentleman arm: pushing with a hand on the ground, or resting on the child's shoulder
  ctx.strokeStyle = C.coatDark;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-12, -33);
  if (pushing) {
    const ph = (t * 6) % (Math.PI * 2);
    ctx.lineTo(-22 + Math.cos(ph) * 6, -16);
    ctx.lineTo(-28 + Math.cos(ph) * 10, 2);
  } else {
    ctx.lineTo(-2, -28);
    ctx.lineTo(4, -25);
  }
  ctx.stroke();

  // gentleman head + hat
  ctx.fillStyle = C.skin;
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.ellipse(-14, -44, 5.5, 6.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = C.ink;
  ctx.beginPath();
  ctx.arc(-11.5, -45, 0.9, 0, Math.PI * 2);
  ctx.fill();
  if (!hatOff) drawHat(ctx, -14, -49, p.grounded ? 0 : Math.max(-4, Math.min(3, p.vy * 0.004)));

  // child: cloak, head, white hair, arm pointing ahead
  ctx.fillStyle = C.cloak;
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(1, -6);
  ctx.quadraticCurveTo(3, -20, 9, -26);
  ctx.lineTo(13, -26);
  ctx.quadraticCurveTo(19, -16, 20, -6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = mix(C.cloak, C.ink, 0.25);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(14, -20);
  ctx.lineTo(25, -24 + Math.sin(t * 3) * 1.5);
  ctx.stroke();
  ctx.fillStyle = C.skin;
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.arc(11, -31, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = C.hair;
  ctx.beginPath();
  ctx.ellipse(10, -34, 5.6, 3.6, -0.3, Math.PI * 0.95, Math.PI * 2.1);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = C.ink;
  ctx.beginPath();
  ctx.arc(13.5, -31, 0.8, 0, Math.PI * 2);
  ctx.fill();

  drawSled(ctx);
  ctx.restore();
}

function drawHat(ctx, x, y, lift) {
  ctx.save();
  ctx.translate(x, y + lift);
  ctx.fillStyle = C.hat;
  ctx.fillRect(-8.5, -1.5, 17, 3);
  ctx.beginPath();
  ctx.moveTo(-5.5, -1);
  ctx.lineTo(-6, -17);
  ctx.lineTo(6, -17);
  ctx.lineTo(5.5, -1);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#4e7c43';
  ctx.fillRect(-5.8, -5, 11.6, 2.2);
  ctx.restore();
}

function drawSled(ctx) {
  // seat
  ctx.fillStyle = C.wood;
  ctx.strokeStyle = C.woodDark;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.rect(-27, -8, 50, 5);
  ctx.fill();
  ctx.stroke();
  // runner with a curled front
  ctx.strokeStyle = C.woodDark;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-30, 0);
  ctx.lineTo(24, 0);
  ctx.quadraticCurveTo(34, 0, 34, -9);
  ctx.quadraticCurveTo(34, -15, 28, -13);
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const sx of [-20, -4, 12]) {
    ctx.moveTo(sx, -3);
    ctx.lineTo(sx, 0);
  }
  ctx.stroke();
}

export function drawTumble(ctx, run, t) {
  const tb = run.tumble;
  if (!tb) return;
  drawRiders(ctx, { x: tb.x, y: tb.y, angle: tb.angle, grounded: true, speed: 0, vx: 0, vy: 0 }, t, { hatOff: true });
  ctx.save();
  ctx.translate(tb.hat.x, tb.hat.y);
  ctx.rotate(tb.hat.a);
  drawHat(ctx, 0, 0, 0);
  ctx.restore();
}

export function drawParticles(ctx, parts) {
  for (const q of parts) {
    const a = Math.max(0, q.life / q.max);
    ctx.globalAlpha = a;
    ctx.fillStyle = q.color;
    if (q.kind === 'petal') {
      ctx.save();
      ctx.translate(q.x, q.y);
      ctx.rotate(q.a);
      ctx.beginPath();
      ctx.ellipse(0, 0, q.size, q.size * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(q.x, q.y, q.size * (0.5 + 0.5 * a), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

export function riderPos(p) {
  return riderCenter(p);
}
