// Hillward: game loop, camera, input, effects and menus.
import { LEVELS, buildLevel } from './levels.js';
import { createRun, stepRun, starsFor } from './world.js';
import { botInput } from './bot.js';
import { Background } from './background.js';
import * as D from './draw.js';
import { Sound } from './audio.js';
import { load, save } from './storage.js';
import { clamp } from './rng.js';

const STEP = 1 / 120;
const params = new URLSearchParams(location.search);

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const $ = (id) => document.getElementById(id);
const bg = new Background();
const sound = new Sound();
const data = load();
sound.muted = data.muted;

let W = 0;
let H = 0;
let dpr = 1;
let dprCap = 2; // lowered automatically on slow devices
let grain = null;

const levels = new Map();
function getLevel(i) {
  if (!levels.has(i)) {
    const L = buildLevel(i);
    L.trend = computeTrend(L);
    levels.set(i, L);
  }
  return levels.get(i);
}

const game = {
  mode: 'title', // title | levels | play | paused | complete | ending
  demo: true,
  run: null,
  t: 0,
  acc: 0,
  parts: [],
  floaters: [],
  completeShown: false,
  autopilot: params.has('bot'),
};
const cam = { x: 0, y: 0, zoom: 1, zoomScale: 1, dy: 0 };
const input = { pointers: new Set(), key: false, queue: 0 };
const held = () => input.pointers.size > 0 || input.key;

// ---------- sizing ----------
function resize() {
  W = window.innerWidth;
  H = window.innerHeight;
  dpr = Math.min(window.devicePixelRatio || 1, dprCap);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  grain = makeGrain();
}
// Portrait phones see ~760 world units across; landscape sees at least ~520 tall.
const baseScale = () => Math.min(W / 760, H / 520);

function makeGrain() {
  const c = document.createElement('canvas');
  c.width = c.height = 160;
  const g = c.getContext('2d');
  const img = g.createImageData(160, 160);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random();
    const dark = v < 0.5;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = dark ? 40 : 255;
    img.data[i + 3] = Math.random() < 0.35 ? (dark ? 14 : 18) : 0;
  }
  g.putImageData(img, 0, 0);
  return ctx.createPattern(c, 'repeat');
}

// Smoothed terrain height so the backdrop drifts with the overall slope, not every bump.
function computeTrend(L) {
  const stepX = 100;
  const x0 = L.minX - 2000;
  const n = Math.ceil((L.maxX + 4000 - x0) / stepX);
  const raw = new Float32Array(n);
  for (let i = 0; i < n; i++) raw[i] = L.terrain.heightAt(x0 + i * stepX);
  const out = new Float32Array(n);
  const half = 15;
  for (let i = 0; i < n; i++) {
    let s = 0;
    let c = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(n - 1, i + half); j++) {
      s += raw[j];
      c++;
    }
    out[i] = s / c;
  }
  return { x0, stepX, ys: out };
}

function trendAt(L, x) {
  const t = L.trend;
  const f = clamp((x - t.x0) / t.stepX, 0, t.ys.length - 1.001);
  const i = Math.floor(f);
  return t.ys[i] + (t.ys[i + 1] - t.ys[i]) * (f - i);
}

// ---------- flow ----------
function startDemo() {
  game.demo = true;
  game.run = createRun(getLevel(0));
  game.parts = [];
  game.floaters = [];
  snapCamera();
}

function startLevel(i) {
  game.demo = false;
  game.mode = 'play';
  game.run = createRun(getLevel(i));
  game.parts = [];
  game.floaters = [];
  game.completeShown = false;
  input.queue = 0;
  showScreen(null);
  $('hud').classList.remove('hidden');
  buildHudFlags();
  const def = LEVELS[i];
  showBanner(`${i + 1}. ${def.name}`, def.subtitle);
  sound.startMusic(def.seed % 97);
  snapCamera();
}

function showScreen(id) {
  for (const s of ['screen-title', 'screen-levels', 'screen-pause', 'screen-complete', 'screen-ending']) {
    $(s).classList.toggle('hidden', s !== id);
  }
  if (id !== null) hideTip();
}

function toTitle() {
  game.mode = 'title';
  $('hud').classList.add('hidden');
  sound.stopMusic();
  if (!game.demo) startDemo();
  showScreen('screen-title');
  $('btn-play').textContent = data.unlocked > 1 || data.stars.length ? 'Continue' : 'Play';
}

function toLevels() {
  game.mode = 'levels';
  $('hud').classList.add('hidden');
  sound.stopMusic();
  if (!game.demo) startDemo();
  renderLevelList();
  showScreen('screen-levels');
}

