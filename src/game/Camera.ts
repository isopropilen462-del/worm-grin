export class Camera {
  x = 0;
  y = 0;

  follow(
    targetX: number,
    targetY: number,
    viewW: number,
    viewH: number,
    worldW: number,
    worldH: number,
    lerp = 0.12,
  ): void {
    const desiredX = targetX - viewW / 2;
    const desiredY = targetY - viewH * 0.55;
    this.x += (desiredX - this.x) * lerp;
    this.y += (desiredY - this.y) * lerp;
    this.x = Math.max(0, Math.min(worldW - viewW, this.x));
    this.y = Math.max(0, Math.min(Math.max(0, worldH - viewH), this.y));
  }

  reset(x = 0, y = 0): void {
    this.x = x;
    this.y = y;
  }

  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    return { x: wx - this.x, y: wy - this.y };
  }
}
