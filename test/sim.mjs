// Headless check that every level can be finished without crashing by a simple autopilot,
// and that doing nothing does crash (so the obstacles actually matter).
import { LEVELS, buildLevel } from '../js/levels.js';
import { createRun, stepRun } from '../js/world.js';
import { botInput } from '../js/bot.js';

const STEP = 1 / 120;
let failed = false;

function play(level, inputFn, maxTime = 400) {
  const run = createRun(level);
  const reasons = [];
  let t = 0;
  let maxSpeed = 0;
  let airborneMax = 0;
  while (run.state !== 'done' && t < maxTime) {
    const ev = [];
    stepRun(run, STEP, inputFn(run), ev);
    for (const e of ev) if (e.type === 'crash') reasons.push(`${e.reason}@${Math.round(e.x)}`);
    maxSpeed = Math.max(maxSpeed, run.player.speed || 0);
    if (!run.player.grounded) airborneMax = Math.max(airborneMax, run.player.airTime);
    t += STEP;
  }
  return { run, reasons, t, maxSpeed, airborneMax };
}

for (let i = 0; i < LEVELS.length; i++) {
  const level = buildLevel(i);
  const bot = play(level, botInput);
  const idle = play(level, () => ({ pressed: false, held: false }), 60);
  const ok = bot.run.state === 'done' && bot.reasons.length === 0;
  if (!ok) failed = true;
  console.log(
    `${ok ? 'PASS' : 'FAIL'} L${i + 1} ${level.def.name.padEnd(14)} ` +
      `len=${Math.round(level.endX)} rocks=${level.rocks.length} gaps=${level.gaps.length} ` +
      `daisies=${bot.run.daisyCount}/${level.daisies.length} time=${bot.t.toFixed(1)}s ` +
      `vmax=${Math.round(bot.maxSpeed)} air=${bot.airborneMax.toFixed(2)}s ` +
      `crashes=[${bot.reasons.join(' ')}] idleCrashes=${idle.reasons.length}`
  );
  if (idle.reasons.length === 0 && level.rocks.length > 0) {
    console.log('  FAIL: idle player never crashed; obstacles have no effect');
    failed = true;
  }
}
process.exit(failed ? 1 : 0);
