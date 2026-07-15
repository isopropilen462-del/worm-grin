export interface LoopHandle {
  stop(): void;
}

export function startLoop(update: (dt: number) => void, render: () => void): LoopHandle {
  let last = performance.now();
  let raf = 0;
  let running = true;
  const maxDt = 1 / 30;

  const frame = (now: number) => {
    if (!running) return;
    const dt = Math.min(maxDt, (now - last) / 1000);
    last = now;
    update(dt);
    render();
    raf = requestAnimationFrame(frame);
  };

  raf = requestAnimationFrame(frame);

  return {
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
  };
}
