import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => {
  if (mode === 'lib') {
    return {
      build: {
        lib: {
          entry: 'src/embed.ts',
          name: 'WormGrin',
          fileName: 'worm-grin',
          formats: ['es', 'umd'],
        },
        rollupOptions: {
          output: {
            assetFileNames: 'worm-grin.[ext]',
          },
        },
      },
    };
  }

  return {};
});
