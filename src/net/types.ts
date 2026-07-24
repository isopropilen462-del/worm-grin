import type { BackgroundId } from '../game/Background';
import type { Phase, WeaponKind, Winner } from '../game/constants';

export type OnlineSeat = 0 | 1;
export type OnlineRole = 'host' | 'guest';

export interface InputSnapshot {
  left: boolean;
  right: boolean;
  jump: boolean;
  jumpPressed: boolean;
  fire: boolean;
  firePressed: boolean;
  fireReleased: boolean;
  aimUp: boolean;
  aimDown: boolean;
  weaponSelect: number | null;
  pointerActive: boolean;
  pointerX: number;
  pointerY: number;
}

export interface WormSnapshot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  facing: 1 | -1;
  aim: number;
  alive: boolean;
  onGround: boolean;
}

export interface ProjectileSnapshot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  kind: WeaponKind;
  fuse: number;
  radius: number;
  damage: number;
  ownerTeam: 0 | 1;
  stuck: boolean;
  maxTravel: number;
  traveled: number;
}

export interface MissileSnapshot {
  x: number;
  y: number;
  vy: number;
  radius: number;
  damage: number;
  ownerTeam: 0 | 1;
}

export interface AirstrikeSnapshot {
  x: number;
  fuse: number;
  ownerTeam: 0 | 1;
}

export interface ExplosionSnapshot {
  x: number;
  y: number;
  radius: number;
  damage: number;
  age: number;
  life: number;
}

export interface CarveSnapshot {
  x: number;
  y: number;
  r: number;
}

export interface GameSnapshot {
  seq: number;
  wind: number;
  teamIndex: 0 | 1;
  phase: Phase;
  timeLeft: number;
  weapon: WeaponKind;
  charge: number;
  activeTeam: 0 | 1;
  activeIndex: number;
  wormsA: WormSnapshot[];
  wormsB: WormSnapshot[];
  projectiles: ProjectileSnapshot[];
  missiles: MissileSnapshot[];
  airstrikes: AirstrikeSnapshot[];
  explosions: ExplosionSnapshot[];
  carves: CarveSnapshot[];
  winner: Winner | null;
  camX: number;
  camY: number;
}

export interface RoomRow {
  id: string;
  code: string;
  host_id: string;
  guest_id: string | null;
  status: 'waiting' | 'playing' | 'finished';
  seed: number;
  background_id: BackgroundId | null;
  winner: Winner | null;
}

export interface MatchStartPayload {
  seed: number;
  backgroundId: BackgroundId;
  hostId: string;
  guestId: string;
}
