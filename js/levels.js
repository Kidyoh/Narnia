// Level definitions and the builder that turns them into terrain + entities.
import { mulberry32 } from './rng.js';
import { Terrain } from './terrain.js';

export const PALETTES = {
  day: {
    skyTop: '#f6f7dc', sky: '#fbfbe9', haze: '#eef2d2',
    grass: '#a8d058', grassDark: '#8fbb45', meadow: '#b4d866',
    bush: '#5f9a48', bushLight: '#74ab52', bushDark: '#3f7139', cypress: '#2f5c34',
    ink: '#24402a', cliff: '#6b8a3c', mountain: '#a9c48f', snow: '#f4f6e4', mist: 0,
  },
  bright: {
    skyTop: '#f3f8d8', sky: '#fcfce8', haze: '#eaf2cc',
    grass: '#afd65a', grassDark: '#93c046', meadow: '#bfdf6c',
    bush: '#629f49', bushLight: '#7bb456', bushDark: '#3e743a', cypress: '#2c5a33',
    ink: '#24402a', cliff: '#6a8b3a', mountain: '#a3c48a', snow: '#f6f8e6', mist: 0,
  },
  golden: {
    skyTop: '#f6d9a8', sky: '#fcefd3', haze: '#f3dfb6',
    grass: '#b9c955', grassDark: '#a0b044', meadow: '#c6cf68',
    bush: '#6f9142', bushLight: '#87a54f', bushDark: '#4c6c35', cypress: '#3a5530',
    ink: '#3b3a24', cliff: '#7d7d3a', mountain: '#c7b98a', snow: '#fbf1dc', mist: 0.15,
  },
  mist: {
    skyTop: '#e7ede0', sky: '#f2f5ea', haze: '#e5ebdc',
    grass: '#a3c964', grassDark: '#8bb251', meadow: '#b0cf78',
    bush: '#5f9152', bushLight: '#73a160', bushDark: '#416c41', cypress: '#2f5537',
    ink: '#28402e', cliff: '#6a8448', mountain: '#b4c6ad', snow: '#f5f7f0', mist: 0.55,
  },
  summit: {
    skyTop: '#dcebe6', sky: '#eef5ec', haze: '#dfeadf',
    grass: '#a2cc62', grassDark: '#86b14d', meadow: '#b3d57a',
    bush: '#58934e', bushLight: '#6ea65d', bushDark: '#3a6b3e', cypress: '#2a5535',
    ink: '#223c2c', cliff: '#667f4a', mountain: '#9fb8a6', snow: '#ffffff', mist: 0.2,
  },
};

// mix: weights for each kind of beat. Larger numbers mean the beat shows up more often.
export const LEVELS = [
  {
    name: 'The Meadow', subtitle: 'Where the journey begins', seed: 1101, length: 13000, palette: 'day',
    amp: [50, 100], len: [520, 760], drift: 30, gapW: [0, 0],
    script: ['roll', 'rock', 'roll', 'roll', 'rock', 'big', 'roll', 'rock', 'roll', 'big', 'roll'],
    mix: { roll: 3, rock: 3, big: 2 },
    tips: {
      start: 'Tap to jump',
      rock: 'Jump over the rocks!',
      big: 'Hold in the air to flip. Let go before you land!',
    },
  },
  {
    name: 'Cypress Row', subtitle: 'Between the tall trees', seed: 2207, length: 16000, palette: 'bright',
    amp: [60, 130], len: [500, 740], drift: 40, gapW: [0, 0],
    mix: { roll: 3, rock: 4, rock2: 1, big: 2 },
    tips: { rock2: 'Two rocks: jump early!' },
  },
  {
    name: 'Rolling Downs', subtitle: 'Mind the gaps', seed: 3313, length: 18500, palette: 'day',
    amp: [70, 150], len: [520, 760], drift: 45, gapW: [110, 150],
    script: ['roll', 'roll', 'gap'],
    mix: { roll: 3, rock: 3, rock2: 1, big: 2, gap: 2 },
    tips: { gap: 'Jump the gap at the edge!' },
  },
  {
    name: 'Golden Hour', subtitle: 'The sun sinks low', seed: 4421, length: 20500, palette: 'golden',
    amp: [80, 170], len: [500, 760], drift: 50, gapW: [120, 165],
    mix: { roll: 3, rock: 3, rock2: 2, big: 3, gap: 3 },
    tips: {},
  },
  {
    name: 'Misty Heights', subtitle: 'Through the clouds', seed: 5531, length: 22500, palette: 'mist',
    amp: [80, 180], len: [480, 740], drift: 50, gapW: [130, 175],
    mix: { roll: 2, rock: 3, rock2: 2, big: 3, gap: 3 },
    tips: {},
  },
  {
    name: 'The Summit', subtitle: 'The top of the world', seed: 6661, length: 23500, palette: 'summit',
    amp: [90, 190], len: [480, 740], drift: 40, gapW: [130, 175],
    mix: { roll: 2, rock: 3, rock2: 2, big: 3, gap: 3 },
    summit: true,
    tips: {},
  },
];

