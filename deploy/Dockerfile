# Full-stack production image: builds the frontend + backend and serves BOTH from the one Nest process
# (SPA + REST + socket.io on a single origin). Build context is the REPO ROOT.

# ── Stage 1: build the frontend (Vite) ──────────────────────────────────────
FROM node:22-bookworm AS frontend
WORKDIR /fe
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY frontend/ ./
# Baked into the bundle at build time — must equal the backend's INTERNAL_API_KEY.
ARG VITE_API_KEY=dev-steward-key
ENV VITE_API_KEY=$VITE_API_KEY
RUN pnpm build   # → /fe/dist

# ── Stage 2: build + run the backend, serving the frontend build ────────────
FROM node:22-bookworm AS app
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
COPY ecx-backend/package.json ecx-backend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY ecx-backend/ ./
RUN pnpm prisma generate && pnpm build

# Bring the built SPA in; Nest's ServeStaticModule serves it (gap #18).
COPY --from=frontend /fe/dist ./frontend-dist
ENV FRONTEND_DIST=/app/frontend-dist

EXPOSE 3000
CMD ["sh", "-c", "pnpm prisma migrate deploy && (pnpm exec ts-node prisma/seed.ts || echo 'seed skipped') && node \"$(find dist -name main.js | head -1)\""]
