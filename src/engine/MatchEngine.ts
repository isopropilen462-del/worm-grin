import { AirstrikeMarker } from '../game/AirstrikeMarker';
import { createExplosion, updateExplosions, type ExplosionEvent } from '../game/Explosion';
import { type InputLike, emptyInput } from '../game/Input';
import { FallingMissile, Projectile } from '../game/Projectile';
import { createTeams, type Team } from '../game/Team';
import { Terrain } from '../game/Terrain';
import { TurnSystem } from '../game/TurnSystem';
import { Wind } from '../game/Wind';
import type { Worm } from '../game/Worm';
import { fireWeapon, type FireOptions } from '../game/weapons/Weapon';
import { PHYSICS, WEAPON, WORLD, type WeaponKind, type Winner } from '../game/constants';
import type {
  CarveSnapshot,
  GameSnapshot,
  MissileSnapshot,
  ProjectileSnapshot,
  WormSnapshot,
} from '../net/types';

const STEP = 1 / 60;

/**
 * Renderer-free deterministic game simulation. It is shared by the browser
 * and the authoritative Edge Function; only this class advances online state.
 */
export class MatchEngine {
  private terrain: Terrain;
  private wind = new Wind();
  private turns = new TurnSystem();
  private teams: [Team, Team];
  private projectiles: Projectile[] = [];
  private missiles: FallingMissile[] = [];
  private airstrikes: AirstrikeMarker[] = [];
  private explosions: ExplosionEvent[] = [];
  private carves: CarveSnapshot[] = [];
  private seq = 0;
  private winner: Winner | null = null;

  constructor(seed: number, snapshot?: GameSnapshot) {
    this.terrain = new Terrain(WORLD.width, WORLD.height, seed, true);
    const a = this.terrain.findSpawnPoints(3, 'left');
    const b = this.terrain.findSpawnPoints(3, 'right');
    this.teams = createTeams(a, b);
    this.turns.startMatch(this.teams, this.wind);
    if (snapshot) this.restore(snapshot);
  }

  step(input: InputLike = emptyInput(), duration = STEP): void {
    if (this.winner) return;
    const steps = Math.max(1, Math.ceil(duration / STEP));
    for (let i = 0; i < steps && !this.winner; i++) {
      this.tick(STEP, i === 0 ? input : { ...input, jumpPressed: false, firePressed: false, fireReleased: false, weaponSelect: null });
    }
  }

  private tick(dt: number, input: InputLike): void {
    const active = this.turns.activeWorm;
    const worms = this.allWorms();

    if (this.turns.phase === 'resolving') {
      this.updateWorld(dt, worms);
      if (!this.isResolving()) this.turns.afterResolve();
      this.checkWinner();
      return;
    }

    if (this.turns.phase === 'waiting') {
      this.updateWorld(dt, worms);
      if (this.turns.tickWait(dt)) {
        if (!this.checkWinner()) this.turns.advanceTeam(this.teams, this.wind);
      }
      return;
    }

    if (!active || !active.alive) {
      this.turns.forceEndTurn();
      return;
    }

    const weapon = this.weaponFromIndex(input.weaponSelect ?? 0);
    if (weapon) this.turns.weapon = weapon;

    active.handleJumpInput(input.jumpPressed || input.jump, dt);
    if (this.turns.phase === 'control') {
      if (input.left) active.tryMove(-1);
      if (input.right) active.tryMove(1);
    }
    if (input.aimUp) active.aim = Math.max(-1.4, active.aim - 1.6 * dt);
    if (input.aimDown) active.aim = Math.min(0.7, active.aim + 1.6 * dt);

    if (input.pointerActive) {
      const dx = (input.pointerX - active.cx) * active.facing;
      const dy = input.pointerY - active.cy;
      active.aim = Math.max(-1.4, Math.min(0.7, Math.atan2(dy, Math.max(8, dx))));
      active.facing = input.pointerX < active.cx ? -1 : 1;
    }

    this.updateWorld(dt, worms);
    if (this.turns.tickTimer(dt) === 'timeout') {
      this.turns.forceEndTurn();
      return;
    }

    const instant: WeaponKind[] = ['melee', 'shotgun', 'airstrike', 'dynamite'];
    const fireOpts = this.buildFireOptions(active, input);
    if (this.turns.phase === 'control' && input.firePressed) {
      if (instant.includes(this.turns.weapon)) {
        this.applyFire(fireWeapon(this.turns.weapon, active, 1, this.terrain, fireOpts));
      } else {
        this.turns.phase = 'charging';
        this.turns.charging = true;
        this.turns.charge = 0;
      }
    } else if (this.turns.phase === 'charging') {
      this.turns.charge = Math.min(1, this.turns.charge + dt / WEAPON.chargeTime);
      if (input.fireReleased || this.turns.charge >= 1) {
        this.applyFire(fireWeapon(this.turns.weapon, active, this.turns.charge, this.terrain, fireOpts));
      }
    }
  }