function pause() {
  if (game.mode !== 'play') return;
  game.mode = 'paused';
  sound.stopMusic();
  showScreen('screen-pause');
}

function resume() {
  game.mode = 'play';
  input.queue = 0;
  input.pointers.clear();
  showScreen(null);
  sound.startMusic(game.run.level.def.seed % 97);
}

function renderLevelList() {
  const list = $('level-list');
  list.innerHTML = '';
  LEVELS.forEach((def, i) => {
    const locked = i >= data.unlocked;
    const b = document.createElement('button');
    b.className = 'level' + (locked ? ' locked' : '');
    const stars = data.stars[i] || 0;
    b.innerHTML = `
      <span class="num">${locked ? '&#128274;' : i + 1}</span>
      <span class="info"><div class="name"></div><div class="desc"></div></span>
      <span class="mini-stars">${[0, 1, 2].map((k) => `<span class="${k < stars ? 'on' : ''}">&#9733;</span>`).join('')}</span>`;
    b.querySelector('.name').textContent = def.name;
    b.querySelector('.desc').textContent = locked ? 'Finish the previous hill to unlock' : def.subtitle;
    b.disabled = locked;
    b.addEventListener('click', () => {
      sound.unlock();
      sound.play('click');
      startLevel(i);
    });
    list.appendChild(b);
  });
}

function showComplete() {
  const run = game.run;
  const i = run.level.index;
  const stars = starsFor(run);
  data.stars[i] = Math.max(data.stars[i] || 0, stars);
  data.best[i] = Math.max(data.best[i] || 0, run.daisyCount);
  data.unlocked = Math.min(LEVELS.length, Math.max(data.unlocked, i + 2));
  save(data);
  sound.stopMusic();
  $('hud').classList.add('hidden');

  const total = run.level.daisies.length;
  const stats = `
    Daisies <b>${run.daisyCount} / ${total}</b><br>
    Backflips <b>${run.flips}</b> &middot; Perfect landings <b>${run.perfects}</b><br>
    Tumbles <b>${run.crashes}</b> &middot; Time <b>${formatTime(run.time)}</b>`;
  const last = i === LEVELS.length - 1;
  if (last) {
    game.mode = 'ending';
    const all = data.stars.reduce((s, v) => s + (v || 0), 0);
    $('ending-stats').innerHTML = stats + `<br>All hills: <b>${all} / ${LEVELS.length * 3}</b> stars`;
    fillStars($('ending-stars'), stars);
    showScreen('screen-ending');
  } else {
    game.mode = 'complete';
    $('complete-title').textContent = run.crashes === 0 ? 'Clean run!' : 'Hill complete';
    $('complete-stats').innerHTML = stats;
    fillStars($('complete-stars'), stars);
    showScreen('screen-complete');
  }
}

function fillStars(el, n) {
  el.innerHTML = '<span>&#9733;</span><span>&#9733;</span><span>&#9733;</span>';
  [...el.children].forEach((s, k) => {
    if (k < n) setTimeout(() => {
      s.classList.add('on');
      sound.play('daisy', 3 + k * 2);
    }, 350 + k * 300);
  });
}

const formatTime = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

// ---------- HUD, tips, banner ----------
function buildHudFlags() {
  const L = game.run.level;
  const el = $('hud-flags');
  el.innerHTML = '';
  for (const f of L.flags) {
    const d = document.createElement('div');
    d.className = 'hud-flag';
    d.style.left = `${(f.x / L.endX) * 100}%`;
    el.appendChild(d);
  }
}

let lastHud = '';
function updateHud() {
  const run = game.run;
  const L = run.level;
  const prog = clamp(run.player.x / L.endX, 0, 1);
  const key = `${run.daisyCount}|${Math.round(prog * 400)}|${run.checkpoint}`;
  if (key === lastHud) return;
  lastHud = key;
  $('hud-daisies').textContent = `${run.daisyCount}/${L.daisies.length}`;
  $('hud-bar').style.width = `${prog * 100}%`;
  $('hud-marker').style.left = `${prog * 100}%`;
  [...$('hud-flags').children].forEach((f, i) => f.classList.toggle('on', run.checkpoint >= i));
}

let tipTimer = 0;
function showTip(text) {
  const el = $('tip');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(tipTimer);
  tipTimer = setTimeout(hideTip, 3200);
}
function hideTip() {
  $('tip').classList.remove('show');
}

let bannerTimer = 0;
function showBanner(title, sub) {
  $('banner-title').textContent = title;
  $('banner-sub').textContent = sub;
  $('banner').classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => $('banner').classList.remove('show'), 2200);
}

