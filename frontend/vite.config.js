import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// `npm run dev` serves the client alone and passes what it asks on to a
// `kito web` running on its usual port: open the address that one printed
// first, so that the browser holds its cookie.
export default defineConfig({
  plugins: [svelte()],
  // Its files are named from where it is: a server may have it under a path.
  base: './',
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022' },
  server: { proxy: { '/api': 'http://127.0.0.1:7423', '/-': 'http://127.0.0.1:7423' } },
});
