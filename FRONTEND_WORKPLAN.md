# Frontend Workplan — Dev F

> How the single frontend developer builds the Next.js app in parallel with the backend, against the
> API/WS contract rather than a finished backend. Companion to [`PROJECT.md`](PROJECT.md) (state),
> [`PRD.md`](PRD.md) §8 (surfaces), and [`docs/API_SKETCH.md`](docs/API_SKETCH.md) (the contract).
> When a surface ships or the contract changes, update this file **and** the `PROJECT.md` status board.

**Core principle (mirrors the backend):** build against the **contract + mocks**, not a live backend.
Use MSW (Mock Service Worker) to fake the REST/WS shapes from [`API_SKETCH.md`](docs/API_SKETCH.md) so
every screen is buildable in Week 1; swap to real endpoints as Dev A/B ship them. The spine's
`POST /payments/initiate` already runs locally, so the demo console can hit real decisions early.

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

Beachhead users are elderly / low-vision / low-literacy. Every owner-facing surface must, from day 1:
- Meet **WCAG AA** contrast; support a **large-type** mode; respect `prefers-reduced-motion`.
- Be fully **keyboard navigable** with visible focus; correct **landmarks, roles, labels**; live regions
  so screen readers announce realtime updates (cosign requests, demo events).
- Render policy/audit in **plain language** (the backend supplies the strings — don't re-derive rules in the UI).

Treat an inaccessible screen as unfinished.

---

## 3. Surfaces, by demo-criticality (PRD §8)

| Priority | Route | Role | Why it matters |
|---|---|---|---|
| **P0** | `/demo/console` | judges | The split-screen money shot: live intents → policy verdicts + reason codes → agent replies. |
| **P0** | `/cosign` | trusted contact | Live escalations via WS, full context, approve/deny. Core to F4. |
| **P1** | `/activity` | owner/contact | Audit trail with plain-speech explanations. |
| **P1** | `/demo/simulator` | judges | Trigger scam (F2) + prompt-injection (F3) scenes. |
| **P2** | `/dashboard` | trusted contact | Monthly picture, anomaly flags, credential health. |
| **P2** | `/policy` | owner/contact | Rules per credential, one-tap revoke. |
| **P3** | `/onboarding` | owner + contact | Plain-language policy wizard. High value but heavy. |
| **P3** | owner web login | owner | D2 kept it; first cut candidate under R6. |
| **P3** | human-delegate views | delegate | D3 kept it; second cut candidate under R6. |

**R6 guardrail:** protect P0/P1. Owner-web-login (D2) and human-delegate (D3) are the explicit cut
candidates — drop them before the demo console or cosign if Week 2 slips.

---

## 4. Consuming the contract
The frontend needs a handful of DTOs (`PaymentIntent`, `PolicyDecision`, `PolicyReasonCode`, WS event
payloads).
- **Recommended (low-effort):** mirror them in `frontend/src/lib/contracts.ts` + zod schemas. Manual
  sync; drift risk low over 3 weeks.
- **Nicer:** promote `ecx-backend/src/contracts` to a workspace package `@steward/contracts` both apps
  import — only if the repo goes monorepo.

Keep a single `reasonToText` map for turning `PolicyReasonCode`s into plain speech in the demo console,
matching the agent's phrasing.

---

## 5. Repo layout — decide first (blocks F)
**Recommendation:** one repo. Add `frontend/` as a Next app alongside `ecx-backend/` in the pnpm
workspace; share types via the low-effort mirror (§4). Skip Nx/Turbo — not worth it for 3 weeks.

---

## 6. Week-by-week (aligned to backend milestones)

### Week 1 — scaffold + build against mocks
- [ ] Confirm repo layout; scaffold `frontend/` (Next App Router, TS, Tailwind, TanStack Query, socket.io-client).
- [ ] A11y foundation: design tokens, large-type theme, focus styles, `prefers-reduced-motion`, axe in CI.
- [ ] MSW mocks for the `API_SKETCH.md` REST + WS shapes.
- [ ] `/onboarding` + `/policy` (P2/P3) against mocks — plain-language rule rendering + confirm sentence.
- [ ] `reasonToText` map + a `PolicyDecision` badge component (ALLOW/ESCALATE/DENY).

### Week 2 — wire the realtime surfaces (exit: demo scenes visible in the UI)
- [ ] `/demo/console` (P0): subscribe to `intent.escalated` / `intent.executed` over WS; render live stream. Point at real backend.
- [ ] `/cosign` (P0): pending list via REST, live updates via WS, approve/deny → `POST /api/cosign/:id/resolve`.
- [ ] `/activity` (P1): audit trail from the audit endpoint with plain-speech lines.
- [ ] Swap MSW → real endpoints as Dev A/B ship them.

### Week 3 — the demo scenes + a11y hardening
- [ ] `/demo/simulator` (P1): buttons to fire the scam (F2) and prompt-injection (F3) scenarios.
- [ ] `/dashboard` (P2): monthly picture + anomaly flags.
- [ ] Full **accessibility audit** (screen reader, keyboard-only, contrast) on P0/P1 surfaces.
- [ ] Demo rehearsal support: split-screen judge layout; resilient WS reconnect.

---

## 7. Working agreements
- **Contract, not backend.** Build every screen against MSW/contract types first; wire real endpoints as they land.
- **No business logic in the UI.** Verdicts, reasons, policy sentences come from the backend; the UI formats, it doesn't decide.
- **A11y is done-criteria.** A surface isn't done until it passes axe + a keyboard pass.
- **Coordinate at the seam.** REST/WS shape changes are a joint event — reflect them in `API_SKETCH.md` and here.
