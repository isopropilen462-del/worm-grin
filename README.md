# Worm Grin

Пошаговая артиллерийская дуэль в стиле **Worms** для бренда **Grinvich**. Команды червяков сражаются на разрушаемом острове; игра на **Canvas 2D + TypeScript** и готова к встраиванию на сайт.

## Запуск

```bash
npm install
npm run dev
```

Откройте URL из терминала (обычно `http://localhost:5173`).

## Сборка

```bash
# Демо-приложение
npm run build

# Библиотека для встраивания
npm run build:lib
```

## Встраивание на сайт

```html
<div id="game"></div>
<script type="module">
  import { createWormGrin } from './dist/worm-grin.js';

  const game = createWormGrin(document.getElementById('game'), {
    onMatchEnd: (winner) => console.log('winner', winner),
  });

  // game.pause();
  // game.resume();
  // game.restart();
  // game.destroy();
</script>
```

### API

```ts
createWormGrin(container: HTMLElement, options?: {
  width?: number;
  height?: number;
  onMatchEnd?: (winner: 'player' | 'opponent' | 'draw') => void;
}): {
  destroy(): void;
  pause(): void;
  resume(): void;
  restart(): void;
}
```

## Режимы

- **vs AI** — команда Grinvich против бота
- **Hotseat 2P** — два игрока за одной клавиатурой

По 3 червяка на сторону. Ход ~30 секунд, случайный ветер каждый ход.

## Оружие

| Клавиша | Оружие | Поведение |
|--------|--------|-----------|
| 1 | Базука | Баллистика, взрыв при попадании в землю или червяка |
| 2 | Граната | Таймер, отскоки от земли |
| 3 | Удар | Ближний бой |
| 4 | Дробовик | 6 дробинок, короткая дистанция |
| 5 | Динамит | Устанавливается на землю, мощный взрыв через 3 с |
| 6 | Авиаудар | Метка на карте, ракета падает сверху |

## Фоны

Каждый матч случайно выбирает один из четырёх фонов: **День**, **Закат**, **Ночь**, **Шторм** (меняются небо, вода и атмосфера).

## Управление

- `A` / `D` или ← → — ходьба
- `W` / ↑ — прыжок (с буфером и coyote-time)
- `Q` / `E` — прицел
- `Space` / `X` — зажать для силы, отпустить для выстрела
- Touch: тап и удержание для прицела и силы

## Стек

- Vite + TypeScript
- Canvas 2D (без игрового движка)
- UI: бренд Grinvich (signal yellow + black), Space Grotesk

## Лицензия

MIT
