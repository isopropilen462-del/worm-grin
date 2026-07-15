import { createWormGrin } from './embed';

const app = document.querySelector<HTMLElement>('#app');
if (app) {
  createWormGrin(app, {
    onMatchEnd: (winner) => {
      document.title = `Worm Grin — ${winner}`;
    },
  });
}
