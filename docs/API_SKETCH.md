# API Sketch — REST + WebSocket

> A starting draft for A + B + F to ratify. Payload shapes reference the types in
> [`ecx-backend/src/contracts`](../ecx-backend/src/contracts). All money fields are integer **kobo**.
> **Reconciled 2026-07-16** to reflect the spine that actually shipped (PRs #1–3).

## Conventions
- JSON. Money is integer kobo. Every payment call carries `idempotencyKey` (D7: `{channel}:{sessionId}:{turnId}`).
- Auth: **not yet wired** (the dev-stub guard was removed in the spine merge). To re-add for Dev B's
  surfaces: header dev-stub in Week 1 → JWT/OTP in Week 2.

## REST — as-built vs intended

| Method | Path (as-built) | Intended | Owner | Notes |
|--------|-----------------|----------|-------|-------|
| POST | `/payments/initiate` | `/api/intents` | A | **Live.** `PaymentTestController` → `PaymentOrchestrator.initiatePayment`. Returns `{ intent, decision }`. No global `api` prefix / auth yet. |

### Intended additions (not yet built)
| Method | Path | Owner | Notes |
|--------|------|-------|-------|
| GET | `/api/intents/:id` | A | status polling |
| GET | `/api/accounts/:id/transactions` | A | activity feed → `TxSummary[]` |
| GET | `/api/accounts/:id/summary?month=YYYY-MM` | A | "what went out this month" |
| GET | `/api/credentials/:id/policy` | A | `PolicySummary` (plain-language rules) |
| POST | `/api/credentials/:id/revoke` | A | instant revoke |
| GET | `/api/accounts/:id/audit` | A | append-only log |
| **POST** | **`/api/agent/message`** | **B** | `{ sessionId, channel, text }` → `{ reply, toolTrace? }`. Text-first agent loop; `toolTrace` feeds the demo console. |
| POST | `/api/cosign/:intentId/resolve` | B | `{ approve }` → emits `cosign.resolved` (orchestrator's `@OnEvent` handler resumes/voids) |
| GET | `/api/cosign/pending` | B | for `/cosign` on load |
| POST | `/api/channels/voice/webhook` | B | Africa's Talking (W3) |

## WebSocket (socket.io, D6) — **gateway not yet in the tree** (removed in merge; Dev B re-adds)
Server → client events mirror the domain bus in [`contracts/events.ts`](../ecx-backend/src/contracts/events.ts):

| Event | Payload | Consumer |
|-------|---------|----------|
| `intent.escalated` | `IntentEscalatedPayload` | `/cosign` + `/demo/console` |
| `cosign.resolved` | `CosignResolvedPayload` | `/cosign` + owner-notify |
| `intent.executed` | `IntentExecutedPayload` | `/demo/console`, `/dashboard` |

Note: the orchestrator **already emits** `intent.escalated` / `intent.executed` / `intent.voided`; it
just needs a socket.io gateway to bridge those to clients (Dev B, Week 2).

## Open for the team
- Add the `api` global prefix + auth guard back (Dev B, for agent/cosign surfaces).
- Rooms/namespacing: per-account rooms vs single demo-console firehose.
- Does `/api/agent/message` stream tokens (latency) or return once?