// ---------- effects ----------
function burst(x, y, n, opts) {
  for (let i = 0; i < n; i++) {
    const a = opts.angle + (Math.random() - 0.5) * opts.spread;
    const v = opts.speed * (0.4 + Math.random() * 0.8);
    const life = opts.life * (0.6 + Math.random() * 0.6);
    game.parts.push({
      x, y,
      vx: Math.cos(a) * v + (opts.vx || 0),
      vy: Math.sin(a) * v,
      g: opts.g ?? 600,
      life, max: life,
      size: opts.size * (0.6 + Math.random() * 0.8),
      color: opts.colors[Math.floor(Math.random() * opts.colors.length)],
      kind: opts.kind || 'dot',
      a: Math.random() * 6,
      spin: (Math.random() - 0.5) * 10,
    });
  }
}

function dust(x, y, n, strength = 1) {
  const pal = game.run.level.palette;
  burst(x, y, n, { angle: -Math.PI / 2, spread: 2.2, speed: 160 * strength, life: 0.6, size: 4, colors: [pal.grassDark, pal.grass, pal.meadow], g: 500 });
}

function floater(text, x, y, big = false) {
  game.floaters.push({ text, x, y, t: 0, life: big ? 1.6 : 1.2, big });
}

const FLIPS = ['', 'Backflip!', 'Double backflip!', 'Triple backflip!'];
const CRASH = { rock: 'Bonk!', landing: 'Tumble!', wall: 'Oof!', fall: 'Whoops!' };

function sfx(name, arg) {
  if (!game.demo) sound.play(name, arg);
}

function handle(e) {
  const run = game.run;
  const p = run.player;
  switch (e.type) {
    case 'jump':
      sfx('jump');
      dust(p.x, p.y, 6, 0.7);
      break;
    case 'land':
      dust(p.x, p.y, 4 + Math.round(e.airTime * 8), Math.min(1.6, 0.5 + e.airTime));
      if (e.flips > 0) {
        const t = FLIPS[e.flips] || `${e.flips}x backflip!`;
        floater(e.perfect ? `${t} Perfect!` : t, p.x, p.y - 70, true);
        sfx('flip', e.flips);
        if (e.perfect) sfx('perfect');
      } else sfx('land');
      break;
    case 'daisy':
      sfx('daisy', e.streak);
      burst(e.x, e.y, 8, { angle: 0, spread: Math.PI * 2, speed: 120, life: 0.7, size: 4.5, colors: ['#fffef6', '#fff8d6', '#f2c230'], kind: 'petal', g: 150 });
      break;
    case 'crash':
      sfx('crash');
      if (!game.demo && navigator.vibrate) navigator.vibrate(60);
      dust(e.x, e.y, 18, 1.6);
      floater(CRASH[e.reason] || 'Oops!', e.x, e.y - 80, true);
      break;
    case 'checkpoint':
      sfx('checkpoint');
      floater('Checkpoint', p.x, p.y - 80);
      break;
    case 'tip':
      if (!game.demo) showTip(e.text);
      break;
    case 'finish':
      sfx('finish');
      if (!game.demo) {
        const L = run.level;
        burst(L.endX, L.endY - 190, 40, { angle: -Math.PI / 2, spread: Math.PI * 1.6, speed: 380, life: 1.6, size: 5, colors: ['#fffef6', '#f2c230', '#ffe58f', '#c8553d'], kind: 'petal', g: 260 });
      }
      break;
  }
}

// ---------- simulation ----------
function simStep(dt) {
  const run = game.run;
  let inp = { pressed: false, held: false };
  if (game.demo || game.autopilot) inp = botInput(run);
  else if (game.mode === 'play') {
    inp = { pressed: input.queue > 0, held: held() };
    if (input.queue > 0) input.queue--;
  }
  const ev = [];
  stepRun(run, dt, inp, ev);
  for (const e of ev) handle(e);

  if (game.demo && run.state === 'done' && run.finishTimer > 1.5) startDemo();
  if (!game.demo && run.state === 'done' && run.finishTimer > 1.6 && !game.completeShown && game.mode === 'play') {
    game.completeShown = true;
    showComplete();
  }
}

function updateEffects(dt) {
  for (const q of game.parts) {
    q.vy += q.g * dt;
    q.x += q.vx * dt;
    q.y += q.vy * dt;
    q.a += q.spin * dt;
    q.life -= dt;
  }
  game.parts = game.parts.filter((q) => q.life > 0);
  for (const f of game.floaters) f.t += dt;
  game.floaters = game.floaters.filter((f) => f.t < f.life);
}

