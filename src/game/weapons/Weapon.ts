import { WEAPON, WORLD, type WeaponKind } from '../constants';
import { Projectile } from '../Projectile';
import { AirstrikeMarker } from '../AirstrikeMarker';
import type { Worm } from '../Worm';
import type { Terrain } from '../Terrain';

export interface FireResult {
  projectiles?: Projectile[];
  melee?: { x: number; y: number; damage: number; knockX: number; knockY: number };
  airstrike?: AirstrikeMarker;
}

export interface FireOptions {
  /** World X coordinate for airstrike / dynamite placement. */
  targetX?: number;
}

export function fireWeapon(
  kind: WeaponKind,
  worm: Worm,
  charge: number,
  terrain?: Terrain,
  options?: FireOptions,
): FireResult {
  const power = Math.max(0.15, Math.min(1, charge));
  const angle = worm.aim;
  const dir = worm.facing;

  if (kind === 'melee') {
    const hx = worm.cx + dir * WEAPON.meleeRange * 0.7;
    const hy = worm.cy;
    return {
      melee: {
        x: hx,
        y: hy,
        damage: WEAPON.meleeDamage,
        knockX: dir * WEAPON.meleeForce,
        knockY: -120,
      },
    };
  }

  if (kind === 'airstrike') {
    const tx =
      options?.targetX ??
      Math.max(
        40,
        Math.min(
          WORLD.width - 40,
          worm.cx + Math.cos(angle) * dir * (200 + power * 500),
        ),
      );
    return { airstrike: new AirstrikeMarker(tx, worm.team) };
  }

  if (kind === 'dynamite') {
    const minDist = WEAPON.dynamiteRadius * 1.4;
    let px = options?.targetX ?? worm.cx + dir * minDist;
    let py = worm.feetY - 4;
    if (terrain) {
      const gy = terrain.groundY(px, 40, WORLD.waterLevel);
      if (gy !== null) py = gy - 4;
    }
    return {
      projectiles: [new Projectile(px, py, 0, 0, 'dynamite', worm.team)],
    };
  }

  if (kind === 'shotgun') {
    const pellets: Projectile[] = [];
    const baseSpeed = WEAPON.shotgunSpeed * power;
    const muzzleX = worm.cx + Math.cos(angle) * dir * 20;
    const muzzleY = worm.cy + Math.sin(angle) * 16 - 4;
    const centerAng = Math.atan2(Math.sin(angle), Math.cos(angle) * dir);
    for (let i = 0; i < WEAPON.shotgunPellets; i++) {
      const spread = (i - (WEAPON.shotgunPellets - 1) / 2) * WEAPON.shotgunSpread;
      const a = centerAng + spread;
      pellets.push(
        new Projectile(
          muzzleX,
          muzzleY,
          Math.cos(a) * baseSpeed,
          Math.sin(a) * baseSpeed,
          'shotgun',
          worm.team,
        ),
      );
    }
    return { projectiles: pellets };
  }

  const speed =
    (kind === 'grenade' ? WEAPON.grenadeSpeed : WEAPON.bazookaSpeed) * power;
  const muzzleX = worm.cx + Math.cos(angle) * dir * 22;
  const muzzleY = worm.cy + Math.sin(angle) * 18 - 4;
  const vx = Math.cos(angle) * dir * speed;
  const vy = Math.sin(angle) * speed;

  return {
    projectiles: [new Projectile(muzzleX, muzzleY, vx, vy, kind, worm.team)],
  };
}
