import { PHYSICS, WORLD, type TeamId } from './constants';
import type { Terrain } from './Terrain';

export type WormPose = 'idle' | 'walk' | 'jump' | 'fall';

export class Worm {
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  hp: number;
  team: TeamId;
  index: number;
  facing: 1 | -1 = 1;
  aim = -0.4;
  onGround = false;
  alive = true;
  name: string;
  /** Coyote-time window after leaving ground. */
  coyoteLeft = 0;
  /** Buffered jump press. */
  jumpBuffer = 0;

  constructor(x: number, y: number, team: TeamId, index: number, name: string) {
    this.x = x;
    this.y = y - PHYSICS.wormHeight;
    this.team = team;
    this.index = index;
    this.hp = PHYSICS.maxHp;
    this.name = name;
    this.facing = team === 0 ? 1 : -1;
  }

  get cx(): number {
    return this.x + PHYSICS.wormWidth / 2;
  }

  get cy(): number {
    return this.y + PHYSICS.wormHeight / 2;
  }

  get feetY(): number {
    return this.y + PHYSICS.wormHeight;
  }

  get pose(): WormPose {
    if (!this.onGround && this.vy < -40) return 'jump';
    if (!this.onGround) return 'fall';
    if (Math.abs(this.vx) > 20) return 'walk';
    return 'idle';
  }

  damage(amount: number): void {
    if (!this.alive) return;
    this.hp = Math.max(0, this.hp - Math.round(amount));
    if (this.hp <= 0) {
      this.alive = false;
      this.vx = 0;
      this.vy = 0;
    }
  }

  kill(): void {
    this.hp = 0;
    this.alive = false;
    this.vx = 0;
    this.vy = 0;
  }

  applyImpulse(ix: number, iy: number): void {
    if (!this.alive) return;
    this.vx += ix;
    this.vy += iy;
    this.onGround = false;
    this.coyoteLeft = 0;
  }

  /** Call before physics each frame. */
  handleJumpInput(jumpPressed: boolean, dt: number): void {
    if (!this.alive) return;
    if (jumpPressed) this.jumpBuffer = PHYSICS.jumpBuffer;
    else this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);

    const canJump = this.onGround || this.coyoteLeft > 0;
    if (this.jumpBuffer > 0 && canJump) {
      this.vy = -PHYSICS.wormJumpForce;
      this.onGround = false;
      this.coyoteLeft = 0;
      this.jumpBuffer = 0;
    }
  }

  private refreshGround(terrain: Terrain, dt: number): void {
    const w = PHYSICS.wormWidth;
    const feet = this.feetY;
    const mid = this.cx;
    const left = this.x + 5;
    const right = this.x + w - 5;

    const feetSolid =
      terrain.isSolid(mid, feet + 1) ||
      terrain.isSolid(left, feet + 1) ||
      terrain.isSolid(right, feet + 1);
    const headClear =
      !terrain.isSolid(mid, this.y + 4) &&
      !terrain.isSolid(left, this.y + 6) &&
      !terrain.isSolid(right, this.y + 6);

    this.onGround = feetSolid && headClear && Math.abs(this.vy) < 120;
    if (this.onGround) {
      this.coyoteLeft = PHYSICS.coyoteTime;
    } else {
      this.coyoteLeft = Math.max(0, this.coyoteLeft - dt);
    }
  }

  updatePhysics(dt: number, terrain: Terrain): void {
    if (!this.alive) return;

    this.vy += PHYSICS.gravity * dt;
    let nx = this.x + this.vx * dt;
    let ny = this.y + this.vy * dt;
    const w = PHYSICS.wormWidth;
    const h = PHYSICS.wormHeight;

    if (this.vx !== 0) {
      if (terrain.rectSolid(nx, this.y + 2, w, h - 6)) {
        let stepped = false;
        for (let step = 1; step <= 12; step++) {
          if (!terrain.rectSolid(nx, this.y - step, w, h - 6)) {
            ny = this.y - step;
            this.y = ny;
            stepped = true;
            break;
          }
        }
        if (!stepped) {
          nx = this.x;
          this.vx = 0;
        }
      }
    }

    this.x = nx;

    if (this.vy > 0) {
      if (terrain.rectSolid(this.x + 2, ny, w - 4, h)) {
        let gy = ny;
        for (let i = 0; i < 40; i++) {
          if (!terrain.rectSolid(this.x + 2, gy, w - 4, h)) break;
          gy -= 1;
        }
        const fallSpeed = this.vy;
        this.y = gy;
        this.vy = 0;
        if (fallSpeed > PHYSICS.fallDamageThreshold) {
          this.damage((fallSpeed - PHYSICS.fallDamageThreshold) * PHYSICS.fallDamageScale);
        }
      } else {
        this.y = ny;
      }
    } else if (this.vy < 0) {
      if (terrain.rectSolid(this.x + 2, ny, w - 4, h * 0.5)) {
        this.vy = 0;
      } else {
        this.y = ny;
      }
    } else {
      this.y = ny;
    }

    this.refreshGround(terrain, dt);

    if (this.onGround) {
      this.vx *= Math.pow(0.0001, dt);
      if (Math.abs(this.vx) < 5) this.vx = 0;
    }

    if (
      this.feetY >= WORLD.waterLevel ||
      this.y > WORLD.height + 40 ||
      this.x < -80 ||
      this.x > WORLD.width + 80
    ) {
      this.kill();
    }
  }

  tryMove(dir: -1 | 1): void {
    if (!this.alive || !this.onGround) return;
    this.facing = dir;
    this.vx = dir * PHYSICS.wormMoveSpeed;
  }
}