function focusPoint() {
  const run = game.run;
  if (run.state === 'crashed' && run.tumble) return { x: run.tumble.x, y: Math.min(run.tumble.y, run.level.terrain.heightAt(run.tumble.x) + 200), speed: 300 };
  const p = run.player;
  return { x: p.x, y: p.y, speed: p.grounded ? p.speed : Math.hypot(p.vx, p.vy) };
}

function cameraTarget() {
  const f = focusPoint();
  const scale = baseScale() / cam.zoom;
  const viewW = W / scale;
  const viewH = H / scale;
  return { x: f.x + viewW * 0.17 + f.speed * 0.1, y: f.y - viewH * 0.06, speed: f.speed };
}

function snapCamera() {
  cam.zoom = 1;
  const t = cameraTarget();
  cam.x = t.x;
  cam.y = t.y;
}

function updateCamera(dt) {
  const t = cameraTarget();
  const zt = 1 + 0.3 * clamp((t.speed - 450) / 550, 0, 1);
  cam.zoom += (zt - cam.zoom) * Math.min(1, dt * 1.2);
  cam.x += (t.x - cam.x) * Math.min(1, dt * 8);
  cam.y += (t.y - cam.y) * Math.min(1, dt * 3.5);
  cam.zoomScale = 1 / cam.zoom;
  cam.dy = cam.y - trendAt(game.run.level, cam.x);
}

// ---------- render ----------
function render() {
  const run = game.run;
  const L = run.level;
  const t = game.t;
  const scale0 = baseScale();
  const scale = scale0 / cam.zoom;
  const progress = game.demo ? 0.15 : (L.index + clamp(run.player.x / L.endX, 0, 1)) / LEVELS.length;

  bg.configure(L.palette, L.def.seed, scale0 * Math.min(dpr, 1.5));
  bg.draw(ctx, cam, W, H, dpr, H / scale0, scale0, progress);

  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * (W / 2 - cam.x * scale), dpr * (H / 2 - cam.y * scale));
  const view = {
    left: cam.x - W / 2 / scale,
    right: cam.x + W / 2 / scale,
    top: cam.y - H / 2 / scale,
    bottom: cam.y + H / 2 / scale,
  };
  D.drawTerrain(ctx, L, view, t);
  D.drawScenery(ctx, L, view);
  D.drawLamp(ctx, L, view, t);
  D.drawFlags(ctx, L, run, view, t);
  D.drawRocks(ctx, L, view);
  D.drawDaisies(ctx, L, run, view, t);
  if (run.state === 'crashed') D.drawTumble(ctx, run, t);
  else D.drawRiders(ctx, run.player, t, { pushing: run.player.pushing && run.player.grounded, blink: run.invuln > 0 });
  D.drawParticles(ctx, game.parts);

  // floating text in screen space
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.textAlign = 'center';
  ctx.lineJoin = 'round';
  for (const f of game.floaters) {
    const sx = W / 2 + (f.x - cam.x) * scale;
    const sy = H / 2 + (f.y - cam.y) * scale - f.t * 50;
    const a = clamp(1 - (f.t / f.life) ** 3, 0, 1);
    const pop = Math.min(1, f.t * 8);
    ctx.globalAlpha = a;
    ctx.font = `italic ${Math.round((f.big ? 26 : 20) * (0.7 + 0.3 * pop))}px Georgia, serif`;
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(251,251,233,0.95)';
    ctx.strokeText(f.text, sx, sy);
    ctx.fillStyle = '#24402a';
    ctx.fillText(f.text, sx, sy);
  }
  ctx.globalAlpha = 1;

  // paper grain, for the printed-illustration feel
  ctx.fillStyle = grain;
  ctx.fillRect(0, 0, W, H);
}

// ---------- loop ----------
// If frames are slow, render at a lower pixel density instead of stuttering.
const perf = { time: 0, frames: 0 };
function adaptQuality(rawDt) {
  if (document.hidden || game.mode === 'paused') return;
  perf.time += rawDt;
  perf.frames++;
  if (perf.time < 2) return;
  const fps = perf.frames / perf.time;
  perf.time = 0;
  perf.frames = 0;
  if (fps < 45 && dpr > 1) {
    dprCap = Math.max(1, dpr - 0.5);
    resize();
  }
}

