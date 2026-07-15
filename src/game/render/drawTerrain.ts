import type { BackgroundTheme } from '../Background';
import type { Terrain } from '../Terrain';
import { drawWater } from '../Terrain';

export function drawTerrainLayer(
  ctx: CanvasRenderingContext2D,
  terrain: Terrain,
  camX: number,
  camY: number,
  viewW: number,
  viewH: number,
  time: number,
  theme: BackgroundTheme,
): void {
  // Draw visible slice
  terrain.flush();
  ctx.drawImage(
    terrain.canvas as CanvasImageSource,
    camX,
    camY,
    viewW,
    viewH,
    0,
    0,
    viewW,
    viewH,
  );
  drawWater(ctx, camX, camY, viewW, viewH, time, theme.water, theme.waterDeep);
}
