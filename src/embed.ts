import './styles/ui.css';
import { ALL_WEAPONS, WEAPON_LABELS, WEAPON_KEYS } from './game/constants';
import type { GameHandle, GameOptions } from './game/constants';
import { Game } from './game/Game';
import { pickRandomBackground, type BackgroundId } from './game/Background';
import { isOnlineConfigured, getPlayerId } from './net/supabase';
import { createRoom, fetchRoom, joinRoom } from './net/rooms';
import { NetSession } from './net/session';
import type { RoomRow } from './net/types';

function createUiShell(container: HTMLElement): {
  menuEl: HTMLElement;
  gameOverEl: HTMLElement;
  resultEl: HTMLElement;
  lobbyEl: HTMLElement;
  canvas: HTMLCanvasElement;
} {
  const weaponButtons = ALL_WEAPONS.map(
    (w) =>
      `<button type="button" class="wg-weapon${w === 'bazooka' ? ' wg-weapon-active' : ''}" data-weapon="${w}">${WEAPON_KEYS[w]} ${WEAPON_LABELS[w]}</button>`,
  ).join('');

  const onlineEnabled = isOnlineConfigured();
  const onlineBtn = onlineEnabled
    ? `<button class="wg-btn wg-btn-alt" type="button" data-mode="online-lobby">Онлайн 2P</button>`
    : '';

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
          ${onlineBtn}
        </div>
        <p class="wg-hint">A/D — ходьба · W/↑ — прыжок · Q/E — прицел · Space/X — заряд и выстрел · 1–6 — оружие</p>
      </div>
      <div class="wg-panel wg-hidden" data-lobby>
        <div class="wg-logo">Grinvich</div>
        <h2 class="wg-title">Онлайн дуэль</h2>
        <p class="wg-subtitle" data-lobby-status>Создайте комнату или введите код друга.</p>
        <div class="wg-btn-row" data-lobby-actions>
          <button class="wg-btn" type="button" data-action="create-room">Создать комнату</button>
        </div>
        <div class="wg-join-row">
          <input class="wg-input" data-join-code maxlength="6" placeholder="КОД" autocomplete="off" spellcheck="false" />
          <button class="wg-btn wg-btn-alt" type="button" data-action="join-room">Войти</button>
        </div>
        <p class="wg-code wg-hidden" data-room-code></p>
        <p class="wg-hint wg-hidden" data-lobby-link></p>
        <button class="wg-btn wg-btn-alt" type="button" data-action="lobby-back" style="margin-top:1rem">Назад</button>
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
  const lobbyEl = container.querySelector('[data-lobby]');

  if (!canvas || !menuEl || !gameOverEl || !resultEl || !lobbyEl) {
    throw new Error('Failed to mount Worm Grin UI');
  }

  return {
    canvas,
    menuEl: menuEl as HTMLElement,
    gameOverEl: gameOverEl as HTMLElement,
    resultEl: resultEl as HTMLElement,
    lobbyEl: lobbyEl as HTMLElement,
  };
}

function roomBackground(room: RoomRow): BackgroundId {
  return (room.background_id ?? pickRandomBackground(room.seed).id) as BackgroundId;
}

