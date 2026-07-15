import { COLORS, WEAPON_LABELS, type WeaponKind } from '../constants';
import type { Team } from '../Team';
import type { Wind } from '../Wind';
import type { BackgroundTheme } from '../Background';

export function drawCanvasHud(
  ctx: CanvasRenderingContext2D,
  viewW: number,
  teams: [Team, Team],
  wind: Wind,
  timeLeft: number,
  weapon: WeaponKind,
  teamName: string,
  isAiTurn: boolean,
  background: BackgroundTheme,
): void {
  // Top bar background
  ctx.fillStyle = 'rgba(10,10,10,0.55)';
  ctx.fillRect(0, 0, viewW, 52);

  // Team health sums
  const hpA = teams[0].aliveWorms.reduce((s, w) => s + w.hp, 0);
  const hpB = teams[1].aliveWorms.reduce((s, w) => s + w.hp, 0);

  ctx.font = '700 14px Space Grotesk, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillStyle = COLORS.yellow;
  ctx.fillText(`Grinvich ${hpA}`, 16, 22);
  ctx.textAlign = 'right';
  ctx.fillStyle = COLORS.teamB;
  ctx.fillText(`${hpB} Rivals`, viewW - 16, 22);

  ctx.textAlign = 'center';
  ctx.fillStyle = COLORS.white;
  ctx.font = '600 13px Space Grotesk, sans-serif';
  ctx.fillText(`${teamName}${isAiTurn ? ' (AI)' : ''} · ${Math.ceil(timeLeft)}с`, viewW / 2, 20);

  // Wind
  const windLen = Math.min(60, Math.abs(wind.value) * 0.35);
  ctx.fillStyle = COLORS.white;
  ctx.font = '600 11px Space Grotesk, sans-serif';
  ctx.fillText('Ветер', viewW / 2, 40);
  ctx.strokeStyle = COLORS.yellow;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(viewW / 2, 46);
  ctx.lineTo(viewW / 2 + Math.sign(wind.value || 1) * windLen, 46);
  ctx.stroke();

  // Weapon
  ctx.textAlign = 'left';
  ctx.fillStyle = COLORS.yellow;
  ctx.font = '700 12px Space Grotesk, sans-serif';
  ctx.fillText(WEAPON_LABELS[weapon], 16, 42);

  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '600 10px Space Grotesk, sans-serif';
  ctx.fillText(background.label, viewW - 16, 42);
}
