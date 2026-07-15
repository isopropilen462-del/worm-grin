import {
  ALL_WEAPONS,
  PHYSICS,
  WEAPON,
  WORLD,
  type GameOptions,
  type GameState,
  type MatchMode,
  type WeaponKind,
  type Winner,
} from './constants';
import { Camera } from './Camera';
import { Input } from './Input';
import { startLoop, type LoopHandle } from './loop';
import { Terrain } from './Terrain';
import { createTeams, type Team } from './Team';
import { Wind } from './Wind';
import { TurnSystem } from './TurnSystem';
import { AiController } from './AiController';
import { FallingMissile, Projectile } from './Projectile';
import { AirstrikeMarker } from './AirstrikeMarker';
import { pickRandomBackground, type BackgroundTheme } from './Background';
import {
  createExplosion,
  updateExplosions,
  type ExplosionEvent,
} from './Explosion';
import { fireWeapon } from './weapons/Weapon';
import { drawBackground } from './render/drawBackground';
import { drawTerrainLayer } from './render/drawTerrain';
import { drawWorm, drawAim } from './render/drawWorm';
import {
  drawProjectile,
  drawExplosion,
  drawFallingMissile,
  drawAirstrikeMarker,
} from './render/drawProjectile';
import { drawCanvasHud } from './render/drawHud';

export class Game {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private input: Input;
  private camera = new Camera();
  private terrain = new Terrain();
  private wind = new Wind();
  private turns = new TurnSystem();
  private ai = new AiController();
  private teams: [Team, Team] | null = null;
  private projectiles: Projectile[] = [];
  private missiles: FallingMissile[] = [];
  private airstrikes: AirstrikeMarker[] = [];
  private explosions: ExplosionEvent[] = [];
  private background: BackgroundTheme = pickRandomBackground();
  private state: GameState = 'menu';
  private mode: MatchMode = 'ai';
  private loop: LoopHandle | null = null;
  private paused = false;
  private viewWidth = 900;
  private viewHeight = 560;
  private time = 0;
  private onMatchEnd?: (winner: Winner) => void;
  private menuEl: HTMLElement | null = null;
  private gameOverEl: HTMLElement | null = null;
  private resultEl: HTMLElement | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    ui: {
      menuEl?: HTMLElement | null;
      gameOverEl?: HTMLElement | null;
      resultEl?: HTMLElement | null;
    },
    options: GameOptions = {},
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D not supported');
    this.canvas = canvas;
    this.ctx = ctx;
    this.input = new Input();
    this.input.attach(canvas);
    this.onMatchEnd = options.onMatchEnd;
    this.menuEl = ui.menuEl ?? null;
    this.gameOverEl = ui.gameOverEl ?? null;
    this.resultEl = ui.resultEl ?? null;

