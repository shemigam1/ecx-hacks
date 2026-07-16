# Backend Workplan — Dev A & Dev B

> How the two backend developers split the NestJS work so they run in parallel with minimal blocking.
> Companion to [`PROJECT.md`](PROJECT.md) (state) and [`PRD.md`](PRD.md) (spec). When ownership or a
> seam changes, update this file **and** the `PROJECT.md` status board.

**Core principle:** Dev A owns the **deterministic spine** and exposes it behind **service interfaces**.
Dev B builds the **brain & edges** against those interfaces — using **fakes** until the real
implementations land. Neither waits on the other's internals; they meet only at the seams in §3.

---

## 1. Ownership

| | **Dev A — the Spine** (deterministic, testable, no external services) | **Dev B — the Brain & Edges** (LLM, real-time, external services) |
|---|---|---|
| Modules | `PolicyModule`, `PaymentsModule`, `AuditModule`, `AnomalyModule` (statistical), plus **Postgres schema + migrations** and the **habits** computation | `AgentModule`, `ChannelsModule` (Voice/WhatsApp/Web), `CosignModule`, `AuthModule` |
| Owns the DB schema | ✅ single migration set (both add columns via PR, A reviews) | consumes it |
| External deps | none (pure TS + Postgres) | Anthropic API, Africa's Talking, STT/TTS, WebSocket, WhatsApp |
| Superpower it protects | the policy engine's determinism & test coverage | the conversation loop & channel correctness |

**Why this cut:** the critical invariant (LLM → `initiate_payment` → policy engine → provider) becomes a
**team boundary**. Dev A's half has zero AI and zero network; it can be unit-tested to death and is the
demo's credibility. Dev B's half is where all the risk (latency, STT, telephony) lives, isolated behind
interfaces.

**Load-balance note (R6/Week 3):** Dev B's Week 3 (voice) is the heaviest week on the project; Dev A's
spine is essentially done by end of Week 2. So **Dev A absorbs overflow in Week 3** — owns the WhatsApp
mock, the demo-console backend feed, anomaly, seed data, and acts as the integration fixer. Rebalance
at the end of Week 2.

---

## 2. Critical path & dependency order

```
Week 0  shared contract types + service interfaces + event names   ← JOINT, do first
        └─ Dev A: schema draft + migration tooling
        └─ Dev B: Nest module skeletons + EventEmitter + WS choice

Week 1  Dev A: schema ─► PolicyModule(+tests) ─► PaymentsModule(mock) ─► AuditModule ─► PaymentOrchestrator(real) ─► REST curl endpoint   [EXIT: curl-able ALLOW/ESCALATE/DENY]
        Dev B: AuthModule ─► Agent tool-loop against FAKE orchestrator + FAKE context ─► WS gateway scaffold

Week 2  Dev A: habits + HabitQuery ─► audit summarization ─► wire REAL orchestrator to B ─► anomaly (statistical)
        Dev B: swap fake→real orchestrator ─► full tool loop ─► CosignModule (held-intent) ─► text-chat E2E of every demo scene   [EXIT: text version of all scenes works]

Week 3  Dev B: VoiceAdapter(AT) ─► STT/TTS pipeline ─► DTMF PIN auth ─► token read-back ─► WhatsApp adapter/mock ─► local-language pass
        Dev A: anomaly LLM scam-pass (optional) ─► policy edge hardening ─► demo seed data ─► demo-console feed ─► integration support   [EXIT: live feature-phone call works twice]
```

**The only hard blocker:** Dev A must ship the **schema** and the **service interfaces** (not
implementations — just the TS interfaces + fakes) by end of Week 0, or Dev B is blocked. Everything
else is decoupled by the fakes.

---

## 3. The seams (the only places A & B touch)

Put these interfaces in `ecx-backend/src/contracts/` so both import the same types. Dev A ships the
**interface + a fake** in Week 0; the **real impl** follows. Dev B always codes against the interface.

### Seam 1 — Payment orchestration (the big one)
The single entrypoint behind the agent's `initiate_payment` tool. **Dev A owns; Dev B calls.**

```ts
interface PaymentOrchestrator {
  // Creates intent → evaluates policy → ALLOW: executes via provider;
  // ESCALATE: persists held intent + emits 'intent.escalated'; DENY: records. Idempotent on key.
  initiatePayment(input: InitiatePaymentInput): Promise<{ intent: PaymentIntent; decision: PolicyDecision }>;

  // Called by CosignModule after approval: re-checks (revocation!) and executes the held intent.
  resumeIntent(intentId: string): Promise<{ intent: PaymentIntent }>;

  // Called on cosign deny / TTL expiry.
  voidIntent(intentId: string, reason: string): Promise<void>;
}
```

