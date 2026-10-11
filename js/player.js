// Sled physics. Pure logic, no DOM, so it can be tested headlessly.

export const PHYS = {
  g: 1300,
  minSpeed: 300, // the gentleman pushes if the sled gets slower than this
  maxSpeed: 1050,
  drag: 0.05,
  quadDrag: 0.0003,
  jumpV: 560,
  flipRate: 9.6, // rad/s while holding in the air
  flipDelay: 0.1, // a quick tap jumps without starting a flip
  coyote: 0.1,
  buffer: 0.13,
  safeLand: 0.9, // max angle (rad) between sled and slope that still lands
  perfectLand: 0.3,
  radius: 16,
  centerH: 18,
  startSpeed: 380,
};

const TAU = Math.PI * 2;
export const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export function createPlayer(x, terrain) {
  return {
    x,
    y: terrain.heightAt(x),
    vx: 0,
    vy: 0,
    speed: PHYS.startSpeed,
    grounded: true,
    angle: Math.atan(terrain.slopeAt(x)),
    angVel: 0,
    airTime: 0,
    takeoffT: 0,
    flipAcc: 0,
    coyote: 0,
    jumpBuffer: 0,
    jumped: false,
    pushing: false,
  };
}

export function riderCenter(p) {
  return { x: p.x + Math.sin(p.angle) * PHYS.centerH, y: p.y - Math.cos(p.angle) * PHYS.centerH };
}

export function stepPlayer(p, dt, input, T, events, brake = false) {
  if (input.pressed && !brake) p.jumpBuffer = PHYS.buffer;
  else p.jumpBuffer = Math.max(0, p.jumpBuffer - dt);
  if (p.grounded) groundStep(p, dt, T, events, brake);
  else airStep(p, dt, brake ? false : input.held, T, events);
}

function groundStep(p, dt, T, events, brake) {
  const th = Math.atan(T.slopeAt(p.x));
  const cos = Math.cos(th);
  let a = PHYS.g * Math.sin(th) - PHYS.drag * p.speed - PHYS.quadDrag * p.speed * p.speed;
  if (brake) a = Math.min(a, 0) - Math.max(250, p.speed * 1.4);
  p.speed += a * dt;
  if (brake) {
    p.speed = Math.max(0, p.speed);
    p.pushing = false;
  } else {
    p.pushing = p.speed < PHYS.minSpeed;
    if (p.pushing) p.speed = PHYS.minSpeed;
  }
  p.speed = Math.min(p.speed, PHYS.maxSpeed);

  // Fast over a crest: gravity can't hold the sled down, so it takes off.
  const k = T.curvatureAt(p.x);
  if (!brake && k > 0 && p.speed * p.speed * k > PHYS.g * cos) {
    launch(p, th);
    p.coyote = PHYS.coyote;
    return;
  }
  const nx = p.x + p.speed * cos * dt;
  if (T.inGap(nx)) {
    launch(p, th);
    p.coyote = PHYS.coyote;
    return;
  }
  p.x = nx;
  p.y = T.heightAt(nx);
  p.angle = Math.atan(T.slopeAt(nx));
  if (p.jumpBuffer > 0) jump(p, events);
}

function launch(p, th) {
  p.vx = p.speed * Math.cos(th);
  p.vy = p.speed * Math.sin(th);
  p.grounded = false;
  p.airTime = 0;
  p.takeoffT = 0;
  p.flipAcc = 0;
  p.angVel = 0;
  p.jumped = false;
}

function jump(p, events) {
  if (p.grounded) launch(p, p.angle);
  p.vy = Math.min(p.vy, 0) - PHYS.jumpV;
  p.jumped = true;
  p.coyote = 0;
  p.jumpBuffer = 0;
  p.takeoffT = 0;
  events.push({ type: 'jump' });
}

function airStep(p, dt, held, T, events) {
  p.airTime += dt;
  p.takeoffT += dt;
  p.coyote -= dt;
  if (p.jumpBuffer > 0 && p.coyote > 0 && !p.jumped) jump(p, events);

  const px = p.x;
  p.vy += PHYS.g * dt;
  p.x += p.vx * dt;
  p.y += p.vy * dt;

  const flipping = held && p.takeoffT > PHYS.flipDelay;
  if (flipping) p.angVel = -PHYS.flipRate;
  else p.angVel *= Math.exp(-12 * dt);
  const dA = p.angVel * dt;
  p.angle += dA;
  p.flipAcc += dA;
  if (!flipping) {
    // Not flipping: the riders lean the sled to match the ground below.
    const gx = T.inGap(p.x) ? 0 : Math.atan(T.slopeAt(p.x));
    const diff = wrapAngle(p.angle - gx);
    if (Math.abs(diff) < 1.3 && Math.abs(p.angVel) < 2) p.angle -= diff * Math.min(1, 5 * dt);
  }

  const gapPrev = T.inGap(px);
  const gapNow = T.inGap(p.x);
  if (gapPrev && !gapNow && p.x > px && p.y > T.heightAt(gapPrev.x1) + 6) {
    events.push({ type: 'crash', reason: 'wall' });
    return;
  }
  if (gapNow) {
    if (p.y > gapNow.floor) events.push({ type: 'crash', reason: 'fall' });
    return;
  }
  if (p.y >= T.heightAt(p.x)) land(p, T, events);
}

function land(p, T, events) {
  const th = Math.atan(T.slopeAt(p.x));
  const diff = wrapAngle(p.angle - th);
  p.y = T.heightAt(p.x);
  if (Math.abs(diff) > PHYS.safeLand) {
    events.push({ type: 'crash', reason: 'landing' });
    return;
  }
  const flips = Math.floor((Math.abs(p.flipAcc) + 0.6) / TAU);
  const vt = p.vx * Math.cos(th) + p.vy * Math.sin(th);
  let speed = Math.max(vt, PHYS.minSpeed);
  const perfect = flips > 0 && Math.abs(diff) < PHYS.perfectLand;
  if (perfect) speed *= 1.06;
  speed += flips * 70;
  p.speed = Math.min(speed, PHYS.maxSpeed);
  p.grounded = true;
  p.angle = th;
  p.angVel = 0;
  p.jumped = false;
  if (p.airTime > 0.12) events.push({ type: 'land', flips, perfect, airTime: p.airTime });
  p.flipAcc = 0;
}
