// src/game/AirstrikeMarker.ts
var AirstrikeMarker = class {
  x;
  fuse;
  ownerTeam;
  alive = true;
  constructor(x, ownerTeam, fuse = 1.8) {
    this.x = x;
    this.ownerTeam = ownerTeam;
    this.fuse = fuse;
  }
  update(dt) {
    if (!this.alive) return false;
    this.fuse -= dt;
    return this.fuse <= 0;
  }
};

// src/game/Explosion.ts
function createExplosion(x, y, radius, damage) {
  return { x, y, radius, damage, age: 0, life: 0.45 };
}
function updateExplosions(list, dt) {
  for (const e of list) e.age += dt;
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].age >= list[i].life) list.splice(i, 1);
  }
}

// src/game/Input.ts
function emptyInput() {
  return {
    left: false,
    right: false,
    jump: false,
    jumpPressed: false,
    fire: false,
    firePressed: false,
    fireReleased: false,
    aimUp: false,
    aimDown: false,
    weaponSelect: null,
    pointerActive: false,
    pointerX: 0,
    pointerY: 0
  };
}

// src/game/constants.ts
var WORLD = {
  width: 1600,
  height: 720,
  waterLevel: 680
};
var PHYSICS = {
  gravity: 980,
  wormMoveSpeed: 120,
  wormJumpForce: 380,
  wormWidth: 28,
  wormHeight: 36,
  maxHp: 100,
  fallDamageThreshold: 280,
  fallDamageScale: 0.12,
  coyoteTime: 0.12,
  jumpBuffer: 0.15
};
var TURN = {
  duration: 30,
  afterShotDelay: 2.2
};
var WEAPON = {
  bazookaSpeed: 720,
  bazookaRadius: 48,
  bazookaDamage: 55,
  grenadeSpeed: 520,
  grenadeRadius: 42,
  grenadeDamage: 45,
  grenadeFuse: 2.5,
  grenadeBounce: 0.55,
  meleeRange: 38,
  meleeDamage: 35,
  meleeForce: 280,
  shotgunSpeed: 640,
  shotgunPellets: 6,
  shotgunSpread: 0.28,
  shotgunRadius: 22,
  shotgunDamage: 18,
  shotgunRange: 280,
  dynamiteFuse: 3,
  dynamiteRadius: 62,
  dynamiteDamage: 70,
  airstrikeFuse: 1.8,
  airstrikeRadius: 55,
  airstrikeDamage: 60,
  airstrikeSpeed: 900,
  chargeTime: 1.35
};