### Seam 2 — Read models for the agent's tools. **Dev A owns; Dev B calls.**
```ts
interface ContextQuery {
  getUserContext(userId: string): Promise<UserContext>;         // habits summary, language, recent activity
  getPolicySummary(credentialId: string): Promise<PolicySummary>;
  listRecentTransactions(accountId: string, opts): Promise<TxSummary[]>;
  summarizeMonth(accountId: string, month: string): Promise<string>; // "what went out this month"
  readLastToken(intentId: string, reauthOk: boolean): Promise<string>;
}
```

### Seam 3 — Events (decouples cosign & anomaly). Nest `EventEmitter2`. **Both publish/subscribe.**
```
'intent.escalated'  { intentId, accountId, amount, reasons }   A emits → B(Cosign) consumes
'intent.executed'   { intentId, ... }                          A emits → A(Anomaly)+B(notify) consume
'intent.voided'     { intentId, reason }                       A emits → B(notify owner) consumes
'cosign.resolved'   { intentId, approve, byUserId }            B emits → A(resumeIntent/voidIntent)
'audit.appended'    { accountId, event }                       A emits → A(Anomaly) consumes
```

### Seam 4 — Auth guards for REST/WS. **Dev B owns; Dev A's REST endpoints consume the guard.**
Dev B provides the JWT/session guard + scoped-credential resolver; Dev A's curl/REST endpoints and the
demo console apply it. Until it exists, Dev A uses a dev-only header stub.

---

## 4. Per-developer task lists (mirror of `PROJECT.md` status board)

### Dev A
- **W0:** schema draft + migration tooling; ship `PaymentOrchestrator`/`ContextQuery` **interfaces + fakes**; agree event names.
- **W1:** full schema + migrations (money = integer kobo); `PolicyModule` + **exhaustive boundary tests** (cap met / cap+₦1 / revoked / expired / channel scope; DENY>ESCALATE>ALLOW precedence); `PaymentsModule`: **aggregator-ready `PaymentProvider` interface (D8)** — `verifyCustomer`, `vend` returning token *or* PENDING+providerRef, `requeryStatus`, idempotency via provider `request_id` — plus `MockProvider` (20-digit token, seeded billers, latency); `AuditModule` append-only; real `PaymentOrchestrator`; REST endpoint to curl an intent → decision.
- **W2:** habits computation + `ContextQuery` real impl; audit month-summary; integrate real orchestrator with Dev B; `AnomalyModule` statistical baseline (z-score/EWMA) consuming `audit.appended`.
- **W3:** optional anomaly LLM scam-pass; policy edge hardening; demo seed data; demo-console event feed; **integration fixer** for voice.

### Dev B
- **W0:** Nest module skeletons; `EventEmitter2` wiring; socket.io vs native WS decision; auth guard interface.
- **W1:** `AuthModule` (owner phone+OTP / email-pass JWT, delegate scoped tokens, DTMF PIN verify + lockout + trusted-contact notify); `AgentModule` skeleton — Anthropic tool-use loop with all 7 tool defs — running against the **fake** orchestrator + fake context; WS gateway scaffold.
- **W2:** swap fake → real orchestrator & context; full tool loop with confirm-before-execute + max-iteration guard; `CosignModule` (consume `intent.escalated`, WS push to trusted contact, 15-min TTL, emit `cosign.resolved`, held-intent resolution per `PROJECT.md` §5); **text-chat E2E of every demo scene** (F1–F4).
- **W3:** `VoiceAdapter` (AT answer/record/play, `GetDigits` for PIN + confirm); STT→LLM→TTS pipeline with "one moment" filler + pre-generated clips; DTMF PIN auth end-to-end; token read-back (grouped, twice, repeat); `WhatsAppAdapter` or faithful mock; local-language pass (English + Pidgin guaranteed).

---

## 5. Working agreements

- **Interfaces before implementations.** No cross-dev dependency on a concrete class — only on a
  `contracts/` interface. If you need something from the other's domain that isn't in a seam, add it to
  the seam (with a fake) *first*, then implement.
- **Schema changes go through Dev A** via PR (keeps one coherent migration history), but either dev may
  open the PR.
- **The invariant is a review gate.** Any PR that lets the agent/channel layer reach a provider
  directly, or puts non-deterministic logic in `PolicyModule`, is rejected on sight.
- **Integer kobo** in every signature that carries money. No floats cross a seam.
- **Daily 5-min sync** on the seams only — has any interface in §3 changed? If not, keep building.
