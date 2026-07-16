import { WEAPON, type WeaponKind } from './constants';
import type { Team } from './Team';
import type { Worm } from './Worm';
import type { Wind } from './Wind';
import type { TurnSystem } from './TurnSystem';
import type { Terrain } from './Terrain';
import { fireWeapon } from './weapons/Weapon';
import type { FireResult } from './weapons/Weapon';

type AiStage = 'think' | 'aim' | 'charge' | 'done';

const AI_WEAPONS: WeaponKind[] = [
  'bazooka',
  'grenade',
  'melee',
  'shotgun',
  'dynamite',
  'airstrike',
];

/**
 * Simple heuristic AI: pick nearest enemy, aim roughly with wind bias, charge, fire.
 */
export class AiController {
  private stage: AiStage = 'think';
  private timer = 0;
  private targetCharge = 0.55;
  private decidedWeapon: WeaponKind = 'bazooka';

  reset(): void {
    this.stage = 'think';
    this.timer = 0.4 + Math.random() * 0.5;
    this.targetCharge = 0.4 + Math.random() * 0.5;
    this.decidedWeapon = AI_WEAPONS[Math.floor(Math.random() * AI_WEAPONS.length)];
  }

  update(
    dt: number,
    worm: Worm,
    enemies: Team,
    wind: Wind,
    turns: TurnSystem,
    terrain: Terrain,
  ): FireResult | null {
    if (!worm.alive) return null;

    this.timer -= dt;
    const foe = this.nearest(worm, enemies);
    if (!foe) return null;

    if (this.stage === 'think') {
      turns.weapon = this.decidedWeapon;
      if (this.timer > 0) return null;
      this.stage = 'aim';
      this.timer = 0.6;
    }

    worm.facing = foe.cx >= worm.cx ? 1 : -1;

    if (this.decidedWeapon === 'melee') {
      const dist = Math.hypot(foe.cx - worm.cx, foe.cy - worm.cy);
      if (dist > WEAPON.meleeRange * 1.2 && worm.onGround) {
        worm.tryMove(worm.facing);
      }
      if (dist <= WEAPON.meleeRange * 1.1) {
        this.stage = 'done';
        return fireWeapon('melee', worm, 1, terrain);
      }
      if (this.timer < -2) {
        turns.weapon = 'bazooka';
        this.decidedWeapon = 'bazooka';
        this.stage = 'aim';
        this.timer = 0.3;
      }
      return null;
    }

    if (this.decidedWeapon === 'airstrike') {
      worm.aim = Math.atan2(foe.cy - worm.cy, (foe.cx - worm.cx) * worm.facing);
      worm.aim = Math.max(-1.35, Math.min(0.55, worm.aim));
      if (this.timer > 0) return null;
      this.stage = 'done';
      return fireWeapon(this.decidedWeapon, worm, 0.7 + Math.random() * 0.3, terrain, {
        targetX: foe.cx,
      });
    }

    if (this.decidedWeapon === 'dynamite') {
      const blastSafe = WEAPON.dynamiteRadius * 1.5;
      const distToFoe = Math.hypot(foe.cx - worm.cx, foe.cy - worm.cy);
      if (distToFoe < blastSafe * 2 && worm.feetOnGround) {
        worm.tryMove(foe.cx < worm.cx ? 1 : -1);
      }
      if (this.timer > 0) return null;
      this.stage = 'done';
      return fireWeapon('dynamite', worm, 1, terrain, { targetX: foe.cx });
    }

    if (this.decidedWeapon === 'shotgun') {
      const dx = (foe.cx - worm.cx) * worm.facing;
      const dy = foe.cy - worm.cy;
      worm.aim = Math.atan2(dy, Math.max(30, dx));
      if (this.timer > 0) return null;
      this.stage = 'done';
      return fireWeapon('shotgun', worm, 0.65 + Math.random() * 0.35, terrain);
    }

    const dx = (foe.cx - worm.cx) * worm.facing;
    const dy = foe.cy - worm.cy;
    const windBias = -wind.value * 0.0008;
    let desired = Math.atan2(dy, Math.max(40, dx)) + windBias + (Math.random() - 0.5) * 0.15;
    desired = Math.max(-1.35, Math.min(0.55, desired));
    worm.aim += (desired - worm.aim) * Math.min(1, dt * 4);

    if (Math.abs(dx) > 420 && worm.onGround && Math.random() < 0.02) {
      worm.handleJumpInput(true, dt);
    }

    if (this.stage === 'aim') {
      if (this.timer > 0) return null;
      this.stage = 'charge';
      this.timer = 0;
      turns.charging = true;
      turns.charge = 0;
      turns.phase = 'charging';
    }

    if (this.stage === 'charge') {
      turns.charge = Math.min(1, turns.charge + dt / WEAPON.chargeTime);
      if (turns.charge >= this.targetCharge) {
        this.stage = 'done';
        turns.charging = false;
        const result = fireWeapon(this.decidedWeapon, worm, turns.charge, terrain);
        turns.charge = 0;
        return result;
      }
    }

    return null;
  }

  private nearest(worm: Worm, enemies: Team): Worm | null {
    let best: Worm | null = null;
    let bestD = Infinity;
    for (const e of enemies.aliveWorms) {
      const d = Math.hypot(e.cx - worm.cx, e.cy - worm.cy);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }
}
