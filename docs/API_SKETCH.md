# API Sketch — REST + WebSocket (Week-0 draft)

> A **starting draft** for A + B + F to ratify, not a frozen contract. Payload shapes reference the
> types in [`ecx-backend/src/contracts`](../ecx-backend/src/contracts). Auth in Week 0 is the header
> dev-stub (`DevAuthGuard`); Week 1 swaps in JWT/OTP. All money fields are integer **kobo**.

## Conventions
- Base URL: `/api` · JSON · `Authorization: Bearer <jwt>` (W1) or dev headers `x-user-id`,
  `x-account-id`, `x-role`, `x-channel`, `x-credential-id` (W0).
- Errors: `{ statusCode, error, message }` (Nest default).
- Every state-changing payment call carries an `idempotencyKey` (D7: `{channel}:{sessionId}:{turnId}`).

## REST

### Spine (Dev A)
| Method | Path | Body / Query | Returns | Notes |
|--------|------|--------------|---------|-------|
| POST | `/api/intents` | `InitiatePaymentInput` | `{ intent, decision }` | The curl-able Week-1 exit gate. Wraps `PaymentOrchestrator.initiatePayment`. |
| GET | `/api/intents/:id` | — | `PaymentIntent` | Status polling. |
| GET | `/api/accounts/:id/transactions` | `?limit` | `TxSummary[]` | Activity view feed. |
| GET | `/api/accounts/:id/summary` | `?month=YYYY-MM` | `{ text }` | "What went out this month". |
| GET | `/api/credentials/:id/policy` | — | `PolicySummary` | Human-readable rules. |
| POST | `/api/credentials/:id/revoke` | — | `Credential` | Instant revoke (checked at eval time). |
| GET | `/api/accounts/:id/audit` | `?cursor&limit` | `AuditEvent[]` | Append-only, no delete. |

### Agent & channels (Dev B)
| Method | Path | Body | Returns | Notes |
|--------|------|------|---------|-------|
| POST | `/api/agent/message` | `{ sessionId, channel, text }` | `{ reply, toolTrace? }` | Text-first agent loop (W2). `toolTrace` feeds the demo console. |
| POST | `/api/cosign/:intentId/resolve` | `{ approve: boolean }` | `CosignRequest` | Trusted contact approve/deny → emits `cosign.resolved`. |
| GET | `/api/cosign/pending` | — | `CosignRequest[]` | For the `/cosign` view on load; live updates via WS. |
| POST | `/api/channels/voice/webhook` | AT payload | AT XML/actions | Africa's Talking voice (W3). |
| POST | `/api/channels/whatsapp/webhook` | WA payload | `200` | WhatsApp or mock (W3). |

## WebSocket (socket.io, D6)
Namespace `/` (Week 0). Server → client events mirror the domain event bus:

| Event | Payload | Consumer |
|-------|---------|----------|
| `connected` | `{ ok, id }` | handshake ack |
| `pong` | `{ ts, echo }` | health check (`emit('ping')`) |
| `intent.escalated` | `IntentEscalatedPayload` | `/cosign` + `/demo/console` |
| `cosign.resolved` | `CosignResolvedPayload` | `/cosign` + owner-notify |
| `intent.executed` | `IntentExecutedPayload` | `/demo/console`, `/dashboard` |

Client → server: `ping` (health); Week 2 adds `subscribe:{accountId}` rooms so a trusted contact only
receives their owner's events.

## Open for the team to decide
- Rooms/namespacing: per-account rooms vs a single demo-console firehose namespace.
- Whether `/api/agent/message` streams (SSE/WS) tokens for latency, or returns once.
- Pagination style for audit (cursor vs offset).
