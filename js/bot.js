// A simple autopilot: used for the title-screen demo and for the level fairness test.
export function botInput(run) {
  const p = run.player;
  const L = run.level;
  let pressed = false;
  if (p.grounded && run.state === 'play') {
    const v = p.speed;
    for (const r of L.rocks) {
      const dx = r.x - p.x;
      if (dx > 0 && dx < v * 0.36 + 10) pressed = true;
    }
    for (const g of L.gaps) {
      const dx = g.x0 - p.x;
      if (dx > 0 && dx < v * 0.05 + 8) pressed = true;
    }
  }
  return { pressed, held: false };
}
