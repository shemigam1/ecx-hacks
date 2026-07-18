# Frontend Implementation Plan

> Concrete build plan for the now-scaffolded `frontend/` app. Companion to
> [`FRONTEND_WORKPLAN.md`](../FRONTEND_WORKPLAN.md) (surfaces + a11y policy) and
> [`docs/API_SKETCH.md`](API_SKETCH.md) (the REST/WS contract). _Last updated 2026-07-18._

## Stack decision (supersedes the earlier Next.js default)
**Vite + React SPA** — not Next. Rationale: Steward's web app is an auth-gated, realtime, API-backed
dashboard with no SSR/SEO need; a Vite SPA is faster to build, and can be **served straight from the
NestJS server as one deployable** (single origin, no CORS). See the chat discussion for the full
comparison.

## What's scaffolded (done)
- `frontend/` — Vite + React + TS. Deps installed: `react-router-dom`, `@tanstack/react-query`,
  `socket.io-client`, `tailwindcss` (v4) + `@tailwindcss/vite`.
- `vite.config.ts` — dev **proxy** for `/agent /demo /cosign /auth /voice /socket.io` → `localhost:3000`,
  so the app uses **relative URLs** in dev (no CORS) and in prod (served from Nest).
- Builds green. **No app code yet** (default Vite starter still in place).

## Architecture (baked into the scaffold)
- **Relative URLs everywhere** → dev proxy in dev, same-origin in prod.
- **Single origin in prod:** Nest serves `frontend/dist` (see "Serve from Nest" below).
- **Auth:** every request sends the `x-api-key` header (interim guard, gap #6); authed calls also send
  `Authorization: Bearer <jwt>` (gap #7). WS connects with `io({ auth: { token: apiKey } })`.
  ⚠️ The api-key ships in the client bundle (inherent to a shared secret) — real per-user security is
  the JWT; treat the key as "not wide open," not "secret."
- **Tailwind v4** (`@import "tailwindcss"` in `index.css`; no config file needed).

---

## Build order

### Phase 0 — foundation (do first; ~½ day)
- [ ] `src/lib/env.ts` — read `VITE_API_KEY` (default `dev-steward-key`).
- [ ] `src/lib/types.ts` — mirror the contract DTOs (`PolicyDecision`, `PolicyReasonCode`, WS payloads,
      `ScenarioResult`, `AuthPrincipal`). Small + stable; hand-mirror from `ecx-backend/src/contracts`.
- [ ] `src/lib/api.ts` — typed `fetch` client: injects `x-api-key` + `Bearer`, JSON, throws `ApiError`.
- [ ] `src/lib/authStore.ts` — JWT in `localStorage` + `getToken()`.
- [ ] `src/lib/socket.ts` — singleton socket.io client (`io({ auth: { token } })`) + `useSocketEvent` hook.
- [ ] `src/lib/reasonText.ts` — `PolicyReasonCode` → plain-speech sentence (matches the agent's phrasing).
- [ ] `src/components/Layout.tsx` — skip-link, `<nav>`, `<main id="main">`, large-type theme.
- [ ] `src/components/VerdictBadge.tsx` — ALLOW/ESCALATE/DENY pill (color + text, AA contrast).
- [ ] `src/main.tsx` — `QueryClientProvider` + `RouterProvider`. Router with the routes below.
- [ ] `src/index.css` — Tailwind import + the a11y base (large type, `:focus-visible`, reduced-motion, light/dark).

### Phase 1 — P0 demo surfaces (the money shot; ~2–3 days)
- [ ] **`/demo/console`** — on mount, `socket.emit('subscribe', { demo: true })`; listen for
      `demo.decision`, `intent.escalated`, `intent.executed`, `intent.voided`, `cosign.resolved`;
      render a live, newest-first stream of intent → `VerdictBadge` + reason codes + agent reply.
      This is the split-screen judge view.
- [ ] **`/demo/simulator`** — `GET /demo/scenarios` → buttons; each fires `POST /demo/scenario {name}`.
      Watching `/demo/console` react is the demo. (F1/F3/F4/channel_scope already exist server-side.)
- [ ] **`/cosign`** — `GET /cosign/pending` list; live-add on `intent.escalated`; Approve/Deny →
      `POST /cosign/:intentId/resolve`; row resolves on `cosign.resolved`. Requires login (Phase 1 Login).
- [ ] **`/login`** — OTP: `POST /auth/otp/request {phone}` (shows devCode in dev) → `POST /auth/otp/verify`
      → store JWT. Gate authed routes.

### Phase 2 — P1 (~1 day)
- [ ] **`/activity`** — audit trail (needs a backend `GET /accounts/:id/audit` — currently missing; see API sketch).
- [ ] **`/policy`** — rules per credential + revoke (needs `GET /credentials/:id/policy` + revoke endpoint).

### Phase 3 — P2 (R6 cut candidates)
- [ ] `/dashboard`, `/onboarding`, owner-web-login, human-delegate views.

---

## Backend integration reference
| Need | Endpoint / event | Status |
|---|---|---|
| Fire demo scenes | `GET /demo/scenarios`, `POST /demo/scenario` | ✅ live |
| Live event stream | WS `demo.decision`, `intent.*`, `cosign.resolved` (subscribe `{demo:true}`) | ✅ live |
| Cosign | `POST /cosign/:intentId/resolve`, `GET /cosign/pending` | ✅ resolve live; verify pending route |
| Login | `POST /auth/otp/request|verify`, `GET /auth/me` | ✅ live |
| Agent chat (optional web) | `POST /agent/message` | ✅ live |
| Activity / Policy views | `GET /accounts/:id/audit`, `GET /credentials/:id/policy` | ❌ **not built** (Dev A/B) |

## Serve from Nest (single origin, prod) — one backend step
Add to the backend: `pnpm add @nestjs/serve-static`, then in `AppModule`
`ServeStaticModule.forRoot({ rootPath: <frontend/dist>, exclude: ['/agent*','/demo*','/cosign*','/auth*','/voice*'] })`.
Build the SPA (`pnpm --dir frontend build`) → Nest serves it at `/`. One process, no CORS, ngrok-friendly.

## Accessibility (WCAG AA — judged)
Skip-link · keyboard-navigable with visible focus · landmarks/roles/labels · **live regions** so screen
readers announce incoming console/cosign events · AA contrast · large-type + reduced-motion · plain-speech
reason text from the backend (don't re-derive rules in the UI).

## Testing
Vitest + React Testing Library for components; **jest-axe** on P0 screens; a manual keyboard + screen-reader pass.

## Env
`frontend/.env`: `VITE_API_KEY=dev-steward-key` (match backend `INTERNAL_API_KEY`), optional
`VITE_BACKEND=http://localhost:3000` for the dev proxy target.

## Rough sequence
Phase 0 → console + simulator (Tier-1 demo visible) → cosign + login → activity/policy → polish + a11y audit.
Cut order under time pressure per [`PATH_TO_DEMO.md`](PATH_TO_DEMO.md): never cut console/simulator/cosign.
