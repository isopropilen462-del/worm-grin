export class Wind {
  /** Horizontal acceleration applied to projectiles (px/s²). */
  value = 0;

  roll(): void {
    this.value = (Math.random() * 2 - 1) * 140;
  }

  reset(): void {
    this.value = 0;
  }
}
