export class Input {
  left = false;
  right = false;
  jump = false;
  jumpPressed = false;
  fire = false;
  firePressed = false;
  fireReleased = false;
  aimUp = false;
  aimDown = false;
  weaponSelect: number | null = null;
  pointerActive = false;
  pointerX = 0;
  pointerY = 0;

  private keys = new Set<string>();
  private prevJump = false;
  private prevFire = false;
  private cleanupFns: Array<() => void> = [];

  attach(target: HTMLElement): void {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)
      ) {
        e.preventDefault();
      }
      this.keys.add(e.code);
      this.syncKeys();
    };

    const onKeyUp = (e: KeyboardEvent) => {
      this.keys.delete(e.code);
      this.syncKeys();
    };

    const onBlur = () => {
      this.keys.clear();
      this.syncKeys();
      this.pointerActive = false;
    };

    const onPointerDown = (e: PointerEvent) => {
      const rect = target.getBoundingClientRect();
      this.pointerActive = true;
      this.pointerX = e.clientX - rect.left;
      this.pointerY = e.clientY - rect.top;
      this.fire = true;
      target.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!this.pointerActive) return;
      const rect = target.getBoundingClientRect();
      this.pointerX = e.clientX - rect.left;
      this.pointerY = e.clientY - rect.top;
    };

    const onPointerUp = () => {
      this.pointerActive = false;
      this.fire = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    target.addEventListener('pointerdown', onPointerDown);
    target.addEventListener('pointermove', onPointerMove);
    target.addEventListener('pointerup', onPointerUp);
    target.addEventListener('pointercancel', onPointerUp);

    this.cleanupFns = [
      () => window.removeEventListener('keydown', onKeyDown),
      () => window.removeEventListener('keyup', onKeyUp),
      () => window.removeEventListener('blur', onBlur),
      () => target.removeEventListener('pointerdown', onPointerDown),
      () => target.removeEventListener('pointermove', onPointerMove),
      () => target.removeEventListener('pointerup', onPointerUp),
      () => target.removeEventListener('pointercancel', onPointerUp),
    ];
  }

  beginFrame(): void {
    this.jumpPressed = this.jump && !this.prevJump;
    this.firePressed = this.fire && !this.prevFire;
    this.fireReleased = !this.fire && this.prevFire;
    this.prevJump = this.jump;
    this.prevFire = this.fire;

    this.weaponSelect = null;
    for (let i = 1; i <= 6; i++) {
      if (this.keys.has(`Digit${i}`) || this.keys.has(`Numpad${i}`)) {
        this.weaponSelect = i;
        break;
      }
    }
  }

  private syncKeys(): void {
    this.left = this.keys.has('ArrowLeft') || this.keys.has('KeyA');
    this.right = this.keys.has('ArrowRight') || this.keys.has('KeyD');
    this.jump = this.keys.has('ArrowUp') || this.keys.has('KeyW');
    this.aimUp = this.keys.has('KeyQ') || this.keys.has('KeyR');
    this.aimDown = this.keys.has('KeyE') || this.keys.has('KeyF');
    this.fire =
      this.keys.has('Space') ||
      this.keys.has('KeyX') ||
      this.keys.has('Enter') ||
      this.pointerActive;
  }

  destroy(): void {
    this.cleanupFns.forEach((fn) => fn());
    this.cleanupFns = [];
  }
}