  private updateWorld(dt: number, worms: Worm[]): void {
    for (const worm of worms) worm.updatePhysics(dt, this.terrain);
    for (const projectile of this.projectiles) {
      if (projectile.alive && projectile.update(dt, this.terrain, this.wind, PHYSICS.gravity, worms)) {
        this.detonate(projectile.x, projectile.y, projectile.radius, projectile.damage);
      }
    }
    this.projectiles = this.projectiles.filter((projectile) => projectile.alive);
    for (const airstrike of this.airstrikes) {
      if (airstrike.alive && airstrike.update(dt)) {
        airstrike.alive = false;
        this.missiles.push(new FallingMissile(airstrike.x, airstrike.ownerTeam));
      }
    }
    this.airstrikes = this.airstrikes.filter((airstrike) => airstrike.alive);
    for (const missile of this.missiles) {
      if (missile.alive && missile.update(dt, this.terrain, worms)) {
        this.detonate(missile.x, missile.y, missile.radius, missile.damage);
      }
    }
    this.missiles = this.missiles.filter((missile) => missile.alive);
    updateExplosions(this.explosions, dt);
  }

  private buildFireOptions(active: Worm, input: InputLike): FireOptions | undefined {
    if (this.turns.weapon !== 'airstrike') return undefined;
    const targetX = input.pointerActive
      ? Math.max(40, Math.min(WORLD.width - 40, input.pointerX))
      : Math.max(40, Math.min(WORLD.width - 40, active.cx + Math.cos(active.aim) * active.facing * 700));
    return { targetX };
  }

  private applyFire(result: ReturnType<typeof fireWeapon>): void {
    if (result.projectiles?.length) {
      this.projectiles.push(...result.projectiles);
      this.turns.endShot();
    } else if (result.airstrike) {
      this.airstrikes.push(result.airstrike);
      this.turns.endShot();
    } else if (result.melee) {
      for (const worm of this.allWorms()) {
        const melee = result.melee;
        if (!worm.alive || worm === this.turns.activeWorm) continue;
        if (Math.hypot(worm.cx - melee.x, worm.cy - melee.y) < WEAPON.meleeRange) {
          worm.damage(melee.damage);
          worm.applyImpulse(melee.knockX, melee.knockY);
        }
      }
      this.explosions.push(createExplosion(result.melee.x, result.melee.y, 18, 0));
      this.turns.endShot();
      this.turns.afterResolve();
    }
  }

  private detonate(x: number, y: number, radius: number, damage: number): void {
    const r = radius * 0.85;
    this.terrain.carveCircle(x, y, r);
    this.carves.push({ x, y, r });
    this.explosions.push(createExplosion(x, y, radius, damage));
    for (const worm of this.allWorms()) {
      if (!worm.alive) continue;
      const distance = Math.hypot(worm.cx - x, worm.cy - y);
      if (distance >= radius * 1.35) continue;
      const falloff = 1 - distance / (radius * 1.35);
      worm.damage(damage * falloff);
      const angle = Math.atan2(worm.cy - y, worm.cx - x);
      const force = 320 * falloff;
      worm.applyImpulse(Math.cos(angle) * force, Math.sin(angle) * force - 80);
    }
  }

  private checkWinner(): boolean {
    const a = this.teams[0].isAlive;
    const b = this.teams[1].isAlive;
    if (a && b) return false;
    this.winner = !a && !b ? 'draw' : a ? 'player' : 'opponent';
    return true;
  }

