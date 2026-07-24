import { COLORS, PHYSICS, WORLD } from './constants';
import { SeededRng } from './rng';

interface PixelBuffer {
  data: Uint8ClampedArray;
}

/**
 * Destructible terrain as an alpha mask in ImageData.
 * Solid = alpha > 128.
 */
export class Terrain {
  readonly width: number;
  readonly height: number;
  readonly canvas: OffscreenCanvas | HTMLCanvasElement | null;
  private ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
  private data: PixelBuffer;
  private dirty = true;
  private rng: SeededRng;

  constructor(
    width = WORLD.width,
    height = WORLD.height,
    seed?: number,
    headless = false,
  ) {
    this.width = width;
    this.height = height;
    this.rng = new SeededRng(seed ?? ((Math.random() * 0xffffffff) >>> 0));
    if (headless) {
      this.canvas = null;
      this.ctx = null;
      this.data = { data: new Uint8ClampedArray(width * height * 4) };
    } else if (typeof OffscreenCanvas !== 'undefined') {
      this.canvas = new OffscreenCanvas(width, height);
      const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('2d context required for terrain');
      this.ctx = ctx as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
      this.data = this.ctx.createImageData(width, height);
    } else {
      this.canvas = document.createElement('canvas');
      this.canvas.width = width;
      this.canvas.height = height;
      const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('2d context required for terrain');
      this.ctx = ctx as CanvasRenderingContext2D;
      this.data = this.ctx.createImageData(width, height);
    }
    this.generate();
  }

  generate(): void {
    const { width, height } = this;
    const px = this.data.data;
    px.fill(0);
    const r = this.rng;

    const phase1 = r.next() * Math.PI * 2;
    const phase2 = r.next() * Math.PI * 2;
    const phase3 = r.next() * Math.PI * 2;
    const amp1 = 70 + r.next() * 50;
    const amp2 = 25 + r.next() * 25;
    const amp3 = 35 + r.next() * 35;
    const baseOffset = -160 + r.next() * 60;
    const freq1 = 1.8 + r.next() * 0.8;
    const freq2 = 4.2 + r.next() * 1.8;
    const freq3 = 0.6 + r.next() * 0.5;

    for (let x = 0; x < width; x++) {
      const t = x / width;
      const h1 = Math.sin(t * Math.PI * freq1 + phase1) * amp1;
      const h2 = Math.sin(t * Math.PI * freq2 + phase2) * amp2;
      const h3 = Math.sin(t * Math.PI * freq3 + phase3) * amp3;
      const surface = WORLD.waterLevel + baseOffset + h1 + h2 + h3;

      for (let y = 0; y < height; y++) {
        if (y >= surface && y < WORLD.waterLevel + 40) {
          const i = (y * width + x) * 4;
          const depth = (y - surface) / 200;
          const isGrass = y < surface + 8;
          if (isGrass) {
            px[i] = 255;
            px[i + 1] = 212;
            px[i + 2] = 0;
          } else {
            const shade = Math.floor(42 + depth * 40);
            px[i] = shade;
            px[i + 1] = shade - 8;
            px[i + 2] = shade - 18;
          }
          px[i + 3] = 255;
        }
      }
    }

    const caveCount = 2 + Math.floor(r.next() * 3);
    for (let i = 0; i < caveCount; i++) {
      const cx = 120 + r.next() * (width - 240);
      const cy = WORLD.waterLevel - 140 - r.next() * 120;
      const radius = 32 + r.next() * 35;
      this.carveCircle(cx, cy, radius);
    }

    if (r.next() < 0.5) {
      const plateauX = 0.25 + r.next() * 0.5;
      const plateauW = 80 + r.next() * 120;
      const plateauH = 20 + r.next() * 40;
      const px0 = Math.floor(width * plateauX);
      for (let x = px0; x < px0 + plateauW && x < width; x++) {
        const surface = this.groundY(x, 40, WORLD.waterLevel);
        if (surface === null) continue;
        for (let y = surface - plateauH; y < surface; y++) {
          if (y < 0) continue;
          const idx = (y * width + x) * 4;
          const isGrass = y >= surface - plateauH && y < surface - plateauH + 6;
          if (isGrass) {
            px[idx] = 255;
            px[idx + 1] = 212;
            px[idx + 2] = 0;
          } else {
            const shade = 50;
            px[idx] = shade;
            px[idx + 1] = shade - 8;
            px[idx + 2] = shade - 18;
          }
          px[idx + 3] = 255;
        }
      }
    }

    this.ctx?.putImageData(this.data as ImageData, 0, 0);
    this.dirty = false;
  }

  isSolid(x: number, y: number): boolean {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    if (ix < 0 || iy < 0 || ix >= this.width || iy >= this.height) return false;
    return this.data.data[(iy * this.width + ix) * 4 + 3] > 128;
  }

