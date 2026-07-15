import { COLORS } from '../constants';
import type { Projectile, FallingMissile } from '../Projectile';
import type { ExplosionEvent } from '../Explosion';
import type { AirstrikeMarker } from '../AirstrikeMarker';

export function drawProjectile(
  ctx: CanvasRenderingContext2D,
  p: Projectile,
  camX: number,
  camY: number,
): void {
  const x = p.x - camX;
  const y = p.y - camY;
  ctx.save();
  ctx.translate(x, y);

  if (p.kind === 'dynamite') {
    const pulse = Math.sin(performance.now() * 0.008) * 0.15 + 1;
    ctx.fillStyle = '#cc2222';
    ctx.fillRect(-5 * pulse, -14, 10 * pulse, 18);
    ctx.fillStyle = COLORS.yellow;
    ctx.fillRect(-3, -18, 6, 5);
    const blink = Math.floor(p.fuse * 4) % 2 === 0;
    if (blink) {
      ctx.fillStyle = '#ff4422';
      ctx.beginPath();
      ctx.arc(0, -20, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    return;
  }

  const ang = Math.atan2(p.vy, p.vx);
  ctx.rotate(ang);

  if (p.kind === 'grenade') {
    ctx.fillStyle = COLORS.black;
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.yellow;
    ctx.fillRect(-2, -10, 4, 5);
    const blink = Math.floor(p.fuse * 6) % 2 === 0;
    if (blink) {
      ctx.fillStyle = '#ff6644';
      ctx.beginPath();
      ctx.arc(0, -12, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (p.kind === 'shotgun') {
    ctx.fillStyle = COLORS.yellow;
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = COLORS.yellow;
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(-8, -5);
    ctx.lineTo(-8, 5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = COLORS.black;
    ctx.fillRect(-10, -3, 6, 6);
  }
  ctx.restore();
}

export function drawFallingMissile(
  ctx: CanvasRenderingContext2D,
  m: FallingMissile,
  camX: number,
  camY: number,
): void {
  const x = m.x - camX;
  const y = m.y - camY;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = COLORS.black;
  ctx.fillRect(-4, -18, 8, 28);
  ctx.fillStyle = COLORS.yellow;
  ctx.beginPath();
  ctx.moveTo(0, -22);
  ctx.lineTo(6, -10);
  ctx.lineTo(-6, -10);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ff8844';
  ctx.beginPath();
  ctx.moveTo(-3, 10);
  ctx.lineTo(0, 18);
  ctx.lineTo(3, 10);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function drawAirstrikeMarker(
  ctx: CanvasRenderingContext2D,
  m: AirstrikeMarker,
  camX: number,
  camY: number,
  groundY: number,
): void {
  const x = m.x - camX;
  const y = groundY - camY;
  const pulse = 1 + Math.sin(performance.now() * 0.012) * 0.2;
  ctx.strokeStyle = 'rgba(255,68,68,0.8)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 14 * pulse, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = COLORS.yellow;
  ctx.beginPath();
  ctx.moveTo(x - 10, y);
  ctx.lineTo(x + 10, y);
  ctx.moveTo(x, y - 10);
  ctx.lineTo(x, y + 10);
  ctx.stroke();
}

export function drawExplosion(
  ctx: CanvasRenderingContext2D,
  e: ExplosionEvent,
  camX: number,
  camY: number,
): void {
  const t = e.age / e.life;
  const x = e.x - camX;
  const y = e.y - camY;
  const r = e.radius * (0.4 + t * 0.8);
  const alpha = 1 - t;
  const g = ctx.createRadialGradient(x, y, 2, x, y, r);
  g.addColorStop(0, `rgba(255,212,0,${0.9 * alpha})`);
  g.addColorStop(0.4, `rgba(255,100,40,${0.55 * alpha})`);
  g.addColorStop(1, `rgba(10,10,10,0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}
