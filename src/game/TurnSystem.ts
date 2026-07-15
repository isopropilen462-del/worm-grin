import { TURN, type Phase, type TeamId, type WeaponKind } from './constants';
import type { Team } from './Team';
import type { Worm } from './Worm';
import type { Wind } from './Wind';

export class TurnSystem {
  teamIndex: TeamId = 0;
  phase: Phase = 'control';
  timeLeft = TURN.duration as number;
  weapon: WeaponKind = 'bazooka';
  charge = 0;
  charging = false;
  waitLeft = 0;
  activeWorm: Worm | null = null;

  startMatch(teams: [Team, Team], wind: Wind): void {
    this.teamIndex = 0;
    this.beginTurn(teams, wind);
  }

  beginTurn(teams: [Team, Team], wind: Wind): void {
    const team = teams[this.teamIndex];
    this.activeWorm = team.nextAliveWorm();
    this.phase = 'control';
    this.timeLeft = TURN.duration as number;
    this.weapon = 'bazooka';
    this.charge = 0;
    this.charging = false;
    this.waitLeft = 0;
    wind.roll();
  }

  endShot(): void {
    this.phase = 'resolving';
    this.charging = false;
    this.charge = 0;
  }

  afterResolve(): void {
    this.phase = 'waiting';
    this.waitLeft = TURN.afterShotDelay;
  }

  forceEndTurn(): void {
    this.phase = 'waiting';
    this.waitLeft = 0.4;
    this.charging = false;
    this.charge = 0;
  }

  advanceTeam(teams: [Team, Team], wind: Wind): void {
    this.teamIndex = (this.teamIndex === 0 ? 1 : 0) as TeamId;
    // Skip dead teams
    if (!teams[this.teamIndex].isAlive) {
      this.teamIndex = (this.teamIndex === 0 ? 1 : 0) as TeamId;
    }
    this.beginTurn(teams, wind);
  }

  tickTimer(dt: number): 'timeout' | null {
    if (this.phase !== 'control' && this.phase !== 'charging') return null;
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      return 'timeout';
    }
    return null;
  }

  tickWait(dt: number): boolean {
    if (this.phase !== 'waiting') return false;
    this.waitLeft -= dt;
    return this.waitLeft <= 0;
  }
}
