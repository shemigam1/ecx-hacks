import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Single-origin story: the app uses RELATIVE URLs. In dev, Vite proxies the API + WS to the NestJS
// backend (no CORS). In prod, Nest serves this build's static files, so relative paths just work.
const backend = process.env.VITE_BACKEND ?? 'http://localhost:3000';
const proxy = { target: backend, changeOrigin: true } as const;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/agent': proxy,
      // NB: prefixes must not swallow SPA page routes. '/demo' would capture the /demo/console and
      // /demo/simulator pages on hard reload, and '/cosign' the /cosign page — so match only the
      // actual API paths ('/demo/scenario' also prefixes '/demo/scenarios'; '/cosign/' matches
      // /cosign/pending and /cosign/:id/resolve but not the bare /cosign page).
      '/demo/scenario': proxy,
      '/cosign/': proxy,
      '/auth': proxy,
      '/voice': proxy,
      '/socket.io': { ...proxy, ws: true },
      '/accounts': proxy,
      '/credentials': proxy,
    },
  },
});
