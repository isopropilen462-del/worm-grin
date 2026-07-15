import type { TeamId } from './constants';
import { Worm } from './Worm';

const TEAM_A_NAMES = ['Grinvi', 'Pixel', 'Sparky'];
const TEAM_B_NAMES = ['Rival', 'Blaze', 'Nova'];

export class Team {
  id: TeamId;
  worms: Worm[];
  name: string;
  private cursor = 0;

  constructor(id: TeamId, worms: Worm[]) {
    this.id = id;
    this.worms = worms;
    this.name = id === 0 ? 'Grinvich' : 'Rivals';
  }

  get aliveWorms(): Worm[] {
    return this.worms.filter((w) => w.alive);
  }

  get isAlive(): boolean {
    return this.aliveWorms.length > 0;
  }

  nextAliveWorm(): Worm | null {
    const alive = this.aliveWorms;
    if (alive.length === 0) return null;
    for (let i = 0; i < this.worms.length; i++) {
      const w = this.worms[this.cursor];
      this.cursor = (this.cursor + 1) % this.worms.length;
      if (w.alive) return w;
    }
    return alive[0];
  }

  peekCurrent(): Worm | null {
    if (!this.worms[this.cursor]?.alive) {
      return this.nextAliveWorm();
    }
    return this.worms[this.cursor] ?? null;
  }
}

export function createTeams(
  spawnsA: Array<{ x: number; y: number }>,
  spawnsB: Array<{ x: number; y: number }>,
): [Team, Team] {
  const wormsA = spawnsA.map(
    (p, i) => new Worm(p.x - 14, p.y, 0, i, TEAM_A_NAMES[i] ?? `G${i + 1}`),
  );
  const wormsB = spawnsB.map(
    (p, i) => new Worm(p.x - 14, p.y, 1, i, TEAM_B_NAMES[i] ?? `R${i + 1}`),
  );
  return [new Team(0, wormsA), new Team(1, wormsB)];
}
