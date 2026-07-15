import './styles/ui.css';
import { ALL_WEAPONS, WEAPON_LABELS, WEAPON_KEYS } from './game/constants';
import type { GameHandle, GameOptions } from './game/constants';
import { Game } from './game/Game';

function createUiShell(container: HTMLElement): {
  menuEl: HTMLElement;
  gameOverEl: HTMLElement;
  resultEl: HTMLElement;
  canvas: HTMLCanvasElement;
} {
  const weaponButtons = ALL_WEAPONS.map(
    (w) =>
      `<button type="button" class="wg-weapon${w === 'bazooka' ? ' wg-weapon-active' : ''}" data-weapon="${w}">${WEAPON_KEYS[w]} ${WEAPON_LABELS[w]}</button>`,
  ).join('');

  container.classList.add('wg-root');
  container.innerHTML = `
    <div class="wg-canvas-wrap">
      <canvas aria-label="Worm Grin game"></canvas>
    </div>
    <div class="wg-hud-weapons" data-weapons>
      ${weaponButtons}
    </div>
    <div class="wg-overlay">
      <div class="wg-panel" data-menu>
        <div class="wg-logo">Grinvich</div>
        <h1 class="wg-title">Worm Grin</h1>
        <p class="wg-subtitle">Пошаговые дуэли на разрушаемом острове. Каждый матч — новый фон и ветер!</p>
        <div class="wg-btn-row">
          <button class="wg-btn" type="button" data-mode="ai">vs AI</button>
          <button class="wg-btn wg-btn-alt" type="button" data-mode="hotseat">Hotseat 2P</button>
        </div>
        <p class="wg-hint">A/D — ходьба · W/↑ — прыжок · Q/E — прицел · Space/X — заряд и выстрел · 1–6 — оружие</p>
      </div>
      <div class="wg-panel wg-hidden" data-gameover>
        <div class="wg-logo">Grinvich</div>
        <h2 class="wg-title">Матч окончен</h2>
        <p class="wg-final-score" data-result>Победа!</p>
        <button class="wg-btn" type="button" data-action="restart">В меню</button>
      </div>
    </div>
  `;

  const canvas = container.querySelector('canvas');
  const menuEl = container.querySelector('[data-menu]');
  const gameOverEl = container.querySelector('[data-gameover]');
  const resultEl = container.querySelector('[data-result]');

  if (!canvas || !menuEl || !gameOverEl || !resultEl) {
    throw new Error('Failed to mount Worm Grin UI');
  }

  return {
    canvas,
    menuEl: menuEl as HTMLElement,
    gameOverEl: gameOverEl as HTMLElement,
    resultEl: resultEl as HTMLElement,
  };
}

export function createWormGrin(
  container: HTMLElement,
  options: GameOptions = {},
): GameHandle {
  const ui = createUiShell(container);
  const game = new Game(ui.canvas, ui, options);

  return {
    destroy: () => {
      game.destroy();
      container.innerHTML = '';
      container.classList.remove('wg-root');
    },
    pause: () => game.pause(),
    resume: () => game.resume(),
    restart: () => game.restart(),
  };
}

export type { GameOptions, GameHandle };