// src/game/Hitbox.ts
function wormHitRadius() {
  return 16;
}
function segmentHitsWorm(x0, y0, x1, y1, worm) {
  if (!worm.alive) return false;
  const cx = worm.cx;
  const cy = worm.cy - 2;
  const r = wormHitRadius() + 3;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len2 = dx * dx + dy * dy;
  if (len2 < 0.01) {
    return (x0 - cx) ** 2 + (y0 - cy) ** 2 <= r * r;
  }
  let t = ((cx - x0) * dx + (cy - y0) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const px = x0 + t * dx;
  const py = y0 + t * dy;
  return (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
}
function findWormHit(x0, y0, x1, y1, worms, ignoreTeam) {
  let best = null;
  let bestT = Infinity;
  for (const w of worms) {
    if (!w.alive) continue;
    if (ignoreTeam !== void 0 && w.team === ignoreTeam) continue;
    if (!segmentHitsWorm(x0, y0, x1, y1, w)) continue;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len2 = dx * dx + dy * dy || 1;
    let t = ((w.cx - x0) * dx + (w.cy - y0) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    if (t < bestT) {
      bestT = t;
      best = w;
    }
  }
  return best;
}

// src/game/Projectile.ts
var Projectile = class {
  x;
  y;
  vx;
  vy;
  kind;
  alive = true;
  fuse = Infinity;
  radius = 48;
  damage = 55;
  ownerTeam;
  /** Sticky on ground (dynamite). */
  stuck = false;
  /** Pellet — limited travel distance. */
  maxTravel = Infinity;
  traveled = 0;
  constructor(x, y, vx, vy, kind, ownerTeam) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.kind = kind;
    this.ownerTeam = ownerTeam;
    this.applyKindStats(kind);
  }
  applyKindStats(kind) {
    switch (kind) {
      case "grenade":
        this.fuse = WEAPON.grenadeFuse;
        this.radius = WEAPON.grenadeRadius;
        this.damage = WEAPON.grenadeDamage;
        break;
      case "shotgun":
        this.fuse = Infinity;
        this.radius = WEAPON.shotgunRadius;
        this.damage = WEAPON.shotgunDamage;
        this.maxTravel = WEAPON.shotgunRange;
        break;
      case "dynamite":
        this.fuse = WEAPON.dynamiteFuse;
        this.radius = WEAPON.dynamiteRadius;
        this.damage = WEAPON.dynamiteDamage;
        this.stuck = true;
        this.vx = 0;
        this.vy = 0;
        break;
      case "airstrike":
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
  update(dt, terrain, wind, gravity, worms) {
    if (!this.alive) return false;
    if (this.stuck) {
      if (this.kind === "dynamite") {
        this.fuse -= dt;
        if (this.fuse <= 0) {
          this.alive = false;
          return true;
        }
      }
      return false;
    }
    if (this.kind === "grenade" || this.kind === "dynamite") {
      this.fuse -= dt;
      if (this.fuse <= 0 && this.kind === "grenade") {
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
      if (wormHit && this.kind !== "shotgun") {
        this.x = nx;
        this.y = ny;
        this.alive = false;
        return true;
      }
      if (wormHit && this.kind === "shotgun") {
        this.x = nx;
        this.y = ny;
        this.alive = false;
        wormHit.damage(this.damage);
        const ang = Math.atan2(wormHit.cy - ny, wormHit.cx - nx);
        wormHit.applyImpulse(Math.cos(ang) * 80, Math.sin(ang) * 80 - 40);
        return false;
      }
      if (terrain.isSolid(nx, ny)) {
        if (this.kind === "grenade") {
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
      return this.kind === "grenade";
    }
    return false;
  }
};
var FallingMissile = class {
  x;
  y;
  vy;
  alive = true;
  ownerTeam;
  radius = WEAPON.airstrikeRadius;
  damage = WEAPON.airstrikeDamage;
  constructor(x, ownerTeam) {
    this.x = x;
    this.y = -40;
    this.vy = WEAPON.airstrikeSpeed;
    this.ownerTeam = ownerTeam;
  }
  update(dt, terrain, worms) {
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
};

// src/game/Worm.ts
var Worm = class {
  x;
  y;
  vx = 0;
  vy = 0;
  hp;
  team;
  index;
  facing = 1;
  aim = -0.4;
  onGround = false;
  /** Feet touching solid ground (relaxed check for walking). */
  feetOnGround = false;
  alive = true;
  name;
  /** Coyote-time window after leaving ground. */
  coyoteLeft = 0;
  /** Buffered jump press. */
  jumpBuffer = 0;
  constructor(x, y, team, index, name) {
    this.x = x;
    this.y = y - PHYSICS.wormHeight;
    this.team = team;
    this.index = index;
    this.hp = PHYSICS.maxHp;
    this.name = name;
    this.facing = team === 0 ? 1 : -1;
  }
  get cx() {
    return this.x + PHYSICS.wormWidth / 2;
  }
  get cy() {
    return this.y + PHYSICS.wormHeight / 2;
  }
  get feetY() {
    return this.y + PHYSICS.wormHeight;
  }
  get pose() {
    if (!this.onGround && this.vy < -40) return "jump";
    if (!this.onGround) return "fall";
    if (Math.abs(this.vx) > 20) return "walk";
    return "idle";
  }
  damage(amount) {
    if (!this.alive) return;
    this.hp = Math.max(0, this.hp - Math.round(amount));
    if (this.hp <= 0) {
      this.alive = false;
      this.vx = 0;
      this.vy = 0;
    }
  }
  kill() {
    this.hp = 0;
    this.alive = false;
    this.vx = 0;
    this.vy = 0;
  }
  applyImpulse(ix, iy) {
    if (!this.alive) return;
    this.vx += ix;
    this.vy += iy;
    this.onGround = false;
    this.coyoteLeft = 0;
  }
  /** Call before physics each frame. */
  handleJumpInput(jumpPressed, dt) {
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
  refreshGround(terrain, dt) {
    const w = PHYSICS.wormWidth;
    const feet = this.feetY;
    const mid = this.cx;
    const left = this.x + 5;
    const right = this.x + w - 5;
    const feetSolid = terrain.isSolid(mid, feet + 1) || terrain.isSolid(left, feet + 1) || terrain.isSolid(right, feet + 1);
    const headClear = !terrain.isSolid(mid, this.y + 2);
    this.feetOnGround = feetSolid;
    this.onGround = feetSolid && headClear && Math.abs(this.vy) < 120;
    if (this.onGround) {
      this.coyoteLeft = PHYSICS.coyoteTime;
    } else {
      this.coyoteLeft = Math.max(0, this.coyoteLeft - dt);
    }
  }
  updatePhysics(dt, terrain) {
    if (!this.alive) return;
    this.vy += PHYSICS.gravity * dt;
    const w = PHYSICS.wormWidth;
    const h = PHYSICS.wormHeight;
    if (this.vx !== 0) {
      const distance = this.vx * dt;
      const direction = Math.sign(distance);
      const steps = Math.ceil(Math.abs(distance));
      for (let i = 0; i < steps; i++) {
        const nx = this.x + direction;
        if (!terrain.rectSolid(nx, this.y + 2, w, h - 7)) {
          this.x = nx;
          continue;
        }
        let stepped = false;
        for (let step = 1; step <= 18; step++) {
          if (!terrain.rectSolid(nx, this.y - step + 2, w, h - 7)) {
            this.x = nx;
            this.y -= step;
            this.vy = Math.min(0, this.vy);
            stepped = true;
            break;
          }
        }
        if (stepped) continue;
        this.vx = 0;
        break;
      }
    }
    const ny = this.y + this.vy * dt;
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
    if (this.feetOnGround && this.onGround) {
      this.vx *= Math.pow(2e-3, dt);
      if (Math.abs(this.vx) < 5) this.vx = 0;
    }
    if (this.feetY >= WORLD.waterLevel || this.y > WORLD.height + 40 || this.x < -80 || this.x > WORLD.width + 80) {
      this.kill();
    }
  }
  tryMove(dir) {
    if (!this.alive) return;
    this.facing = dir;
    this.vx = dir * PHYSICS.wormMoveSpeed;
  }
};

// src/game/Team.ts
var TEAM_A_NAMES = ["Grinvi", "Pixel", "Sparky"];
var TEAM_B_NAMES = ["Rival", "Blaze", "Nova"];
var Team = class {
  id;
  worms;
  name;
  cursor = 0;
  constructor(id, worms) {
    this.id = id;
    this.worms = worms;
    this.name = id === 0 ? "Grinvich" : "Rivals";
  }
  get aliveWorms() {
    return this.worms.filter((w) => w.alive);
  }
  get isAlive() {
    return this.aliveWorms.length > 0;
  }
  nextAliveWorm() {
    const alive = this.aliveWorms;
    if (alive.length === 0) return null;
    for (let i = 0; i < this.worms.length; i++) {
      const w = this.worms[this.cursor];
      this.cursor = (this.cursor + 1) % this.worms.length;
      if (w.alive) return w;
    }
    return alive[0];
  }
  peekCurrent() {
    if (!this.worms[this.cursor]?.alive) {
      return this.nextAliveWorm();
    }
    return this.worms[this.cursor] ?? null;
  }
  get turnCursor() {
    return this.cursor;
  }
  setTurnCursor(cursor) {
    this.cursor = (cursor % this.worms.length + this.worms.length) % this.worms.length;
  }
};
function createTeams(spawnsA, spawnsB) {
  const wormsA = spawnsA.map(
    (p, i) => new Worm(p.x - 14, p.y, 0, i, TEAM_A_NAMES[i] ?? `G${i + 1}`)
  );
  const wormsB = spawnsB.map(
    (p, i) => new Worm(p.x - 14, p.y, 1, i, TEAM_B_NAMES[i] ?? `R${i + 1}`)
  );
  return [new Team(0, wormsA), new Team(1, wormsB)];
}

// src/game/rng.ts
var SeededRng = class {
  state;
  constructor(seed) {
    this.state = seed >>> 0;
  }
  next() {
    let t = this.state += 1831565813;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
  int(min, max) {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
  range(min, max) {
    return min + this.next() * (max - min);
  }
  pick(items) {
    return items[Math.floor(this.next() * items.length)];
  }
};

// src/game/Terrain.ts
var Terrain = class {
  width;
  height;
  canvas;
  ctx;
  data;
  dirty = true;
  rng;
  constructor(width = WORLD.width, height = WORLD.height, seed, headless = false) {
    this.width = width;
    this.height = height;
    this.rng = new SeededRng(seed ?? Math.random() * 4294967295 >>> 0);
    if (headless) {
      this.canvas = null;
      this.ctx = null;
      this.data = { data: new Uint8ClampedArray(width * height * 4) };
    } else if (typeof OffscreenCanvas !== "undefined") {
      this.canvas = new OffscreenCanvas(width, height);
      const ctx = this.canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("2d context required for terrain");
      this.ctx = ctx;
      this.data = this.ctx.createImageData(width, height);
    } else {
      this.canvas = document.createElement("canvas");
      this.canvas.width = width;
      this.canvas.height = height;
      const ctx = this.canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("2d context required for terrain");
      this.ctx = ctx;
      this.data = this.ctx.createImageData(width, height);
    }
    this.generate();
  }
  generate() {
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
    this.ctx?.putImageData(this.data, 0, 0);
    this.dirty = false;
  }
  isSolid(x, y) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    if (ix < 0 || iy < 0 || ix >= this.width || iy >= this.height) return false;
    return this.data.data[(iy * this.width + ix) * 4 + 3] > 128;
  }
  /** True if any sample in the rectangle is solid. */
  rectSolid(x, y, w, h) {
    const step = 3;
    for (let sx = x; sx <= x + w; sx += step) {
      for (let sy = y; sy <= y + h; sy += step) {
        if (this.isSolid(sx, sy)) return true;
      }
      if (this.isSolid(x + w, y) || this.isSolid(x + w, y + h)) return true;
    }
    return this.isSolid(x, y + h) || this.isSolid(x + w, y + h);
  }
  carveCircle(cx, cy, radius) {
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
  groundY(x, fromY, maxDrop = 200) {
    for (let dy = 0; dy < maxDrop; dy++) {
      const y = fromY + dy;
      if (this.isSolid(x, y) && !this.isSolid(x, y - 1)) {
        return y;
      }
    }
    return null;
  }
  flush() {
    if (!this.dirty || !this.ctx) return;
    this.ctx.putImageData(this.data, 0, 0);
    this.dirty = false;
  }
  draw(ctx, camX, camY) {
    if (!this.canvas) return;
    this.flush();
    ctx.drawImage(
      this.canvas,
      camX,
      camY,
      ctx.canvas.width,
      ctx.canvas.height,
      0,
      0,
      ctx.canvas.width,
      ctx.canvas.height
    );
  }
  /** Spawns along left/right hills, feet on surface. */
  findSpawnPoints(count, side) {
    const points = [];
    const xMin = side === "left" ? 80 : this.width * 0.62;
    const xMax = side === "left" ? this.width * 0.38 : this.width - 80;
    const surfaceY = (x) => {
      for (let y = 40; y < WORLD.waterLevel; y++) {
        if (this.isSolid(x, y) && !this.isSolid(x, y - 1)) return y;
      }
      return null;
    };
    const isSafeSpawn = (x, y) => {
      const halfWidth = PHYSICS.wormWidth / 2;
      const samples = [x - halfWidth + 4, x, x + halfWidth - 4];
      const surfaces = samples.map(surfaceY);
      if (surfaces.some((surface) => surface === null)) return false;
      const surfaceRange = Math.max(...surfaces) - Math.min(...surfaces);
      if (surfaceRange > 10) return false;
      const wormX = x - halfWidth;
      const wormY = y - PHYSICS.wormHeight;
      return !this.rectSolid(
        wormX + 2,
        wormY + 2,
        PHYSICS.wormWidth - 4,
        PHYSICS.wormHeight - 7
      );
    };
    const addIfSafe = (x) => {
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
    for (let x = xMin; points.length < count && x <= xMax; x += 8) {
      addIfSafe(x);
    }
    while (points.length < count) {
      const x = xMin + (points.length + 1) / (count + 1) * (xMax - xMin);
      const y = surfaceY(x) ?? WORLD.waterLevel - 80;
      points.push({ x, y });
    }
    return points;
  }
};

// src/game/TurnSystem.ts
var TurnSystem = class {
  teamIndex = 0;
  phase = "control";
  timeLeft = TURN.duration;
  weapon = "bazooka";
  charge = 0;
  charging = false;
  waitLeft = 0;
  activeWorm = null;
  startMatch(teams, wind) {
    this.teamIndex = 0;
    this.beginTurn(teams, wind);
  }
  beginTurn(teams, wind) {
    const team = teams[this.teamIndex];
    this.activeWorm = team.nextAliveWorm();
    this.phase = "control";
    this.timeLeft = TURN.duration;
    this.weapon = "bazooka";
    this.charge = 0;
    this.charging = false;
    this.waitLeft = 0;
    wind.roll();
  }
  endShot() {
    this.phase = "resolving";
    this.charging = false;
    this.charge = 0;
  }
  afterResolve() {
    this.phase = "waiting";
    this.waitLeft = TURN.afterShotDelay;
  }
  forceEndTurn() {
    this.phase = "waiting";
    this.waitLeft = 0.4;
    this.charging = false;
    this.charge = 0;
  }
  advanceTeam(teams, wind) {
    this.teamIndex = this.teamIndex === 0 ? 1 : 0;
    if (!teams[this.teamIndex].isAlive) {
      this.teamIndex = this.teamIndex === 0 ? 1 : 0;
    }
    this.beginTurn(teams, wind);
  }
  tickTimer(dt) {
    if (this.phase !== "control" && this.phase !== "charging") return null;
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      return "timeout";
    }
    return null;
  }
  tickWait(dt) {
    if (this.phase !== "waiting") return false;
    this.waitLeft -= dt;
    return this.waitLeft <= 0;
  }
};

// src/game/Wind.ts
var Wind = class {
  /** Horizontal acceleration applied to projectiles (px/s²). */
  value = 0;
  roll() {
    this.value = (Math.random() * 2 - 1) * 140;
  }
  reset() {
    this.value = 0;
  }
};

// src/game/weapons/Weapon.ts
function fireWeapon(kind, worm, charge, terrain, options) {
  const power = Math.max(0.15, Math.min(1, charge));
  const angle = worm.aim;
  const dir = worm.facing;
  if (kind === "melee") {
    const hx = worm.cx + dir * WEAPON.meleeRange * 0.7;
    const hy = worm.cy;
    return {
      melee: {
        x: hx,
        y: hy,
        damage: WEAPON.meleeDamage,
        knockX: dir * WEAPON.meleeForce,
        knockY: -120
      }
    };
  }
  if (kind === "airstrike") {
    const tx = options?.targetX ?? Math.max(
      40,
      Math.min(
        WORLD.width - 40,
        worm.cx + Math.cos(angle) * dir * (200 + power * 500)
      )
    );
    return { airstrike: new AirstrikeMarker(tx, worm.team) };
  }
  if (kind === "dynamite") {
    const minDist = WEAPON.dynamiteRadius * 1.4;
    let px = options?.targetX ?? worm.cx + dir * minDist;
    let py = worm.feetY - 4;
    if (terrain) {
      const gy = terrain.groundY(px, 40, WORLD.waterLevel);
      if (gy !== null) py = gy - 4;
    }
    return {
      projectiles: [new Projectile(px, py, 0, 0, "dynamite", worm.team)]
    };
  }
  if (kind === "shotgun") {
    const pellets = [];
    const baseSpeed = WEAPON.shotgunSpeed * power;
    const muzzleX2 = worm.cx + Math.cos(angle) * dir * 20;
    const muzzleY2 = worm.cy + Math.sin(angle) * 16 - 4;
    const centerAng = Math.atan2(Math.sin(angle), Math.cos(angle) * dir);
    for (let i = 0; i < WEAPON.shotgunPellets; i++) {
      const spread = (i - (WEAPON.shotgunPellets - 1) / 2) * WEAPON.shotgunSpread;
      const a = centerAng + spread;
      pellets.push(
        new Projectile(
          muzzleX2,
          muzzleY2,
          Math.cos(a) * baseSpeed,
          Math.sin(a) * baseSpeed,
          "shotgun",
          worm.team
        )
      );
    }
    return { projectiles: pellets };
  }
  const speed = (kind === "grenade" ? WEAPON.grenadeSpeed : WEAPON.bazookaSpeed) * power;
  const muzzleX = worm.cx + Math.cos(angle) * dir * 22;
  const muzzleY = worm.cy + Math.sin(angle) * 18 - 4;
  const vx = Math.cos(angle) * dir * speed;
  const vy = Math.sin(angle) * speed;
  return {
    projectiles: [new Projectile(muzzleX, muzzleY, vx, vy, kind, worm.team)]
  };
}

// src/engine/MatchEngine.ts
var STEP = 1 / 60;
var MatchEngine = class {
  terrain;
  wind = new Wind();
  turns = new TurnSystem();
  teams;
  projectiles = [];
  missiles = [];
  airstrikes = [];
  explosions = [];
  carves = [];
  seq = 0;
  winner = null;
  constructor(seed, snapshot) {
    this.terrain = new Terrain(WORLD.width, WORLD.height, seed, true);
    const a = this.terrain.findSpawnPoints(3, "left");
    const b = this.terrain.findSpawnPoints(3, "right");
    this.teams = createTeams(a, b);
    this.turns.startMatch(this.teams, this.wind);
    if (snapshot) this.restore(snapshot);
  }
  step(input = emptyInput(), duration = STEP) {
    if (this.winner) return;
    const steps = Math.max(1, Math.ceil(duration / STEP));
    for (let i = 0; i < steps && !this.winner; i++) {
      this.tick(STEP, i === 0 ? input : { ...input, jumpPressed: false, firePressed: false, fireReleased: false, weaponSelect: null });
    }
  }
  tick(dt, input) {
    const active = this.turns.activeWorm;
    const worms = this.allWorms();
    if (this.turns.phase === "resolving") {
      this.updateWorld(dt, worms);
      if (!this.isResolving()) this.turns.afterResolve();
      this.checkWinner();
      return;
    }
    if (this.turns.phase === "waiting") {
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
    if (this.turns.phase === "control") {
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
    if (this.turns.tickTimer(dt) === "timeout") {
      this.turns.forceEndTurn();
      return;
    }
    const instant = ["melee", "shotgun", "airstrike", "dynamite"];
    const fireOpts = this.buildFireOptions(active, input);
    if (this.turns.phase === "control" && input.firePressed) {
      if (instant.includes(this.turns.weapon)) {
        this.applyFire(fireWeapon(this.turns.weapon, active, 1, this.terrain, fireOpts));
      } else {
        this.turns.phase = "charging";
        this.turns.charging = true;
        this.turns.charge = 0;
      }
    } else if (this.turns.phase === "charging") {
      this.turns.charge = Math.min(1, this.turns.charge + dt / WEAPON.chargeTime);
      if (input.fireReleased || this.turns.charge >= 1) {
        this.applyFire(fireWeapon(this.turns.weapon, active, this.turns.charge, this.terrain, fireOpts));
      }
    }
  }
  updateWorld(dt, worms) {
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
  buildFireOptions(active, input) {
    if (this.turns.weapon !== "airstrike") return void 0;
    const targetX = input.pointerActive ? Math.max(40, Math.min(WORLD.width - 40, input.pointerX)) : Math.max(40, Math.min(WORLD.width - 40, active.cx + Math.cos(active.aim) * active.facing * 700));
    return { targetX };
  }
  applyFire(result) {
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
  detonate(x, y, radius, damage) {
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
  checkWinner() {
    const a = this.teams[0].isAlive;
    const b = this.teams[1].isAlive;
    if (a && b) return false;
    this.winner = !a && !b ? "draw" : a ? "player" : "opponent";
    return true;
  }
  isResolving() {
    return this.projectiles.some((p) => p.alive) || this.missiles.some((m) => m.alive) || this.airstrikes.some((a) => a.alive) || this.explosions.length > 0;
  }
  allWorms() {
    return [...this.teams[0].worms, ...this.teams[1].worms];
  }
  weaponFromIndex(index) {
    return index >= 1 && index <= 6 ? ["bazooka", "grenade", "melee", "shotgun", "dynamite", "airstrike"][index - 1] : null;
  }
  snapshot() {
    this.seq += 1;
    const snapWorm = (worm) => ({
      x: worm.x,
      y: worm.y,
      vx: worm.vx,
      vy: worm.vy,
      hp: worm.hp,
      facing: worm.facing,
      aim: worm.aim,
      alive: worm.alive,
      onGround: worm.onGround
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
      projectiles: this.projectiles.map((p) => ({ x: p.x, y: p.y, vx: p.vx, vy: p.vy, kind: p.kind, fuse: p.fuse, radius: p.radius, damage: p.damage, ownerTeam: p.ownerTeam, stuck: p.stuck, maxTravel: p.maxTravel, traveled: p.traveled })),
      missiles: this.missiles.map((m) => ({ x: m.x, y: m.y, vy: m.vy, radius: m.radius, damage: m.damage, ownerTeam: m.ownerTeam })),
      airstrikes: this.airstrikes.map((a) => ({ x: a.x, fuse: a.fuse, ownerTeam: a.ownerTeam })),
      explosions: this.explosions.map((e) => ({ ...e })),
      carves: this.carves.slice(),
      winner: this.winner,
      camX: 0,
      camY: 0
    };
  }
  restore(snapshot) {
    this.seq = snapshot.seq;
    this.wind.value = snapshot.wind;
    this.turns.teamIndex = snapshot.teamIndex;
    this.turns.phase = snapshot.phase;
    this.turns.timeLeft = snapshot.timeLeft;
    this.turns.weapon = snapshot.weapon;
    this.turns.charge = snapshot.charge;
    this.turns.charging = snapshot.phase === "charging";
    this.teams[0].setTurnCursor(snapshot.teamACursor ?? 0);
    this.teams[1].setTurnCursor(snapshot.teamBCursor ?? 0);
    const restoreWorm = (worm, state) => Object.assign(worm, state);
    snapshot.wormsA.forEach((state, i) => restoreWorm(this.teams[0].worms[i], state));
    snapshot.wormsB.forEach((state, i) => restoreWorm(this.teams[1].worms[i], state));
    this.turns.activeWorm = this.teams[snapshot.activeTeam].worms[snapshot.activeIndex] ?? null;
    for (const carve of snapshot.carves) this.terrain.carveCircle(carve.x, carve.y, carve.r);
    this.carves = snapshot.carves.slice();
    this.projectiles = snapshot.projectiles.map((s) => Object.assign(new Projectile(s.x, s.y, s.vx, s.vy, s.kind, s.ownerTeam), s));
    this.missiles = snapshot.missiles.map((s) => Object.assign(new FallingMissile(s.x, s.ownerTeam), s));
    this.airstrikes = snapshot.airstrikes.map((s) => Object.assign(new AirstrikeMarker(s.x, s.ownerTeam, s.fuse), s));
    this.explosions = snapshot.explosions.map((s) => ({ ...s }));
    this.winner = snapshot.winner;
  }
};
export {
  MatchEngine
};
