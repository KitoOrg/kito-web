import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// `npm run dev` serves the client alone and passes what it asks on to a
// `kito web` running on its usual port: open the address that one printed
// first, so that the browser holds its cookie. `KITO_WEB_SERVER` names
// another one to ask: a team's server on this machine
// (`KITO_WEB_SERVER=http://127.0.0.1:7443 npm run dev`).
const server = process.env.KITO_WEB_SERVER || 'http://127.0.0.1:7423';

export default defineConfig({
  plugins: [svelte()],
  // Its files are named from where it is: a server may have it under a path.
  base: './',
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022' },
  server: { proxy: { '/api': server, '/-': server } },
});
