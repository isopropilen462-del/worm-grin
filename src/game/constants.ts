export const COLORS = {
  yellow: '#FFD400',
  yellowDark: '#E6BE00',
  black: '#0A0A0A',
  white: '#FFFFFF',
  gray: '#1A1A1A',
  grayLight: '#333333',
  skyTop: '#1A3A5C',
  skyBottom: '#4A8BC2',
  water: '#1E5F8A',
  waterDeep: '#0D3A54',
  dirt: '#2A2418',
  dirtLite: '#3D3424',
  grass: '#FFD400',
  teamA: '#FFD400',
  teamB: '#FF5A5A',
} as const;

export const WORLD = {
  width: 1600,
  height: 720,
  waterLevel: 680,
} as const;

export const PHYSICS = {
  gravity: 980,
  wormMoveSpeed: 120,
  wormJumpForce: 380,
  wormWidth: 28,
  wormHeight: 36,
  maxHp: 100,
  fallDamageThreshold: 280,
  fallDamageScale: 0.12,
  coyoteTime: 0.12,
  jumpBuffer: 0.15,
} as const;

export const TURN = {
  duration: 30,
  afterShotDelay: 2.2,
} as const;

export const WEAPON = {
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
  chargeTime: 1.35,
} as const;

export type GameState = 'menu' | 'playing' | 'gameover';
export type MatchMode = 'ai' | 'hotseat';
export type WeaponKind =
  | 'bazooka'
  | 'grenade'
  | 'melee'
  | 'shotgun'
  | 'dynamite'
  | 'airstrike';
export type Phase = 'control' | 'charging' | 'resolving' | 'waiting';

export type TeamId = 0 | 1;
export type Winner = 'player' | 'opponent' | 'draw';

export interface GameOptions {
  width?: number;
  height?: number;
  onMatchEnd?: (winner: Winner) => void;
}

export interface GameHandle {
  destroy(): void;
  pause(): void;
  resume(): void;
  restart(): void;
}

export const WEAPON_LABELS: Record<WeaponKind, string> = {
  bazooka: 'Базука',
  grenade: 'Граната',
  melee: 'Удар',
  shotgun: 'Дробовик',
  dynamite: 'Динамит',
  airstrike: 'Авиаудар',
};

export const WEAPON_KEYS: Record<WeaponKind, string> = {
  bazooka: '1',
  grenade: '2',
  melee: '3',
  shotgun: '4',
  dynamite: '5',
  airstrike: '6',
};

export const ALL_WEAPONS: WeaponKind[] = [
  'bazooka',
  'grenade',
  'melee',
  'shotgun',
  'dynamite',
  'airstrike',
];
