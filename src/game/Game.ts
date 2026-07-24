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
import { emptyInput, Input, type InputLike } from './Input';
import { startLoop, type LoopHandle } from './loop';
import { Terrain } from './Terrain';
import { createTeams, type Team } from './Team';
import type { Worm } from './Worm';
import { Wind } from './Wind';
import { TurnSystem } from './TurnSystem';
import { AiController } from './AiController';
import { FallingMissile, Projectile } from './Projectile';
import { AirstrikeMarker } from './AirstrikeMarker';
import {
  backgroundById,
  pickRandomBackground,
  type BackgroundId,
  type BackgroundTheme,
} from './Background';
import {
  createExplosion,
  updateExplosions,
  type ExplosionEvent,
} from './Explosion';
import { fireWeapon, type FireOptions } from './weapons/Weapon';
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
import type { NetSession } from '../net/session';
import { asSeed, finishRoom } from '../net/rooms';
import type {
  CarveSnapshot,
  GameSnapshot,
  InputEvent,
  WormSnapshot,
} from '../net/types';

const STATE_SEND_INTERVAL = 1 / 12;

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
  private lobbyEl: HTMLElement | null = null;

  private net: NetSession | null = null;
  private remoteInput: InputLike = emptyInput();
  private pendingState: GameSnapshot | null = null;
  private carves: CarveSnapshot[] = [];
  private appliedCarveCount = 0;
  private stateSeq = 0;
  private stateSendAcc = 0;
  private unsubNet: Array<() => void> = [];
  private inputSendAcc = 0;
  private guestInputSeq = 0;
  private lastRemoteInputSeq = 0;
  private remoteEvents: InputEvent[] = [];
  private serverStatePollAcc = 0;
  private serverStateRequestPending = false;

  constructor(
    canvas: HTMLCanvasElement,
    ui: {
      menuEl?: HTMLElement | null;
      gameOverEl?: HTMLElement | null;
      resultEl?: HTMLElement | null;
      lobbyEl?: HTMLElement | null;
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
    this.lobbyEl = ui.lobbyEl ?? null;

    this.resize();
    window.addEventListener('resize', this.resize);
    this.bindUi();
    this.showMenu();
    this.loop = startLoop((dt) => this.update(dt), () => this.render());
  }

  private bindUi(): void {
    this.menuEl?.querySelectorAll('[data-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = (btn as HTMLElement).dataset.mode as MatchMode | 'online-lobby';
        if (mode === 'online-lobby') {
          this.showLobby();
          return;
        }
        this.start(mode);
      });
    });
    this.gameOverEl
      ?.querySelector('[data-action="restart"]')
      ?.addEventListener('click', () => this.showMenu());
    this.lobbyEl
      ?.querySelector('[data-action="lobby-back"]')
      ?.addEventListener('click', () => {
        void this.disconnectNet();
        this.showMenu();
      });
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
    this.carves = [];
    this.appliedCarveCount = 0;
    this.pendingState = null;
    this.menuEl?.classList.remove('wg-hidden');
    this.gameOverEl?.classList.add('wg-hidden');
    this.lobbyEl?.classList.add('wg-hidden');
    this.canvas.closest('.wg-root')?.classList.remove('wg-playing');
  }

  /** Open online lobby panel (used by UI / deep links). */
  openLobby(): void {
    this.showLobby();
  }

  private showLobby(): void {
    this.state = 'menu';
    this.menuEl?.classList.add('wg-hidden');
    this.gameOverEl?.classList.add('wg-hidden');
    this.lobbyEl?.classList.remove('wg-hidden');
    this.canvas.closest('.wg-root')?.classList.remove('wg-playing');
  }

  private showGameOver(winner: Winner): void {
    this.state = 'gameover';
    this.menuEl?.classList.add('wg-hidden');
    this.lobbyEl?.classList.add('wg-hidden');
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
    if (this.net?.role === 'host') {
      const finalSnap = this.buildSnapshot();
      finalSnap.winner = winner;
      void this.net.sendState(finalSnap);
      void finishRoom(this.net.roomId, winner);
    }
    void this.disconnectNet();
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
    this.carves = [];
    this.appliedCarveCount = 0;
    this.turns.startMatch(this.teams, this.wind);
    this.ai.reset();
    this.state = 'playing';
    this.menuEl?.classList.add('wg-hidden');
    this.lobbyEl?.classList.add('wg-hidden');
    this.gameOverEl?.classList.add('wg-hidden');
    this.canvas.closest('.wg-root')?.classList.add('wg-playing');
    this.syncWeaponButtons();

    const w = this.turns.activeWorm;
    if (w) {
      this.camera.reset(w.cx - this.viewWidth / 2, w.cy - this.viewHeight / 2);
    }
  }

  /** Host or guest: begin online match from shared seed. */
  startOnline(
    session: NetSession,
    seed: number,
    backgroundId: BackgroundId,
  ): void {
    void this.disconnectNet(false);
    this.net = session;
    this.mode = 'online';
    this.background = backgroundById(backgroundId);
    this.terrain = new Terrain(WORLD.width, WORLD.height, asSeed(seed));
    this.wind.reset();
    const spawnsA = this.terrain.findSpawnPoints(3, 'left');
    const spawnsB = this.terrain.findSpawnPoints(3, 'right');
    this.teams = createTeams(spawnsA, spawnsB);
    this.projectiles = [];
    this.missiles = [];
    this.airstrikes = [];
    this.explosions = [];
    this.carves = [];
    this.appliedCarveCount = 0;
    this.stateSeq = 0;
    this.stateSendAcc = 0;
    this.remoteInput = emptyInput();
    this.guestInputSeq = 0;
    this.lastRemoteInputSeq = 0;
    this.remoteEvents = [];
    this.pendingState = null;
    this.serverStatePollAcc = 0;
    this.serverStateRequestPending = false;
    this.turns.startMatch(this.teams, this.wind);
    this.ai.reset();
    this.state = 'playing';
    this.menuEl?.classList.add('wg-hidden');
    this.lobbyEl?.classList.add('wg-hidden');
    this.gameOverEl?.classList.add('wg-hidden');
    this.canvas.closest('.wg-root')?.classList.add('wg-playing');
    this.syncWeaponButtons();

    this.unsubNet.push(
      session.onInput((snap) => {
        if (snap.seq <= this.lastRemoteInputSeq) return;
        this.lastRemoteInputSeq = snap.seq;
        this.remoteInput = {
          ...this.remoteInput,
          left: snap.left,
          right: snap.right,
          jump: snap.jump,
          fire: snap.fire,
          aimUp: snap.aimUp,
          aimDown: snap.aimDown,
          pointerActive: snap.pointerActive,
          pointerX: snap.pointerX,
          pointerY: snap.pointerY,
        };
        this.remoteEvents.push(...snap.events);
      }),
    );
    this.unsubNet.push(
      session.onState((snap) => {
        if (!this.pendingState || snap.seq >= this.pendingState.seq) {
          this.pendingState = snap;
        }
      }),
    );

    const w = this.turns.activeWorm;
    if (w) {
      this.camera.reset(w.cx - this.viewWidth / 2, w.cy - this.viewHeight / 2);
    }
  }

  private async disconnectNet(clearSession = true): Promise<void> {
    this.unsubNet.forEach((u) => u());
    this.unsubNet = [];
    if (clearSession && this.net) {
      await this.net.destroy();
      this.net = null;
    }
  }

  restart(): void {
    void this.disconnectNet();
    this.showMenu();
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  destroy(): void {
    void this.disconnectNet();
    this.loop?.stop();
    this.input.destroy();
    window.removeEventListener('resize', this.resize);
  }

  private isAiControlling(): boolean {
    return this.mode === 'ai' && this.turns.teamIndex === 1;
  }

  private isMyOnlineTurn(): boolean {
    return !!this.net && this.turns.teamIndex === this.net.seat;
  }

  private controlInput(): InputLike {
    if (!this.net) return this.input;
    if (this.net.role === 'host') {
      return this.turns.teamIndex === 0 ? this.input : this.remoteInput;
    }
    return emptyInput();
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

    if (this.mode === 'online' && this.net) {
      this.updateServerAuthoritativeOnline(dt);
      return;
    }

    // Guest: send snapshots for held controls and immediate, ordered events
    // for presses/releases. A fast mouse/key press must not be lost between
    // 30 Hz heartbeat packets.
    if (this.net?.role === 'guest') {
      const snapshot = this.input.snapshot();
      const events: InputEvent[] = [];
      if (snapshot.jumpPressed) events.push({ type: 'jump' });
      if (snapshot.firePressed) events.push({ type: 'fire-press' });
      if (snapshot.fireReleased) events.push({ type: 'fire-release' });
      if (snapshot.weaponSelect !== null) {
        events.push({ type: 'weapon', weapon: snapshot.weaponSelect });
      }

      this.inputSendAcc += dt;
      if (events.length > 0 || this.inputSendAcc >= 1 / 30) {
        this.inputSendAcc = 0;
        void this.net.sendInput({
          seq: ++this.guestInputSeq,
          left: snapshot.left,
          right: snapshot.right,
          jump: snapshot.jump,
          fire: snapshot.fire,
          aimUp: snapshot.aimUp,
          aimDown: snapshot.aimDown,
          pointerActive: snapshot.pointerActive,
          pointerX: snapshot.pointerX,
          pointerY: snapshot.pointerY,
          events,
        });
      }
      if (this.pendingState) {
        this.applySnapshot(this.pendingState);
        this.pendingState = null;
      }
      return;
    }

    const ctrl = this.controlInput();
    const remoteEvents =
      this.net?.role === 'host' &&
      this.turns.teamIndex === 1 &&
      (this.turns.phase === 'control' || this.turns.phase === 'charging')
        ? this.takeRemoteEvents()
        : [];

    const active = this.turns.activeWorm;
    const worms = this.allWorms();
    const localControl =
      active &&
      active.alive &&
      !this.isAiControlling() &&
      (this.turns.phase === 'control' || this.turns.phase === 'charging');

    if (localControl) {
      const remoteJump = remoteEvents.some((event) => event.type === 'jump');
      active.handleJumpInput(ctrl.jumpPressed || remoteJump || ctrl.jump, dt);
      if (this.turns.phase === 'control') {
        if (ctrl.left) active.tryMove(-1);
        if (ctrl.right) active.tryMove(1);
      }
    }

    for (const w of worms) {
      w.updatePhysics(dt, this.terrain);
    }

    for (const p of this.projectiles) {
      if (!p.alive) continue;
      const boom = p.update(dt, this.terrain, this.wind, PHYSICS.gravity, worms);
      if (boom) this.detonate(p.x, p.y, p.radius, p.damage);
    }
    this.projectiles = this.projectiles.filter((p) => p.alive);

    for (const a of this.airstrikes) {
      if (!a.alive) continue;
      if (a.update(dt)) {
        a.alive = false;
        this.missiles.push(new FallingMissile(a.x, a.ownerTeam));
      }
    }
    this.airstrikes = this.airstrikes.filter((a) => a.alive);

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
      this.maybeSendState(dt);
      this.clearRemoteEdges();
      return;
    }

    if (this.turns.phase === 'waiting') {
      if (this.turns.tickWait(dt)) {
        if (this.checkWinner()) {
          this.maybeSendState(dt, true);
          return;
        }
        this.turns.advanceTeam(this.teams, this.wind);
        this.ai.reset();
        this.syncWeaponButtons();
      }
      this.maybeSendState(dt);
      this.clearRemoteEdges();
      return;
    }

    if (!active || !active.alive) {
      this.turns.forceEndTurn();
      this.maybeSendState(dt);
      this.clearRemoteEdges();
      return;
    }

    if (this.turns.tickTimer(dt) === 'timeout') {
      this.turns.forceEndTurn();
      this.maybeSendState(dt);
      this.clearRemoteEdges();
      return;
    }

    if (this.isAiControlling()) {
      const result = this.ai.update(dt, active, this.teams[0], this.wind, this.turns, this.terrain);
      if (result) this.applyFire(result);
      this.syncWeaponButtons();
      this.maybeSendState(dt);
      return;
    }

    const remoteWeapon = remoteEvents.find(
      (event): event is Extract<InputEvent, { type: 'weapon' }> =>
        event.type === 'weapon',
    );
    const weaponPick = this.weaponFromIndex(
      remoteWeapon?.weapon ?? ctrl.weaponSelect ?? 0,
    );
    if (weaponPick) {
      this.turns.weapon = weaponPick;
      this.syncWeaponButtons();
    }

    if (ctrl.aimUp) active.aim = Math.max(-1.4, active.aim - 1.6 * dt);
    if (ctrl.aimDown) active.aim = Math.min(0.7, active.aim + 1.6 * dt);

    if (ctrl.pointerActive) {
      const wx = ctrl.pointerX + this.camera.x;
      const wy = ctrl.pointerY + this.camera.y;
      const dx = (wx - active.cx) * active.facing;
      const dy = wy - active.cy;
      active.aim = Math.max(-1.4, Math.min(0.7, Math.atan2(dy, Math.max(8, dx))));
      if (wx < active.cx) active.facing = -1;
      else if (wx > active.cx) active.facing = 1;
    }

    const instantWeapons: WeaponKind[] = ['melee', 'shotgun', 'airstrike', 'dynamite'];
    const fireOpts = this.buildFireOptions(active, ctrl);

    if (this.turns.phase === 'control') {
      const remoteFirePressed = remoteEvents.some(
        (event) => event.type === 'fire-press',
      );
      if (ctrl.firePressed || remoteFirePressed) {
        if (instantWeapons.includes(this.turns.weapon)) {
          this.applyFire(fireWeapon(this.turns.weapon, active, 1, this.terrain, fireOpts));
        } else {
          this.turns.phase = 'charging';
          this.turns.charging = true;
          this.turns.charge = 0;
        }
      }
    } else if (this.turns.phase === 'charging') {
      this.turns.charge = Math.min(1, this.turns.charge + dt / WEAPON.chargeTime);
      const remoteFireReleased = remoteEvents.some(
        (event) => event.type === 'fire-release',
      );
      if (ctrl.fireReleased || remoteFireReleased || this.turns.charge >= 1) {
        this.applyFire(
          fireWeapon(this.turns.weapon, active, this.turns.charge, this.terrain, fireOpts),
        );
      }
    }

    this.maybeSendState(dt);
    this.clearRemoteEdges();
  }

  private takeRemoteEvents(): InputEvent[] {
    const events = this.remoteEvents;
    this.remoteEvents = [];
    return events;
  }

  private clearRemoteEdges(): void {
    // Discrete remote commands are drained by takeRemoteEvents(). This method
    // remains a no-op at early returns so future input fields aren't reset.
  }

  private updateServerAuthoritativeOnline(dt: number): void {
    const session = this.net;
    if (!session) return;

    if (this.pendingState) {
      this.applySnapshot(this.pendingState);
      this.pendingState = null;
    }

    // State lives in Supabase, so a reconnecting or inactive player always
    // catches up without relying on the other browser to broadcast frames.
    this.serverStatePollAcc += dt;
    if (this.serverStatePollAcc >= 0.4 && !this.serverStateRequestPending) {
      this.serverStatePollAcc = 0;
      this.serverStateRequestPending = true;
      void session.fetchAuthoritativeState()
        .then((state) => {
          if (state) this.pendingState = state;
        })
        .catch(() => {
          // The next poll will retry; gameplay continues with the last state.
        })
        .finally(() => {
          this.serverStateRequestPending = false;
        });
    }

    if (!this.isMyOnlineTurn()) return;

    const snapshot = this.input.snapshot();
    const events: InputEvent[] = [];
    if (snapshot.jumpPressed) events.push({ type: 'jump' });
    if (snapshot.firePressed) events.push({ type: 'fire-press' });
    if (snapshot.fireReleased) events.push({ type: 'fire-release' });
    if (snapshot.weaponSelect !== null) {
      events.push({ type: 'weapon', weapon: snapshot.weaponSelect });
    }

    this.inputSendAcc += dt;
    if (events.length === 0 && this.inputSendAcc < 1 / 30) return;
    this.inputSendAcc = 0;

    void session.sendAuthoritativeInput({
      seq: ++this.guestInputSeq,
      left: snapshot.left,
      right: snapshot.right,
      jump: snapshot.jump,
      fire: snapshot.fire,
      aimUp: snapshot.aimUp,
      aimDown: snapshot.aimDown,
      pointerActive: snapshot.pointerActive,
      pointerX: snapshot.pointerX + this.camera.x,
      pointerY: snapshot.pointerY + this.camera.y,
      events,
    }).then((state) => {
      if (state) this.pendingState = state;
    }).catch(() => {
      // Keep the local input loop alive; the next heartbeat retries.
    });
  }

  private maybeSendState(dt: number, force = false): void {
    if (!this.net || this.net.role !== 'host') return;
    this.stateSendAcc += dt;
    if (!force && this.stateSendAcc < STATE_SEND_INTERVAL) return;
    this.stateSendAcc = 0;
    void this.net.sendState(this.buildSnapshot());
  }

  private buildSnapshot(): GameSnapshot {
    this.stateSeq += 1;
    const teams = this.teams!;
    const snapWorm = (w: Worm): WormSnapshot => ({
      x: w.x,
      y: w.y,
      vx: w.vx,
      vy: w.vy,
      hp: w.hp,
      facing: w.facing,
      aim: w.aim,
      alive: w.alive,
      onGround: w.onGround,
    });
    const active = this.turns.activeWorm;
    return {
      seq: this.stateSeq,
      wind: this.wind.value,
      teamIndex: this.turns.teamIndex,
      phase: this.turns.phase,
      timeLeft: this.turns.timeLeft,
      weapon: this.turns.weapon,
      charge: this.turns.charge,
      activeTeam: active?.team ?? this.turns.teamIndex,
      activeIndex: active?.index ?? 0,
      teamACursor: teams[0].turnCursor,
      teamBCursor: teams[1].turnCursor,
      wormsA: teams[0].worms.map(snapWorm),
      wormsB: teams[1].worms.map(snapWorm),
      projectiles: this.projectiles.map((p) => ({
        x: p.x,
        y: p.y,
        vx: p.vx,
        vy: p.vy,
        kind: p.kind,
        fuse: p.fuse,
        radius: p.radius,
        damage: p.damage,
        ownerTeam: p.ownerTeam,
        stuck: p.stuck,
        maxTravel: p.maxTravel,
        traveled: p.traveled,
      })),
      missiles: this.missiles.map((m) => ({
        x: m.x,
        y: m.y,
        vy: m.vy,
        radius: m.radius,
        damage: m.damage,
        ownerTeam: m.ownerTeam,
      })),
      airstrikes: this.airstrikes.map((a) => ({
        x: a.x,
        fuse: a.fuse,
        ownerTeam: a.ownerTeam,
      })),
      explosions: this.explosions.map((e) => ({ ...e })),
      carves: this.carves.slice(),
      winner: this.state === 'gameover' ? this.lastWinner() : null,
      camX: this.camera.x,
      camY: this.camera.y,
    };
  }

  private lastWinner(): Winner | null {
    if (!this.teams) return null;
    const a = this.teams[0].isAlive;
    const b = this.teams[1].isAlive;
    if (a && b) return null;
    if (!a && !b) return 'draw';
    if (a) return 'player';
    return 'opponent';
  }

  private applySnapshot(snap: GameSnapshot): void {
    if (!this.teams) return;
    this.wind.value = snap.wind;
    this.turns.teamIndex = snap.teamIndex;
    this.turns.phase = snap.phase;
    this.turns.timeLeft = snap.timeLeft;
    this.turns.weapon = snap.weapon;
    this.turns.charge = snap.charge;
    this.turns.charging = snap.phase === 'charging';
    this.camera.x = snap.camX;
    this.camera.y = snap.camY;

    const applyWorm = (w: Worm, s: WormSnapshot) => {
      w.x = s.x;
      w.y = s.y;
      w.vx = s.vx;
      w.vy = s.vy;
      w.hp = s.hp;
      w.facing = s.facing;
      w.aim = s.aim;
      w.alive = s.alive;
      w.onGround = s.onGround;
    };
    snap.wormsA.forEach((s, i) => applyWorm(this.teams![0].worms[i]!, s));
    snap.wormsB.forEach((s, i) => applyWorm(this.teams![1].worms[i]!, s));
    this.turns.activeWorm =
      this.teams[snap.activeTeam]?.worms[snap.activeIndex] ?? null;
    this.teams[0].setTurnCursor(snap.teamACursor ?? 0);
    this.teams[1].setTurnCursor(snap.teamBCursor ?? 0);

    this.projectiles = snap.projectiles.map((p) => {
      const proj = new Projectile(p.x, p.y, p.vx, p.vy, p.kind, p.ownerTeam);
      proj.fuse = p.fuse;
      proj.radius = p.radius;
      proj.damage = p.damage;
      proj.stuck = p.stuck;
      proj.maxTravel = p.maxTravel;
      proj.traveled = p.traveled;
      return proj;
    });
    this.missiles = snap.missiles.map((m) => {
      const missile = new FallingMissile(m.x, m.ownerTeam);
      missile.y = m.y;
      missile.vy = m.vy;
      missile.radius = m.radius;
      missile.damage = m.damage;
      return missile;
    });
    this.airstrikes = snap.airstrikes.map(
      (a) => new AirstrikeMarker(a.x, a.ownerTeam, a.fuse),
    );
    this.explosions = snap.explosions.map((e) => ({ ...e }));

    while (this.appliedCarveCount < snap.carves.length) {
      const c = snap.carves[this.appliedCarveCount]!;
      this.terrain.carveCircle(c.x, c.y, c.r);
      this.appliedCarveCount += 1;
    }

    this.syncWeaponButtons();

    if (snap.winner) {
      this.showGameOver(snap.winner);
    }
  }

  private buildFireOptions(active: Worm, ctrl: InputLike): FireOptions | undefined {
    if (this.turns.weapon !== 'airstrike') return undefined;
    if (ctrl.pointerActive) {
      const tx = Math.max(
        40,
        Math.min(WORLD.width - 40, ctrl.pointerX + this.camera.x),
      );
      return { targetX: tx };
    }
    const reach = 700;
    const tx = Math.max(
      40,
      Math.min(
        WORLD.width - 40,
        active.cx + Math.cos(active.aim) * active.facing * reach,
      ),
    );
    return { targetX: tx };
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
    const r = radius * 0.85;
    this.terrain.carveCircle(x, y, r);
    if (this.mode === 'online') {
      this.carves.push({ x, y, r });
    }
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
      const showAim =
        active &&
        active.alive &&
        this.state === 'playing' &&
        !this.isAiControlling() &&
        (this.turns.phase === 'control' || this.turns.phase === 'charging') &&
        (!this.net || this.isMyOnlineTurn() || this.net.role === 'host');
      if (showAim) {
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
      const watching =
        this.mode === 'online' && this.net && !this.isMyOnlineTurn();
      const turnLabel = watching
        ? `${this.teams[this.turns.teamIndex].name} (ожидание)`
        : this.teams[this.turns.teamIndex].name;
      drawCanvasHud(
        ctx,
        vw,
        this.teams,
        this.wind,
        this.turns.timeLeft,
        this.turns.weapon,
        turnLabel,
        this.isAiControlling(),
        this.background,
      );
    }
  }
}
