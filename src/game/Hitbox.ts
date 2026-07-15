import { PHYSICS } from './constants';
import type { Worm } from './Worm';

/** Circle hitbox for worm body — used by projectiles. */
export function wormHitRadius(): number {
  return 16;
}

export function wormHitTest(wx: number, wy: number, worm: Worm): boolean {
  if (!worm.alive) return false;
  const dx = wx - worm.cx;
  const dy = wy - (worm.cy - 2);
  return dx * dx + dy * dy <= wormHitRadius() * wormHitRadius();
}

/** Swept circle vs worm — segment from (x0,y0) to (x1,y1). */
export function segmentHitsWorm(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  worm: Worm,
): boolean {
  if (!worm.alive) return false;
  const cx = worm.cx;
  const cy = worm.cy - 2;
  const r = wormHitRadius() + 3;

  const dx = x1 - x0;
  const dy = y1 - y0;
  const len2 = dx * dx + dy * dy;
  if (len2 < 0.01) {
    return (x0 - cx) ** 2 + (y0 - cy) ** 2 <= r * r;
  }

  let t = ((cx - x0) * dx + (cy - y0) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const px = x0 + t * dx;
  const py = y0 + t * dy;
  return (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
}

export function findWormHit(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  worms: Worm[],
  ignoreTeam?: 0 | 1,
): Worm | null {
  let best: Worm | null = null;
  let bestT = Infinity;
  for (const w of worms) {
    if (!w.alive) continue;
    if (ignoreTeam !== undefined && w.team === ignoreTeam) continue;
    if (!segmentHitsWorm(x0, y0, x1, y1, w)) continue;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len2 = dx * dx + dy * dy || 1;
    let t = ((w.cx - x0) * dx + (w.cy - y0) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    if (t < bestT) {
      bestT = t;
      best = w;
    }
  }
  return best;
}

export { PHYSICS };
