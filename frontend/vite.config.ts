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
      '/demo': proxy,
      '/cosign': proxy,
      '/auth': proxy,
      '/voice': proxy,
      '/socket.io': { ...proxy, ws: true },
      '/accounts': proxy,
      '/credentials': proxy,
    },
  },
});
