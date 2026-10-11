// A single attempt at a level: player, pickups, checkpoints, crashes, finish.
import { createPlayer, stepPlayer, riderCenter, PHYS } from './player.js';

export const CRASH_TIME = 1.4;

export function createRun(level) {
  return {
    level,
    player: createPlayer(level.startX, level.terrain),
    time: 0,
    state: 'play', // play | crashed | done
    crashTimer: 0,
    crashReason: '',
    invuln: 0,
    got: new Uint8Array(level.daisies.length),
    daisyCount: 0,
    checkpoint: -1,
    crashes: 0,
    flips: 0,
    perfects: 0,
    tipIdx: 0,
    streak: 0,
    lastDaisyT: -9,
    finishTimer: 0,
    tumble: null,
  };
}

export function stepRun(run, dt, input, events) {
  const L = run.level;
  const p = run.player;

  if (run.state === 'crashed') {
    stepTumble(run, dt);
    run.crashTimer -= dt;
    if (run.crashTimer <= 0) respawn(run, events);
    return;
  }
  if (run.state === 'done') {
    run.finishTimer += dt;
    stepPlayer(p, dt, { pressed: false, held: false }, L.terrain, events, true);
    return;
  }

  run.time += dt;
  if (run.invuln > 0) run.invuln -= dt;
  const evs = [];
  stepPlayer(p, dt, input, L.terrain, evs);
  for (const e of evs) {
    if (e.type === 'crash') return crash(run, e.reason, events);
    if (e.type === 'land') {
      run.flips += e.flips;
      if (e.perfect) run.perfects++;
    }
    events.push(e);
  }

  const c = riderCenter(p);
  if (run.invuln <= 0) {
    for (const r of L.rocks) {
      if (Math.abs(r.x - p.x) > 80) continue;
      const dx = c.x - r.x;
      const dy = c.y - (r.y - r.r * 0.7);
      const rr = r.r + PHYS.radius - 4;
      if (dx * dx + dy * dy < rr * rr) return crash(run, 'rock', events);
    }
  }

  for (let i = 0; i < L.daisies.length; i++) {
    if (run.got[i]) continue;
    const d = L.daisies[i];
    if (Math.abs(d.x - c.x) > 50) continue;
    const dx = d.x - c.x;
    const dy = d.y - c.y;
    if (dx * dx + dy * dy < 36 * 36) {
      run.got[i] = 1;
      run.daisyCount++;
      run.streak = run.time - run.lastDaisyT < 0.7 ? run.streak + 1 : 0;
      run.lastDaisyT = run.time;
      events.push({ type: 'daisy', x: d.x, y: d.y, streak: run.streak });
    }
  }

  while (run.checkpoint + 1 < L.flags.length && p.x > L.flags[run.checkpoint + 1].x) {
    run.checkpoint++;
    events.push({ type: 'checkpoint', index: run.checkpoint });
  }

  while (run.tipIdx < L.tips.length && p.x > L.tips[run.tipIdx].x) {
    events.push({ type: 'tip', text: L.tips[run.tipIdx].text });
    run.tipIdx++;
  }

  if (p.x > L.endX) {
    run.state = 'done';
    events.push({ type: 'finish' });
  }
}

function crash(run, reason, events) {
  const p = run.player;
  run.state = 'crashed';
  run.crashReason = reason;
  run.crashTimer = CRASH_TIME;
  run.crashes++;
  const vx = p.grounded ? p.speed * Math.cos(p.angle) : p.vx;
  const vy = p.grounded ? p.speed * Math.sin(p.angle) : p.vy;
  run.tumble = {
    x: p.x,
    y: p.y,
    vx: reason === 'rock' || reason === 'wall' ? -vx * 0.25 : vx * 0.45,
    vy: reason === 'fall' ? vy : -260,
    angle: p.angle,
    spin: -9,
    hat: { x: p.x - 14, y: p.y - 60, vx: vx * 0.3 - 60, vy: -420, a: 0 },
  };
  events.push({ type: 'crash', reason, x: p.x, y: p.y });
}

function stepTumble(run, dt) {
  const t = run.tumble;
  const T = run.level.terrain;
  t.vy += 1300 * dt;
  t.x += t.vx * dt;
  t.y += t.vy * dt;
  t.angle += t.spin * dt;
  if (!T.inGap(t.x)) {
    const gy = T.heightAt(t.x);
    if (t.y > gy) {
      t.y = gy;
      t.vy *= -0.3;
      t.vx *= 0.7;
      t.spin *= 0.6;
    }
  }
  const h = t.hat;
  h.vy += 1300 * dt;
  h.x += h.vx * dt;
  h.y += h.vy * dt;
  h.a += 7 * dt;
  if (!T.inGap(h.x) && h.y > T.heightAt(h.x) - 4) {
    h.y = T.heightAt(h.x) - 4;
    h.vy *= -0.25;
    h.vx *= 0.6;
  }
}

function respawn(run, events) {
  const L = run.level;
  const x = run.checkpoint >= 0 ? L.flags[run.checkpoint].x : L.startX;
  run.player = createPlayer(x, L.terrain);
  run.state = 'play';
  run.invuln = 1.2;
  run.tumble = null;
  events.push({ type: 'respawn' });
}

export function starsFor(run) {
  const total = run.level.daisies.length;
  let s = 1;
  if (total === 0 || run.daisyCount / total >= 0.75) s++;
  if (run.crashes === 0) s++;
  return s;
}
