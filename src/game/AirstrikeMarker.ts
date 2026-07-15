export class AirstrikeMarker {
  x: number;
  fuse: number;
  ownerTeam: 0 | 1;
  alive = true;

  constructor(x: number, ownerTeam: 0 | 1, fuse = 1.8) {
    this.x = x;
    this.ownerTeam = ownerTeam;
    this.fuse = fuse;
  }

  update(dt: number): boolean {
    if (!this.alive) return false;
    this.fuse -= dt;
    return this.fuse <= 0;
  }
}