function bindLobby(game: Game, lobbyEl: HTMLElement): void {
  if (!isOnlineConfigured()) return;

  const statusEl = lobbyEl.querySelector('[data-lobby-status]') as HTMLElement;
  const codeEl = lobbyEl.querySelector('[data-room-code]') as HTMLElement;
  const linkEl = lobbyEl.querySelector('[data-lobby-link]') as HTMLElement;
  const joinInput = lobbyEl.querySelector('[data-join-code]') as HTMLInputElement;
  const actionsEl = lobbyEl.querySelector('[data-lobby-actions]') as HTMLElement;

  let hostPoll: number | null = null;
  let activeSession: NetSession | null = null;
  let starting = false;

  const clearHostPoll = () => {
    if (hostPoll !== null) {
      window.clearInterval(hostPoll);
      hostPoll = null;
    }
  };

  const setStatus = (text: string) => {
    statusEl.textContent = text;
  };

  const showCode = (code: string) => {
    codeEl.textContent = code;
    codeEl.classList.remove('wg-hidden');
    const url = `${location.origin}${location.pathname}?room=${code}`;
    linkEl.innerHTML = `Ссылка для друга:<br><a class="wg-link" href="${url}">${url}</a>`;
    linkEl.classList.remove('wg-hidden');
    actionsEl.classList.add('wg-hidden');
  };

  const beginMatch = async (session: NetSession, room: RoomRow) => {
    if (starting) return;
    starting = true;
    clearHostPoll();
    const bg = roomBackground(room);
    setStatus('Старт матча…');
    try {
      await session.sendStart({
        seed: room.seed,
        backgroundId: bg,
        hostId: room.host_id,
        guestId: room.guest_id ?? '',
      });
    } catch {
      // Broadcast is best-effort; both sides already have room row.
    }
    game.startOnline(session, room.seed, bg);
  };

  const waitForGuest = (session: NetSession, room: RoomRow) => {
    clearHostPoll();
    const tick = async () => {
      try {
        const latest = await fetchRoom(room.code);
        if (latest?.guest_id) {
          clearHostPoll();
          await beginMatch(session, latest);
        }
      } catch (err) {
        setStatus(err instanceof Error ? err.message : 'Ошибка ожидания соперника');
      }
    };
    void tick();
    hostPoll = window.setInterval(() => void tick(), 1000);
  };

  lobbyEl.querySelector('[data-action="create-room"]')?.addEventListener('click', () => {
    void (async () => {
      try {
        starting = false;
        clearHostPoll();
        if (activeSession) {
          await activeSession.destroy();
          activeSession = null;
        }
        setStatus('Создаём комнату…');
        const bg = pickRandomBackground();
        const room = await createRoom(bg.id);
        showCode(room.code);
        setStatus('Ждём соперника… Отправьте код или ссылку другу.');

        const session = await NetSession.connect('host', room.code, room.id);
        activeSession = session;
        session.onPeer((kind) => {
          if (kind === 'joined') {
            void fetchRoom(room.code).then((latest) => {
              if (latest?.guest_id) void beginMatch(session, latest);
            });
          }
        });
        waitForGuest(session, room);
      } catch (err) {
        setStatus(err instanceof Error ? err.message : 'Не удалось создать комнату');
      }
    })();
  });

  lobbyEl.querySelector('[data-action="join-room"]')?.addEventListener('click', () => {
    void joinWithCode(joinInput.value);
  });

  joinInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') void joinWithCode(joinInput.value);
  });

  joinInput.addEventListener('input', () => {
    joinInput.value = joinInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  });

  async function joinWithCode(raw: string): Promise<void> {
    try {
      starting = false;
      clearHostPoll();
      setStatus('Подключаемся…');
      const room = await joinRoom(raw);
      const bg = roomBackground(room);

      if (!room.guest_id) {
        // Shouldn't happen for guest path
        setStatus('Ожидаем хоста…');
        return;
      }

      const session = await NetSession.connect('guest', room.code, room.id);
      activeSession = session;
      await session.notifyPeer('joined');
      setStatus('Соперник найден, старт…');
      game.startOnline(session, room.seed, bg);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Не удалось войти');
    }
  }

  lobbyEl.querySelector('[data-action="lobby-back"]')?.addEventListener('click', () => {
    clearHostPoll();
    starting = false;
    if (activeSession) {
      void activeSession.destroy();
      activeSession = null;
    }
  });

  // Deep link ?room=CODE
  const params = new URLSearchParams(location.search);
  const roomParam = params.get('room');
  if (roomParam) {
    game.openLobby();
    joinInput.value = roomParam.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    void joinWithCode(roomParam);
  }

  void getPlayerId();
}

export function createWormGrin(
  container: HTMLElement,
  options: GameOptions = {},
): GameHandle {
  const ui = createUiShell(container);
  const game = new Game(ui.canvas, ui, options);
  bindLobby(game, ui.lobbyEl);

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