    this.resize();
    window.addEventListener('resize', this.resize);
    this.bindUi();
    this.showMenu();
    this.loop = startLoop((dt) => this.update(dt), () => this.render());
  }

  private bindUi(): void {
    this.menuEl?.querySelectorAll('[data-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = (btn as HTMLElement).dataset.mode as MatchMode;
        this.start(mode);
      });
    });
    this.gameOverEl
      ?.querySelector('[data-action="restart"]')
      ?.addEventListener('click', () => this.showMenu());
    document.querySelectorAll('[data-weapon]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const w = (btn as HTMLElement).dataset.weapon as WeaponKind;
        if (this.turns.phase === 'control' || this.turns.phase === 'charging') {
          this.turns.weapon = w;
          this.syncWeaponButtons();
        }
      });
    });
  }

  private syncWeaponButtons(): void {
    document.querySelectorAll('[data-weapon]').forEach((btn) => {
      const el = btn as HTMLElement;
      el.classList.toggle('wg-weapon-active', el.dataset.weapon === this.turns.weapon);
    });
  }

  private weaponFromIndex(index: number): WeaponKind | null {
    if (index < 1 || index > ALL_WEAPONS.length) return null;
    return ALL_WEAPONS[index - 1];
  }

  private resize = (): void => {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.viewWidth = Math.floor(rect.width);
    this.viewHeight = Math.floor(rect.height);
    this.canvas.width = Math.floor(rect.width * dpr);
    this.canvas.height = Math.floor(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  private showMenu(): void {
    this.state = 'menu';
    this.teams = null;
    this.projectiles = [];
    this.missiles = [];
    this.airstrikes = [];
    this.explosions = [];
    this.menuEl?.classList.remove('wg-hidden');
    this.gameOverEl?.classList.add('wg-hidden');
    this.canvas.closest('.wg-root')?.classList.remove('wg-playing');
  }

  private showGameOver(winner: Winner): void {
    this.state = 'gameover';
    this.menuEl?.classList.add('wg-hidden');
    this.gameOverEl?.classList.remove('wg-hidden');
    this.canvas.closest('.wg-root')?.classList.remove('wg-playing');
    if (this.resultEl) {
      const text =
        winner === 'draw'
          ? 'Ничья!'
          : winner === 'player'
            ? 'Победа Grinvich!'
            : this.mode === 'ai'
              ? 'Победа AI!'
              : 'Победа Rivals!';
      this.resultEl.textContent = text;
    }
    this.onMatchEnd?.(winner);
  }

  start(mode: MatchMode): void {
    this.mode = mode;
    this.background = pickRandomBackground();
    this.terrain = new Terrain();
    this.wind.reset();
    const spawnsA = this.terrain.findSpawnPoints(3, 'left');
    const spawnsB = this.terrain.findSpawnPoints(3, 'right');
    this.teams = createTeams(spawnsA, spawnsB);
    this.projectiles = [];
    this.missiles = [];
    this.airstrikes = [];
    this.explosions = [];
    this.turns.startMatch(this.teams, this.wind);
    this.ai.reset();
    this.state = 'playing';
    this.menuEl?.classList.add('wg-hidden');
    this.gameOverEl?.classList.add('wg-hidden');
    this.canvas.closest('.wg-root')?.classList.add('wg-playing');
    this.syncWeaponButtons();

    const w = this.turns.activeWorm;
    if (w) {
      this.camera.reset(w.cx - this.viewWidth / 2, w.cy - this.viewHeight / 2);
    }
  }

  restart(): void {
    this.showMenu();
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  destroy(): void {
    this.loop?.stop();
    this.input.destroy();
    window.removeEventListener('resize', this.resize);
  }

  private isAiControlling(): boolean {
    return this.mode === 'ai' && this.turns.teamIndex === 1;
  }

  private allWorms() {
    if (!this.teams) return [];
    return [...this.teams[0].worms, ...this.teams[1].worms];
  }

  private isResolving(): boolean {
    return (
      this.projectiles.some((p) => p.alive) ||
      this.missiles.some((m) => m.alive) ||
      this.airstrikes.some((a) => a.alive) ||
      this.explosions.length > 0
    );
  }

  private update(dt: number): void {
    if (this.paused || this.state !== 'playing' || !this.teams) {
      this.time += dt;
      return;
    }

    this.time += dt;
    this.input.beginFrame();

    const active = this.turns.activeWorm;
    const worms = this.allWorms();

    // Jump & movement input BEFORE physics (fixes missed jumps)
    if (
      active &&
      active.alive &&
      !this.isAiControlling() &&
      (this.turns.phase === 'control' || this.turns.phase === 'charging')
    ) {
      active.handleJumpInput(this.input.jumpPressed || this.input.jump, dt);

      if (this.turns.phase === 'control') {
        if (this.input.left) active.tryMove(-1);
        if (this.input.right) active.tryMove(1);
      }
    }

    if (this.isAiControlling() && active?.alive && this.turns.phase === 'control') {
      // AI movement handled in AiController
    }

    for (const w of worms) {
      w.updatePhysics(dt, this.terrain);
    }

    // Projectiles with worm collision
    for (const p of this.projectiles) {
      if (!p.alive) continue;
      const boom = p.update(dt, this.terrain, this.wind, PHYSICS.gravity, worms);
      if (boom) this.detonate(p.x, p.y, p.radius, p.damage);
    }
    this.projectiles = this.projectiles.filter((p) => p.alive);

    // Airstrike markers
    for (const a of this.airstrikes) {
      if (!a.alive) continue;
      if (a.update(dt)) {
        a.alive = false;
        this.missiles.push(new FallingMissile(a.x, a.ownerTeam));
      }
    }
    this.airstrikes = this.airstrikes.filter((a) => a.alive);

    // Falling missiles
    for (const m of this.missiles) {
      if (!m.alive) continue;
      if (m.update(dt, this.terrain, worms)) {
        this.detonate(m.x, m.y, m.radius, m.damage);
      }
    }
    this.missiles = this.missiles.filter((m) => m.alive);

    updateExplosions(this.explosions, dt);

    const follow =
      this.missiles.find((m) => m.alive) ??
      this.projectiles.find((p) => p.alive) ??
      (this.explosions[0] ? { x: this.explosions[0].x, y: this.explosions[0].y } : null) ??
      active;
    if (follow) {
      const fx = 'cx' in follow ? follow.cx : follow.x;
      const fy = 'cy' in follow ? follow.cy : follow.y;
      this.camera.follow(fx, fy, this.viewWidth, this.viewHeight, WORLD.width, WORLD.height);
    }

    if (this.turns.phase === 'resolving') {
      if (!this.isResolving()) {
        this.turns.afterResolve();
      }
      this.checkWinner();
      return;
    }

    if (this.turns.phase === 'waiting') {
      if (this.turns.tickWait(dt)) {
        if (this.checkWinner()) return;
        this.turns.advanceTeam(this.teams, this.wind);
        this.ai.reset();
        this.syncWeaponButtons();
      }
      return;
    }

    if (!active || !active.alive) {
      this.turns.forceEndTurn();
      return;
    }

    if (this.turns.tickTimer(dt) === 'timeout') {
      this.turns.forceEndTurn();
      return;
    }

    if (this.isAiControlling()) {
      const result = this.ai.update(dt, active, this.teams[0], this.wind, this.turns, this.terrain);
      if (result) this.applyFire(result);
      this.syncWeaponButtons();
      return;
    }

    const weaponPick = this.weaponFromIndex(this.input.weaponSelect ?? 0);
    if (weaponPick) {
      this.turns.weapon = weaponPick;
      this.syncWeaponButtons();
    }

    if (this.input.aimUp) active.aim = Math.max(-1.4, active.aim - 1.6 * dt);
    if (this.input.aimDown) active.aim = Math.min(0.7, active.aim + 1.6 * dt);

    if (this.input.pointerActive) {
      const wx = this.input.pointerX + this.camera.x;
      const wy = this.input.pointerY + this.camera.y;
      const dx = (wx - active.cx) * active.facing;
      const dy = wy - active.cy;
      active.aim = Math.max(-1.4, Math.min(0.7, Math.atan2(dy, Math.max(8, dx))));
      if (wx < active.cx) active.facing = -1;
      else if (wx > active.cx) active.facing = 1;
    }

    const instantWeapons: WeaponKind[] = ['melee', 'shotgun', 'airstrike', 'dynamite'];

    if (this.turns.phase === 'control') {
      if (this.input.firePressed) {
        if (instantWeapons.includes(this.turns.weapon)) {
          this.applyFire(fireWeapon(this.turns.weapon, active, 1, this.terrain));
        } else {
          this.turns.phase = 'charging';
          this.turns.charging = true;
          this.turns.charge = 0;
        }
      }
    } else if (this.turns.phase === 'charging') {
      this.turns.charge = Math.min(1, this.turns.charge + dt / WEAPON.chargeTime);
      if (this.input.fireReleased || this.turns.charge >= 1) {
        this.applyFire(fireWeapon(this.turns.weapon, active, this.turns.charge, this.terrain));
      }
    }
  }

  private applyFire(result: ReturnType<typeof fireWeapon>): void {
    if (result.projectiles?.length) {
      this.projectiles.push(...result.projectiles);
      this.turns.endShot();
    } else if (result.airstrike) {
      this.airstrikes.push(result.airstrike);
      this.turns.endShot();
    } else if (result.melee) {
      const m = result.melee;
      for (const w of this.allWorms()) {
        if (!w.alive) continue;
        if (this.turns.activeWorm && w === this.turns.activeWorm) continue;
        const d = Math.hypot(w.cx - m.x, w.cy - m.y);
        if (d < WEAPON.meleeRange) {
          w.damage(m.damage);
          w.applyImpulse(m.knockX, m.knockY);
        }
      }
      this.explosions.push(createExplosion(m.x, m.y, 18, 0));
      this.turns.endShot();
      this.turns.afterResolve();
    }
  }

  private detonate(x: number, y: number, radius: number, damage: number): void {
    this.terrain.carveCircle(x, y, radius * 0.85);
    this.explosions.push(createExplosion(x, y, radius, damage));
    for (const w of this.allWorms()) {
      if (!w.alive) continue;
      const d = Math.hypot(w.cx - x, w.cy - y);
      if (d < radius * 1.35) {
        const falloff = 1 - d / (radius * 1.35);
        w.damage(damage * falloff);
        const ang = Math.atan2(w.cy - y, w.cx - x);
        const force = 320 * falloff;
        w.applyImpulse(Math.cos(ang) * force, Math.sin(ang) * force - 80);
      }
    }
  }

  private checkWinner(): boolean {
    if (!this.teams) return false;
    const a = this.teams[0].isAlive;
    const b = this.teams[1].isAlive;
    if (a && b) return false;
    let winner: Winner;
    if (!a && !b) winner = 'draw';
    else if (a) winner = 'player';
    else winner = 'opponent';
    this.showGameOver(winner);
    return true;
  }

  private render(): void {
    const ctx = this.ctx;
    const vw = this.viewWidth;
    const vh = this.viewHeight;
    ctx.clearRect(0, 0, vw, vh);

    drawBackground(ctx, vw, vh, this.camera.x, this.time, this.background);
    drawTerrainLayer(
      ctx,
      this.terrain,
      this.camera.x,
      this.camera.y,
      vw,
      vh,
      this.time,
      this.background,
    );

    if (this.teams) {
      for (const w of this.allWorms()) {
        drawWorm(
          ctx,
          w,
          this.camera.x,
          this.camera.y,
          w === this.turns.activeWorm && this.state === 'playing',
        );
      }
      const active = this.turns.activeWorm;
      if (
        active &&
        active.alive &&
        this.state === 'playing' &&
        !this.isAiControlling() &&
        (this.turns.phase === 'control' || this.turns.phase === 'charging')
      ) {
        drawAim(ctx, active, this.camera.x, this.camera.y, this.turns.charge);
      }
    }

    for (const a of this.airstrikes) {
      if (a.alive) {
        const gy = this.terrain.groundY(a.x, 40, WORLD.waterLevel) ?? WORLD.waterLevel - 20;
        drawAirstrikeMarker(ctx, a, this.camera.x, this.camera.y, gy);
      }
    }

    for (const p of this.projectiles) {
      if (p.alive) drawProjectile(ctx, p, this.camera.x, this.camera.y);
    }
    for (const m of this.missiles) {
      if (m.alive) drawFallingMissile(ctx, m, this.camera.x, this.camera.y);
    }
    for (const e of this.explosions) {
      drawExplosion(ctx, e, this.camera.x, this.camera.y);
    }

    if (this.state === 'playing' && this.teams) {
      drawCanvasHud(
        ctx,
        vw,
        this.teams,
        this.wind,
        this.turns.timeLeft,
        this.turns.weapon,
        this.teams[this.turns.teamIndex].name,
        this.isAiControlling(),
        this.background,
      );
    }
  }
}
