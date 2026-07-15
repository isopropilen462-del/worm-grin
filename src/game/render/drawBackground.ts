import type { BackgroundTheme } from '../Background';

export function drawBackground(
  ctx: CanvasRenderingContext2D,
  viewW: number,
  viewH: number,
  camX: number,
  time: number,
  theme: BackgroundTheme,
): void {
  const g = ctx.createLinearGradient(0, 0, 0, viewH);
  g.addColorStop(0, theme.skyTop);
  g.addColorStop(1, theme.skyBottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, viewW, viewH);

  if (theme.stars) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (let i = 0; i < 60; i++) {
      const sx = ((i * 137.5 + camX * 0.05) % viewW);
      const sy = ((i * 97.3) % (viewH * 0.55));
      const twinkle = 0.4 + Math.sin(time * 2 + i) * 0.3;
      ctx.globalAlpha = twinkle;
      ctx.beginPath();
      ctx.arc(sx, sy, i % 3 === 0 ? 1.5 : 1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  const sunX = viewW * 0.78 - camX * 0.02;
  const sunY = theme.id === 'sunset' ? viewH * 0.42 : viewH * 0.18;
  const sg = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, theme.id === 'sunset' ? 90 : 70);
  sg.addColorStop(0, theme.sunColor);
  sg.addColorStop(1, theme.sunGlow);
  ctx.fillStyle = sg;
  ctx.beginPath();
  ctx.arc(sunX, sunY, theme.id === 'sunset' ? 90 : 70, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = theme.hillColor;
  ctx.beginPath();
  ctx.moveTo(0, viewH);
  for (let x = 0; x <= viewW; x += 20) {
    const wx = x + camX * 0.15;
    const y =
      viewH * 0.55 +
      Math.sin(wx * 0.008 + time * 0.1) * 28 +
      Math.sin(wx * 0.02) * 12;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(viewW, viewH);
  ctx.closePath();
  ctx.fill();

  if (theme.rain) {
    ctx.strokeStyle = 'rgba(180,200,220,0.35)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 80; i++) {
      const rx = ((i * 53 + time * 120) % (viewW + 40)) - 20;
      const ry = ((i * 31 + time * 280) % (viewH + 60)) - 30;
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx - 4, ry + 14);
      ctx.stroke();
    }
  }
}
