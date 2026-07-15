import { COLORS, PHYSICS } from '../constants';
import type { Worm } from '../Worm';

const SKIN = '#FFD400';
const SKIN_B = '#FF8A8A';
const HOODIE = '#0A0A0A';

export function drawWorm(
  ctx: CanvasRenderingContext2D,
  worm: Worm,
  camX: number,
  camY: number,
  active: boolean,
): void {
  if (!worm.alive && worm.hp <= 0) {
    // Faint tombstone
    const x = worm.cx - camX;
    const y = worm.feetY - camY;
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = 'bold 14px Space Grotesk, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('RIP', x, y - 8);
    return;
  }

  const x = worm.x - camX;
  const y = worm.y - camY;
  const w = PHYSICS.wormWidth;
  const h = PHYSICS.wormHeight;
  const skin = worm.team === 0 ? SKIN : SKIN_B;

  ctx.save();
  ctx.translate(x + w / 2, y + h);
  ctx.scale(worm.facing, 1);
  ctx.translate(-w / 2, -h);

  // Body
  ctx.fillStyle = HOODIE;
  roundRect(ctx, 4, 14, 20, 18, 6);
  ctx.fill();

  // Head
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.ellipse(14, 10, 11, 11, 0, 0, Math.PI * 2);
  ctx.fill();

  // Mohawk
  ctx.fillStyle = HOODIE;
  ctx.beginPath();
  ctx.moveTo(14, -2);
  ctx.lineTo(18, 8);
  ctx.lineTo(14, 6);
  ctx.lineTo(10, 8);
  ctx.closePath();
  ctx.fill();

  // Eyes
  ctx.fillStyle = COLORS.white;
  ctx.beginPath();
  ctx.ellipse(10, 9, 2.8, 3.2, 0, 0, Math.PI * 2);
  ctx.ellipse(17, 9, 2.8, 3.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COLORS.black;
  ctx.beginPath();
  ctx.arc(10.5, 9.5, 1.3, 0, Math.PI * 2);
  ctx.arc(17.5, 9.5, 1.3, 0, Math.PI * 2);
  ctx.fill();

  // Smile
  ctx.strokeStyle = COLORS.black;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(14, 12, 4, 0.15, Math.PI - 0.15);
  ctx.stroke();

  // Legs
  ctx.fillStyle = HOODIE;
  roundRect(ctx, 6, 30, 7, 8, 2);
  ctx.fill();
  roundRect(ctx, 15, 30, 7, 8, 2);
  ctx.fill();

  ctx.restore();

  // HP + name
  const hx = worm.cx - camX;
  const hy = worm.y - camY - 8;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(hx - 18, hy - 14, 36, 6);
  ctx.fillStyle = worm.team === 0 ? COLORS.yellow : COLORS.teamB;
  ctx.fillRect(hx - 18, hy - 14, 36 * (worm.hp / PHYSICS.maxHp), 6);
  ctx.fillStyle = COLORS.white;
  ctx.font = '600 11px Space Grotesk, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(worm.name, hx, hy - 18);
  ctx.fillText(String(worm.hp), hx, hy - 5);

  if (active) {
    ctx.fillStyle = COLORS.yellow;
    ctx.beginPath();
    ctx.moveTo(hx, hy - 34);
    ctx.lineTo(hx - 6, hy - 24);
    ctx.lineTo(hx + 6, hy - 24);
    ctx.closePath();
    ctx.fill();
  }
}

export function drawAim(
  ctx: CanvasRenderingContext2D,
  worm: Worm,
  camX: number,
  camY: number,
  charge: number,
): void {
  const x = worm.cx - camX;
  const y = worm.cy - camY;
  const len = 36 + charge * 50;
  const ang = worm.aim;
  const dx = Math.cos(ang) * worm.facing * len;
  const dy = Math.sin(ang) * len;

  ctx.strokeStyle = COLORS.yellow;
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + dx, y + dy);
  ctx.stroke();
  ctx.setLineDash([]);

  if (charge > 0) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(x - 24, y - 40, 48, 8);
    ctx.fillStyle = COLORS.yellow;
    ctx.fillRect(x - 24, y - 40, 48 * charge, 8);
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