  /** True if any sample in the rectangle is solid. */
  rectSolid(x: number, y: number, w: number, h: number): boolean {
    const step = 3;
    for (let sx = x; sx <= x + w; sx += step) {
      for (let sy = y; sy <= y + h; sy += step) {
        if (this.isSolid(sx, sy)) return true;
      }
      if (this.isSolid(x + w, y) || this.isSolid(x + w, y + h)) return true;
    }
    return this.isSolid(x, y + h) || this.isSolid(x + w, y + h);
  }

  carveCircle(cx: number, cy: number, radius: number): void {
    const r2 = radius * radius;
    const minX = Math.max(0, Math.floor(cx - radius - 1));
    const maxX = Math.min(this.width - 1, Math.ceil(cx + radius + 1));
    const minY = Math.max(0, Math.floor(cy - radius - 1));
    const maxY = Math.min(this.height - 1, Math.ceil(cy + radius + 1));
    const px = this.data.data;

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= r2) {
          px[(y * this.width + x) * 4 + 3] = 0;
        }
      }
    }
    this.dirty = true;
  }

  /** Find ground Y just below a point (feet scan downward). */
  groundY(x: number, fromY: number, maxDrop = 200): number | null {
    for (let dy = 0; dy < maxDrop; dy++) {
      const y = fromY + dy;
      if (this.isSolid(x, y) && !this.isSolid(x, y - 1)) {
        return y;
      }
    }
    return null;
  }

  flush(): void {
    if (!this.dirty || !this.ctx) return;
    this.ctx.putImageData(this.data as ImageData, 0, 0);
    this.dirty = false;
  }

  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
    if (!this.canvas) return;
    this.flush();
    ctx.drawImage(
      this.canvas as CanvasImageSource,
      camX,
      camY,
      ctx.canvas.width,
      ctx.canvas.height,
      0,
      0,
      ctx.canvas.width,
      ctx.canvas.height,
    );
  }

  /** Spawns along left/right hills, feet on surface. */
  findSpawnPoints(count: number, side: 'left' | 'right'): Array<{ x: number; y: number }> {
    const points: Array<{ x: number; y: number }> = [];
    const xMin = side === 'left' ? 80 : this.width * 0.62;
    const xMax = side === 'left' ? this.width * 0.38 : this.width - 80;

    const surfaceY = (x: number): number | null => {
      for (let y = 40; y < WORLD.waterLevel; y++) {
        if (this.isSolid(x, y) && !this.isSolid(x, y - 1)) return y;
      }
      return null;
    };

    const isSafeSpawn = (x: number, y: number): boolean => {
      const halfWidth = PHYSICS.wormWidth / 2;
      const samples = [x - halfWidth + 4, x, x + halfWidth - 4];
      const surfaces = samples.map(surfaceY);
      if (surfaces.some((surface) => surface === null)) return false;

      const surfaceRange =
        Math.max(...(surfaces as number[])) - Math.min(...(surfaces as number[]));
      if (surfaceRange > 10) return false;

      const wormX = x - halfWidth;
      const wormY = y - PHYSICS.wormHeight;
      // Leave a small gap above the feet: ground is allowed below the body,
      // but no terrain may overlap its sides or head.
      return !this.rectSolid(
        wormX + 2,
        wormY + 2,
        PHYSICS.wormWidth - 4,
        PHYSICS.wormHeight - 7,
      );
    };

    const addIfSafe = (x: number): boolean => {
      const y = surfaceY(x);
      if (y === null || !isSafeSpawn(x, y)) return false;
      if (points.some((p) => Math.hypot(p.x - x, p.y - y) < 80)) return false;
      points.push({ x, y });
      return true;
    };

    let attempts = 0;
    while (points.length < count && attempts < 400) {
      attempts++;
      const x = xMin + this.rng.next() * (xMax - xMin);
      addIfSafe(x);
    }

    // Deterministic full scan gives every worm a clear, walkable fallback
    // rather than spawning it inside a random hill.
    for (let x = xMin; points.length < count && x <= xMax; x += 8) {
      addIfSafe(x);
    }

    // Terrain generation always has ground in the side ranges. This only
    // protects against a pathological custom map.
    while (points.length < count) {
      const x = xMin + ((points.length + 1) / (count + 1)) * (xMax - xMin);
      const y = surfaceY(x) ?? WORLD.waterLevel - 80;
      points.push({ x, y });
    }
    return points;
  }
}

export function drawWater(
  ctx: CanvasRenderingContext2D,
  camX: number,
  camY: number,
  viewW: number,
  viewH: number,
  time: number,
  waterColor: string = COLORS.water,
  waterDeep: string = COLORS.waterDeep,
): void {
  const waterScreenY = WORLD.waterLevel - camY;
  if (waterScreenY > viewH) return;
  const g = ctx.createLinearGradient(0, waterScreenY, 0, viewH);
  g.addColorStop(0, waterColor);
  g.addColorStop(1, waterDeep);
  ctx.fillStyle = g;
  ctx.fillRect(0, Math.max(0, waterScreenY), viewW, viewH);

  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = 0; x <= viewW; x += 8) {
    const wx = x + camX;
    const wave = Math.sin(wx * 0.02 + time * 3) * 4 + Math.sin(wx * 0.05 + time * 2) * 2;
    const y = waterScreenY + wave;
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}
