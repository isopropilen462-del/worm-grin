import { WEAPON, type WeaponKind } from './constants';
import { findWormHit } from './Hitbox';
import type { Terrain } from './Terrain';
import type { Wind } from './Wind';
import type { Worm } from './Worm';

export class Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  kind: WeaponKind;
  alive = true;
  fuse = Infinity;
  radius = 48;
  damage = 55;
  ownerTeam: 0 | 1;
  /** Sticky on ground (dynamite). */
  stuck = false;
  /** Pellet — limited travel distance. */
  maxTravel = Infinity;
  traveled = 0;

  constructor(
    x: number,
    y: number,
    vx: number,
    vy: number,
    kind: WeaponKind,
    ownerTeam: 0 | 1,
  ) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.kind = kind;
    this.ownerTeam = ownerTeam;
    this.applyKindStats(kind);
  }

  private applyKindStats(kind: WeaponKind): void {
    switch (kind) {
      case 'grenade':
        this.fuse = WEAPON.grenadeFuse;
        this.radius = WEAPON.grenadeRadius;
        this.damage = WEAPON.grenadeDamage;
        break;
      case 'shotgun':
        this.fuse = Infinity;
        this.radius = WEAPON.shotgunRadius;
        this.damage = WEAPON.shotgunDamage;
        this.maxTravel = WEAPON.shotgunRange;
        break;
      case 'dynamite':
        this.fuse = WEAPON.dynamiteFuse;
        this.radius = WEAPON.dynamiteRadius;
        this.damage = WEAPON.dynamiteDamage;
        this.stuck = true;
        this.vx = 0;
        this.vy = 0;
        break;
      case 'airstrike':
        this.fuse = Infinity;
        this.radius = WEAPON.airstrikeRadius;
        this.damage = WEAPON.airstrikeDamage;
        break;
      default:
        this.fuse = Infinity;
        this.radius = WEAPON.bazookaRadius;
        this.damage = WEAPON.bazookaDamage;
    }
  }

  update(
    dt: number,
    terrain: Terrain,
    wind: Wind,
    gravity: number,
    worms: Worm[],
  ): boolean {
    if (!this.alive) return false;

    if (this.stuck) {
      if (this.kind === 'dynamite') {
        this.fuse -= dt;
        if (this.fuse <= 0) {
          this.alive = false;
          return true;
        }
      }
      return false;
    }

    if (this.kind === 'grenade' || this.kind === 'dynamite') {
      this.fuse -= dt;
      if (this.fuse <= 0 && this.kind === 'grenade') {
        this.alive = false;
        return true;
      }
    }

    const speed = Math.hypot(this.vx, this.vy);
    const steps = Math.max(1, Math.ceil(speed * dt / 8));
    const subDt = dt / steps;

    for (let i = 0; i < steps; i++) {
      this.vx += wind.value * subDt;
      this.vy += gravity * subDt;
      const px = this.x;
      const py = this.y;
      const nx = px + this.vx * subDt;
      const ny = py + this.vy * subDt;
      this.traveled += Math.hypot(nx - px, ny - py);

      if (this.traveled >= this.maxTravel) {
        this.alive = false;
        return true;
      }

      const wormHit = findWormHit(px, py, nx, ny, worms);
      if (wormHit && this.kind !== 'shotgun') {
        this.x = nx;
        this.y = ny;
        this.alive = false;
        return true;
      }

      if (wormHit && this.kind === 'shotgun') {
        this.x = nx;
        this.y = ny;
        this.alive = false;
        wormHit.damage(this.damage);
        const ang = Math.atan2(wormHit.cy - ny, wormHit.cx - nx);
        wormHit.applyImpulse(Math.cos(ang) * 80, Math.sin(ang) * 80 - 40);
        return false;
      }

      if (terrain.isSolid(nx, ny)) {
        if (this.kind === 'grenade') {
          const solidX = terrain.isSolid(nx, py);
          const solidY = terrain.isSolid(px, ny);
          if (solidX) {
            this.vx *= -WEAPON.grenadeBounce;
            this.x += Math.sign(this.vx || 1) * 2;
          } else {
            this.x = nx;
          }
          if (solidY) {
            this.vy *= -WEAPON.grenadeBounce;
            this.vx *= 0.92;
            this.y += Math.sign(this.vy || 1) * 2;
          } else {
            this.y = ny;
          }
          if (Math.hypot(this.vx, this.vy) < 40) {
            this.vx *= 0.5;
            this.vy *= 0.5;
          }
          break;
        }
        this.alive = false;
        this.x = nx;
        this.y = ny;
        return true;
      }

      this.x = nx;
      this.y = ny;
    }

    if (this.x < -50 || this.x > terrain.width + 50 || this.y > terrain.height + 50) {
      this.alive = false;
      return this.kind === 'grenade';
    }
    return false;
  }
}

/** Missile falling from sky for airstrike. */
export class FallingMissile {
  x: number;
  y: number;
  vy: number;
  alive = true;
  ownerTeam: 0 | 1;
  radius = WEAPON.airstrikeRadius;
  damage = WEAPON.airstrikeDamage;

  constructor(x: number, ownerTeam: 0 | 1) {
    this.x = x;
    this.y = -40;
    this.vy = WEAPON.airstrikeSpeed;
    this.ownerTeam = ownerTeam;
  }

  update(dt: number, terrain: Terrain, worms: Worm[]): boolean {
    if (!this.alive) return false;
    const py = this.y;
    this.y += this.vy * dt;
    const ny = this.y;

    const wormHit = findWormHit(this.x, py, this.x, ny, worms);
    if (wormHit || terrain.isSolid(this.x, ny) || this.y > terrain.height) {
      this.alive = false;
      this.y = ny;
      return true;
    }
    return false;
  }
}