let last = performance.now();
function frame(now) {
  const rawDt = (now - last) / 1000;
  const dt = Math.min(0.05, rawDt);
  last = now;
  adaptQuality(Math.min(rawDt, 0.5));
  if (game.mode !== 'paused') {
    game.t += dt;
    game.acc += dt;
    while (game.acc >= STEP) {
      game.acc -= STEP;
      simStep(STEP);
    }
    updateEffects(dt);
    updateCamera(dt);
  }
  render();
  if (!game.demo) updateHud();
  sound.tick();
  const p = game.run.player;
  sound.wind(p.grounded ? p.speed : Math.hypot(p.vx, p.vy), !game.demo && game.mode === 'play' && game.run.state === 'play');
  requestAnimationFrame(frame);
}

// ---------- input ----------
function press() {
  sound.unlock();
  if (game.mode === 'play') input.queue = Math.min(input.queue + 1, 2);
}

canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  input.pointers.add(e.pointerId);
  press();
});
const release = (e) => input.pointers.delete(e.pointerId);
window.addEventListener('pointerup', release);
window.addEventListener('pointercancel', release);
window.addEventListener('blur', () => {
  input.pointers.clear();
  input.key = false;
});

const JUMP_KEYS = new Set(['Space', 'ArrowUp', 'KeyW', 'Enter']);
window.addEventListener('keydown', (e) => {
  if (JUMP_KEYS.has(e.code) && game.mode === 'play') {
    e.preventDefault();
    if (!e.repeat) {
      input.key = true;
      press();
    }
  } else if (e.code === 'Escape' || e.code === 'KeyP') {
    if (game.mode === 'play') pause();
    else if (game.mode === 'paused') resume();
  }
});
window.addEventListener('keyup', (e) => {
  if (JUMP_KEYS.has(e.code)) input.key = false;
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
});
window.addEventListener('resize', resize);
document.addEventListener('gesturestart', (e) => e.preventDefault());

// ---------- buttons ----------
function on(id, fn) {
  $(id).addEventListener('click', (e) => {
    e.stopPropagation();
    sound.unlock();
    sound.play('click');
    fn();
  });
}

function syncSoundButtons() {
  const label = `Sound: ${sound.muted ? 'Off' : 'On'}`;
  $('btn-sound').textContent = label;
  $('btn-pause-sound').textContent = label;
}
function toggleSound() {
  sound.setMuted(!sound.muted);
  data.muted = sound.muted;
  save(data);
  syncSoundButtons();
}

on('btn-play', () => {
  const next = Math.min(data.unlocked - 1, LEVELS.length - 1);
  startLevel(next);
});
on('btn-levels', toLevels);
on('btn-back', toTitle);
on('btn-sound', toggleSound);
on('btn-pause-sound', toggleSound);
on('btn-pause', pause);
on('btn-resume', resume);
on('btn-restart', () => startLevel(game.run.level.index));
on('btn-quit', toLevels);
on('btn-next', () => startLevel(Math.min(game.run.level.index + 1, LEVELS.length - 1)));
on('btn-retry', () => startLevel(game.run.level.index));
on('btn-complete-levels', toLevels);
on('btn-ending-levels', toLevels);

// ---------- native app (Android via Capacitor) ----------
const native = !!window.Capacitor?.isNativePlatform?.();
const AppPlugin = native ? window.Capacitor.Plugins?.App : null;
if (AppPlugin) {
  // Hardware back button: step back through the menus, exit only from the title screen.
  AppPlugin.addListener('backButton', () => {
    switch (game.mode) {
      case 'play':
        pause();
        break;
      case 'paused':
        resume();
        break;
      case 'levels':
        toTitle();
        break;
      case 'complete':
      case 'ending':
        toLevels();
        break;
      default:
        AppPlugin.exitApp();
    }
  });
  AppPlugin.addListener('pause', pause);
}

// ---------- install / offline (web only) ----------
if (!native) {
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (!standalone && ios) $('install-hint').textContent = 'Tip: tap Share, then "Add to Home Screen" to play fullscreen.';
  let deferredInstall = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstall = e;
    $('btn-install').classList.remove('hidden');
  });
  on('btn-install', async () => {
    if (!deferredInstall) return;
    deferredInstall.prompt();
    await deferredInstall.userChoice;
    deferredInstall = null;
    $('btn-install').classList.add('hidden');
  });
  if ('serviceWorker' in navigator && location.protocol !== 'file:' && !params.has('nosw')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

// ---------- boot ----------
resize();
syncSoundButtons();
startDemo();
const startAt = params.get('level');
if (startAt !== null) {
  const i = clamp(parseInt(startAt, 10) - 1 || 0, 0, LEVELS.length - 1);
  data.unlocked = Math.max(data.unlocked, i + 1);
  startLevel(i);
} else {
  toTitle();
}
requestAnimationFrame(frame);

// handy for automated tests
window.__hillward = { game, cam, startLevel, getLevel };
