# Steward backend image — builds the NestJS app; on boot it applies migrations, seeds demo data,
# then starts. Used by docker-compose so `docker compose up` brings the whole backend up.
FROM node:22-bookworm

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

# Dependencies (cached layer — only reinstalls when the lockfile changes)
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# App source + build
COPY . .
RUN pnpm prisma generate && pnpm build

EXPOSE 3000

# migrate → seed (non-fatal) → start. The main.js path is resolved dynamically so it works whether
# `nest build` emits dist/main.js or dist/src/main.js.
CMD ["sh", "-c", "pnpm prisma migrate deploy && (pnpm exec ts-node prisma/seed.ts || echo 'seed skipped') && node \"$(find dist -name main.js | head -1)\""]
