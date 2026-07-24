export interface LoopHandle {
  stop(): void;
}

/**
 * Simulate on a timer (keeps running when the tab is backgrounded) and only
 * paint with rAF. Online matches must not depend on a visible browser window.
 */
export function startLoop(update: (dt: number) => void, render: () => void): LoopHandle {
  let last = performance.now();
  let raf = 0;
  let interval = 0;
  let running = true;
  const maxDt = 1 / 20;

  const tick = () => {
    if (!running) return;
    const now = performance.now();
    const dt = Math.min(maxDt, (now - last) / 1000);
    last = now;
    if (dt > 0) update(dt);
  };

  const frame = () => {
    if (!running) return;
    render();
    raf = requestAnimationFrame(frame);
  };

  interval = window.setInterval(tick, 1000 / 30);
  raf = requestAnimationFrame(frame);
  tick();

  return {
    stop() {
      running = false;
      cancelAnimationFrame(raf);
      window.clearInterval(interval);
    },
  };
}