  private isResolving(): boolean {
    return this.projectiles.some((p) => p.alive) ||
      this.missiles.some((m) => m.alive) ||
      this.airstrikes.some((a) => a.alive) ||
      this.explosions.length > 0;
  }

  private allWorms(): Worm[] {
    return [...this.teams[0].worms, ...this.teams[1].worms];
  }

  private weaponFromIndex(index: number): WeaponKind | null {
    return index >= 1 && index <= 6 ? (['bazooka', 'grenade', 'melee', 'shotgun', 'dynamite', 'airstrike'][index - 1] as WeaponKind) : null;
  }

  snapshot(): GameSnapshot {
    this.seq += 1;
    const snapWorm = (worm: Worm): WormSnapshot => ({
      x: worm.x, y: worm.y, vx: worm.vx, vy: worm.vy, hp: worm.hp,
      facing: worm.facing, aim: worm.aim, alive: worm.alive, onGround: worm.onGround,
    });
    const active = this.turns.activeWorm;
    return {
      seq: this.seq,
      wind: this.wind.value,
      teamIndex: this.turns.teamIndex,
      phase: this.turns.phase,
      timeLeft: this.turns.timeLeft,
      weapon: this.turns.weapon,
      charge: this.turns.charge,
      activeTeam: active?.team ?? this.turns.teamIndex,
      activeIndex: active?.index ?? 0,
      teamACursor: this.teams[0].turnCursor,
      teamBCursor: this.teams[1].turnCursor,
      wormsA: this.teams[0].worms.map(snapWorm),
      wormsB: this.teams[1].worms.map(snapWorm),
      projectiles: this.projectiles.map((p): ProjectileSnapshot => ({ x: p.x, y: p.y, vx: p.vx, vy: p.vy, kind: p.kind, fuse: p.fuse, radius: p.radius, damage: p.damage, ownerTeam: p.ownerTeam, stuck: p.stuck, maxTravel: p.maxTravel, traveled: p.traveled })),
      missiles: this.missiles.map((m): MissileSnapshot => ({ x: m.x, y: m.y, vy: m.vy, radius: m.radius, damage: m.damage, ownerTeam: m.ownerTeam })),
      airstrikes: this.airstrikes.map((a) => ({ x: a.x, fuse: a.fuse, ownerTeam: a.ownerTeam })),
      explosions: this.explosions.map((e) => ({ ...e })),
      carves: this.carves.slice(),
      winner: this.winner,
      camX: 0,
      camY: 0,
    };
  }

  private restore(snapshot: GameSnapshot): void {
    this.seq = snapshot.seq;
    this.wind.value = snapshot.wind;
    this.turns.teamIndex = snapshot.teamIndex;
    this.turns.phase = snapshot.phase;
    this.turns.timeLeft = snapshot.timeLeft;
    this.turns.weapon = snapshot.weapon;
    this.turns.charge = snapshot.charge;
    this.turns.charging = snapshot.phase === 'charging';
    this.teams[0].setTurnCursor(snapshot.teamACursor ?? 0);
    this.teams[1].setTurnCursor(snapshot.teamBCursor ?? 0);
    const restoreWorm = (worm: Worm, state: WormSnapshot) => Object.assign(worm, state);
    snapshot.wormsA.forEach((state, i) => restoreWorm(this.teams[0].worms[i]!, state));
    snapshot.wormsB.forEach((state, i) => restoreWorm(this.teams[1].worms[i]!, state));
    this.turns.activeWorm = this.teams[snapshot.activeTeam].worms[snapshot.activeIndex] ?? null;
    for (const carve of snapshot.carves) this.terrain.carveCircle(carve.x, carve.y, carve.r);
    this.carves = snapshot.carves.slice();
    this.projectiles = snapshot.projectiles.map((s) => Object.assign(new Projectile(s.x, s.y, s.vx, s.vy, s.kind, s.ownerTeam), s));
    this.missiles = snapshot.missiles.map((s) => Object.assign(new FallingMissile(s.x, s.ownerTeam), s));
    this.airstrikes = snapshot.airstrikes.map((s) => Object.assign(new AirstrikeMarker(s.x, s.ownerTeam, s.fuse), s));
    this.explosions = snapshot.explosions.map((s) => ({ ...s }));
    this.winner = snapshot.winner;
  }
}