export function buildLevel(index) {
  const def = LEVELS[index];
  const rng = mulberry32(def.seed);
  const R = (a, b) => a + (b - a) * rng();
  const pts = [
    { x: -2000, y: 0 },
    { x: -400, y: 0 },
    { x: 250, y: 0 },
  ];
  let x = 250;
  let y = 0;
  const to = (dx, dy) => {
    x += dx;
    y += dy;
    pts.push({ x, y });
  };
  const gaps = [];
  const rocks = [];
  const plans = []; // daisy placements, resolved once the terrain exists
  const flags = [];
  const tips = [];
  const seen = new Set();
  const tip = (kind, at) => {
    if (seen.has(kind)) return;
    seen.add(kind);
    if (def.tips[kind]) tips.push({ x: at, text: def.tips[kind] });
  };
  if (def.tips.start) tips.push({ x: -100, text: def.tips.start });

  // Gentle start.
  to(600, 90);
  to(450, -35);

  const script = def.script ? [...def.script] : [];
  const pool = Object.entries(def.mix);
  const total = pool.reduce((s, [, w]) => s + w, 0);
  const pick = () => {
    let r = rng() * total;
    for (const [k, w] of pool) if ((r -= w) < 0) return k;
    return pool[0][0];
  };
  const flagAt = [def.length / 3, (2 * def.length) / 3];
  let last = '';

  while (x < def.length) {
    if (flags.length < 2 && x > flagAt[flags.length]) {
      to(260, 15);
      flags.push({ x: x - 100 });
      to(260, 40);
      last = 'flag';
      continue;
    }
    let type = script.length ? script.shift() : pick();
    if (type === last && (type === 'gap' || type === 'rock2')) type = 'roll';
    const amp = R(def.amp[0], def.amp[1]);
    const len = R(def.len[0], def.len[1]);
    switch (type) {
      case 'roll': {
        const x0 = x;
        to(len * 0.5, amp + def.drift);
        to(len * 0.5, -amp * R(0.55, 0.85));
        if (rng() < 0.7) plans.push({ kind: 'line', x0: x0 + len * 0.55, x1: x0 + len * 0.95, off: 34, n: 5 });
        break;
      }
      case 'big': {
        const drop = amp * R(1.8, 2.3);
        to(R(560, 760), drop);
        to(R(420, 560), -drop * R(0.65, 0.8));
        tip('big', x - 900);
        plans.push({ kind: 'line', x0: x + 160, x1: x + 460, off: 160, n: 5, air: true });
        // A steep fall right after the crest throws the sled into the air at speed.
        to(R(240, 300), amp * 1.3);
        to(R(300, 380), amp * 0.4);
        break;
      }
      case 'rock':
      case 'rock2': {
        to(R(300, 380), R(15, 40));
        const x0 = x;
        const L = R(420, 520);
        to(L, R(10, 35));
        const rx = x0 + L * 0.5;
        rocks.push({ x: rx, r: R(17, 22) });
        if (type === 'rock2') rocks.push({ x: rx + 64, r: R(15, 19) });
        const cx = type === 'rock2' ? rx + 32 : rx;
        plans.push({ kind: 'arc', x: cx, peak: 120, half: 120, n: 5 });
        tip(type, rx - 800);
        to(R(300, 400), R(20, 50));
        break;
      }
      case 'gap': {
        // Dip, then climb to the lip so you can't just fly across on speed.
        to(R(380, 460), R(110, 150));
        to(R(300, 360), -R(130, 170));
        to(R(120, 160), -R(5, 15)); // the lip
        const x0 = x;
        const w = R(def.gapW[0], def.gapW[1]);
        x += w;
        y -= R(12, 28); // the far side is a little higher: you have to jump
        pts.push({ x, y });
        gaps.push({ x0, x1: x });
        plans.push({ kind: 'arc', x: (x0 + x) / 2, peak: 110, half: w * 0.6 + 40, n: 5 });
        tip('gap', x0 - 900);
        to(R(320, 400), R(50, 80));
        break;
      }
    }
    last = type;
  }

  let endX;
  if (def.summit) {
    to(500, 80);
    to(700, -300);
    to(650, -380);
    to(550, -280);
    to(500, -60);
    endX = x + 150;
    to(900, 0);
    to(900, 0);
  } else {
    to(500, 60);
    to(400, -10);
    endX = x;
    to(500, 30);
    to(1600, 0);
  }

  const terrain = new Terrain(pts, gaps);
  for (const r of rocks) r.y = terrain.heightAt(r.x);
  for (const f of flags) f.y = terrain.heightAt(f.x);

  const daisies = [];
  for (const pl of plans) {
    if (pl.kind === 'line') {
      for (let i = 0; i < pl.n; i++) {
        const dx = pl.x0 + ((pl.x1 - pl.x0) * i) / (pl.n - 1);
        if (terrain.inGap(dx) || dx > endX - 200) continue;
        const bump = pl.air ? Math.sin((i / (pl.n - 1)) * Math.PI) * 40 : 0;
        daisies.push({ x: dx, y: terrain.heightAt(dx) - pl.off - bump });
      }
    } else {
      const base = terrain.inGap(pl.x) ? Math.min(terrain.heightAt(pl.x - pl.half), terrain.heightAt(pl.x + pl.half)) : null;
      for (let i = 0; i < pl.n; i++) {
        const u = (i / (pl.n - 1)) * 2 - 1;
        const dx = pl.x + u * pl.half;
        const gy = base ?? terrain.heightAt(dx);
        daisies.push({ x: dx, y: gy - 30 - (pl.peak - 30) * (1 - u * u) });
      }
    }
  }
  daisies.sort((a, b) => a.x - b.x);

  return {
    index,
    def,
    palette: PALETTES[def.palette],
    terrain,
    gaps,
    rocks,
    daisies,
    flags,
    tips,
    startX: 0,
    endX,
    endY: terrain.heightAt(endX),
    minX: -1500,
    maxX: x,
  };
}
