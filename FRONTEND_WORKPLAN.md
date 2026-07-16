# Frontend Workplan — Dev F

> How the single frontend developer builds the Next.js app in parallel with the backend, against the
> API/WS contract rather than a finished backend. Companion to [`PROJECT.md`](PROJECT.md) (state),
> [`PRD.md`](PRD.md) §8 (surfaces), and [`docs/API_SKETCH.md`](docs/API_SKETCH.md) (the contract).
> When a surface ships or the contract changes, update this file **and** the `PROJECT.md` status board.

**Core principle (mirrors the backend):** build against the **contract + mocks**, not a live backend.
Use MSW (Mock Service Worker) to fake the REST/WS shapes from [`API_SKETCH.md`](docs/API_SKETCH.md) so
every screen is buildable in Week 1; swap to the real endpoints as Dev A/B ship them. The backend's
`POST /api/intents` + seed already run locally, so the demo console can hit real data early.

---

## 1. Stack (locked)

| Concern | Choice | Note |
|---|---|---|
| Framework | **Next.js (App Router) + TypeScript** | RSC where it helps; client components for realtime views |
| Styling | **Tailwind CSS** | plus a tiny design-token layer for the large-type / high-contrast a11y theme |
| Server state | **TanStack Query** | REST reads/writes, caching, retries |
| Realtime | **socket.io-client** | matches the Nest gateway (D6); cosign + demo console streams |
| Forms | react-hook-form + zod | zod schemas mirror the contract DTOs |
| Mocking | **MSW** | fake REST/WS until backend endpoints land |
| A11y testing | axe-core / jest-axe + manual screen-reader | this is an accessibility product — judges will check |

---

## 2. Accessibility is a first-class requirement (not polish)

The beachhead users are elderly / low-vision / low-literacy. Every owner-facing surface must, from day 1:
- Meet **WCAG AA** contrast; support a **large-type** mode; respect `prefers-reduced-motion`.
- Be fully **keyboard navigable** with visible focus; correct **landmarks, roles, labels**; live regions
  for realtime updates (cosign requests, demo events) so screen readers announce them.
- Render policy/audit in **plain language** (the backend supplies `humanReadable` strings — don't
  re-derive rules in the UI).

Treat an inaccessible screen as unfinished, the same way the backend treats a stale `PROJECT.md`.

---

## 3. Surfaces, by demo-criticality (PRD §8)

Ranked so that if time runs short (R6), the top survives and the bottom is cut.

| Priority | Route | Role | Why it matters |
|---|---|---|---|
| **P0** | `/demo/console` | judges | The split-screen money shot: live intents → policy verdicts + reason codes → agent replies. |
| **P0** | `/cosign` | trusted contact | Live escalations via WS, full context, approve/deny. Core to F4. |
| **P1** | `/activity` | owner/contact | Audit trail with plain-speech explanations. Proves auditability. |
| **P1** | `/demo/simulator` | judges | Trigger scam + prompt-injection scenes (F2/F3). |
| **P2** | `/dashboard` | trusted contact | Monthly picture, anomaly flags, credential health. |
| **P2** | `/policy` | owner/contact | Rules per credential, one-tap revoke. |
| **P3** | `/onboarding` | owner + contact | Plain-language policy wizard. High value but heavy; can be scripted/faked for demo. |
| **P3** | owner web login | owner | D2 kept it, but it's the first cut candidate under R6. |
| **P3** | human-delegate views | delegate | D3 kept it; second cut candidate under R6. |

**R6 guardrail:** protect P0/P1. Owner-web-login (D2) and human-delegate (D3) are the explicit cut
candidates — drop them before the demo console or cosign if Week 2 slips.

---

## 4. Consuming the contract

The frontend needs a handful of DTOs (`PaymentIntent`, `PolicyDecision`, `PolicyReasonCode`, the WS
event payloads). Two options:
- **Recommended (low-effort):** mirror them in `frontend/src/lib/contracts.ts` (they're small and
  stable) + zod schemas for validation. Manual sync; drift risk is low over 3 weeks.
- **Nicer (more setup):** promote `ecx-backend/src/contracts` into a workspace package
  `@steward/contracts` both apps import. Do this only if the repo-layout decision (below) goes monorepo.

Reason codes → plain speech: the backend already returns `humanReadable`/reason codes; keep a single
`reasonToText` map in the UI for the demo console, matching the agent's phrasing.

---

## 5. Repo layout — decide first (blocks F)

**Recommendation:** keep one repo. Add `frontend/` as a Next app alongside `ecx-backend/` in the
existing pnpm workspace. Share types via the low-effort mirror (§4). Skip heavy monorepo tooling
(Nx/Turbo) — not worth it for a 3-week build. Revisit `@steward/contracts` only if type drift bites.
_(This is the open Week-0 "repo layout" item — confirm, then scaffold.)_

---

## 6. Week-by-week (aligned to backend milestones)

### Week 1 — scaffold + build against mocks
- [ ] Confirm repo layout; scaffold `frontend/` (Next App Router, TS, Tailwind, TanStack Query, socket.io-client).
- [ ] A11y foundation: design tokens, large-type theme, focus styles, `prefers-reduced-motion`, axe in CI.
- [ ] MSW mocks for the `API_SKETCH.md` REST + WS shapes.
- [ ] `/onboarding` + `/policy` (P2/P3) against mocks — plain-language rule rendering + confirm sentence.
- [ ] `reasonToText` map + a `PolicyDecision` badge component (ALLOW/ESCALATE/DENY).

### Week 2 — wire the realtime surfaces (exit: demo scenes visible in the UI)
- [ ] `/demo/console` (P0): subscribe to `intent.escalated` / `intent.executed` over WS; render the live
      intent → decision → reason stream. Point at the **real** backend + seed.
- [ ] `/cosign` (P0): pending list via REST, live updates via WS, approve/deny → `POST /api/cosign/:id/resolve`.
- [ ] `/activity` (P1): audit trail from `GET /api/accounts/:id/audit` with plain-speech lines.
- [ ] Swap MSW → real endpoints as Dev A/B ship them; keep MSW for anything not yet live.

### Week 3 — the demo scenes + a11y hardening
- [ ] `/demo/simulator` (P1): buttons to fire the scam (F2) and prompt-injection (F3) scenarios.
- [ ] `/dashboard` (P2): monthly picture + anomaly flags.
- [ ] Full **accessibility audit** (screen reader pass, keyboard-only pass, contrast) on P0/P1 surfaces.
- [ ] Demo rehearsal support: split-screen layout for the judge screen; resilient reconnect on the WS.

---

## 7. Working agreements
- **Contract, not backend.** Build every screen against MSW/contract types first; wire real endpoints as
  they land. Never block on a backend endpoint that doesn't exist yet.
- **No business logic in the UI.** Verdicts, reasons, and policy sentences come from the backend; the UI
  formats, it doesn't decide. (Keeps the deterministic boundary honest.)
- **A11y is done-criteria.** A surface isn't done until it passes axe + a keyboard pass.
- **Coordinate at the seam.** REST/WS shape changes are a joint event with Dev A/B — reflect them in
  `API_SKETCH.md` and here.
