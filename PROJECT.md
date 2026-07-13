# Steward — Project Tracker

> **What this file is.** The single source of truth for project state, trajectory, locked decisions,
> ownership, and open risks. Any human or agent picking up work reads this first, then the
> [PRD](#reference). Keep it current: when you finish a task, flip its box and update the
> "Last updated" line. When you make a decision, add it to the Decision Log. Don't let it rot.
>
> Related docs: [`PRD.md`](PRD.md) (product spec) · [`AGENTS.md`](AGENTS.md) (agent working rules) · [`BACKEND_WORKPLAN.md`](BACKEND_WORKPLAN.md) (Dev A/B split).

**Last updated:** 2026-07-13 · **Phase:** Week 0 (pre-build, contract definition) · **Timeline:** ~3 weeks · **Team:** 2 backend (A, B) + 1 frontend (F)

---

## 1. One-line thesis

Steward is a **scoped, revocable, auditable delegation layer for payments**. The product *is* the
boundary: the LLM can be fully fooled, but every payment still passes a **deterministic, server-side
policy engine** with zero AI in it. Beachhead = elderly / low-literacy / low-vision Nigerians who
delegate payments today; platform = the credential primitive every AI agent will need.

**The demo we are building toward:** a live feature-phone call buys a prepaid electricity token,
read back aloud — and a prompt-injection attempt calls `initiate_payment` and is still blocked by the
policy engine, shown live on the judge console.

---

## 2. Locked decisions (2026-07-13)

These were open questions in the PRD. They are now settled. Do not relitigate without updating here.

| # | Decision | Choice | Consequence |
|---|----------|--------|-------------|
| D1 | Phone PIN + confirmations | **DTMF keypad** (AT `GetDigits`) | PIN & yes/no via keypad. STT is used **only** for intent ("buy me light"), never for secrets or amounts. No PIN audio stored. Amounts are confirmed by keypad ("press 1 for ₦5,000"). |
| D2 | Owner web login | **Yes** — owner gets web access too | Owner auth = phone + OTP (or email/pass). Adds UI surface for F. Web is **not** trusted-contact-only. ⚠️ see Risk R6. |
| D3 | Human delegate flow | **Keep it** | Human delegate can log in (web/WhatsApp) and pay allowlisted billers within cap. Same policy path as AI agent — low backend cost, but adds a web flow + a demo scene for F. ⚠️ see Risk R6. |
| D4 | Cosign on a live phone call | **Async callback** | Agent says "I'll ask your daughter and call/text you back," ends the leg. Intent stays **held**; resolves after cosign. Requires held-intent state machine (see §5). |

**Still open** (decide by end of Week 1): TTS provider for Nigerian voices (Spitch / YarnGPT spike);
socket.io vs native WS for the Nest gateway (leaning **socket.io** for reconnect handling).

---

## 3. Ownership split

The whole point of the split is to **parallelize against fixed interfaces** (§4). Minimize cross-talk.
The two backend devs have a detailed, dependency-ordered plan in [`BACKEND_WORKPLAN.md`](BACKEND_WORKPLAN.md).

| Owner | Domain | NestJS modules / surface |
|-------|--------|--------------------------|
| **Dev A** — deterministic spine | Data model, Policy, Payments, Audit | `PolicyModule`, `PaymentsModule` (mock provider), `AuditModule`, Postgres schema + migrations, REST skeleton |
| **Dev B** — agent & channels | Agent orchestration, all channel adapters, cosign, anomaly | `AgentModule`, `ChannelsModule` (Voice/WhatsApp/Web), `CosignModule`, `AnomalyModule`, `AuthModule` |
| **Frontend F** — Next.js app | All web surfaces | Onboarding, policy, activity, cosign, dashboard, demo console + simulator |

**Coupling points (the only places they touch):** the shared TypeScript types in §4 and the REST/WS
API. Agree those first; then A/B/F can build in isolation against mocks.

---

## 4. Interface contract — **define these FIRST (Week 0/1), before feature code**

This is the single highest-leverage coordination artifact. Everything parallelizes once it exists.
Put the real types in a shared location (e.g. `ecx-backend/src/contracts/` and mirror to the frontend).

```ts
// Money is ALWAYS integer minor units (kobo). Never float. Never a JS number for storage math.
type Kobo = number; // integer; ₦5,000 => 500000

type Channel = 'VOICE' | 'WHATSAPP' | 'WEB';

interface PaymentIntent {
  id: string;
  credentialId: string;
  channel: Channel;
  billerId?: string;          // resolved biller (electricity, DSTV, ...)
  recipient?: string;         // account/meter number for transfers
  amount: Kobo;
  meta: Record<string, unknown>;
  status: 'PENDING' | 'ALLOWED' | 'ESCALATED' | 'DENIED' | 'EXECUTED' | 'FAILED' | 'VOIDED';
  idempotencyKey: string;
}

type Verdict = 'ALLOW' | 'ESCALATE' | 'DENY';

// Machine-readable codes; the agent turns these into plain speech.
type PolicyReasonCode =
  | 'RECIPIENT_NOT_ALLOWLISTED'
  | 'BILLER_NOT_ALLOWLISTED'
  | 'MONTHLY_CAP_EXCEEDED'
  | 'PER_TX_CAP_EXCEEDED'
  | 'AMOUNT_ABOVE_COSIGN_THRESHOLD'
  | 'CHANNEL_SCOPE_EXCEEDED'
  | 'OUTSIDE_TIME_WINDOW'
  | 'CREDENTIAL_REVOKED'
  | 'RECIPIENT_LOCK_MISMATCH';

interface PolicyReason { code: PolicyReasonCode; detail?: string; }

interface PolicyDecision {
  verdict: Verdict;
  reasons: PolicyReason[]; // evaluation order: any DENY reason wins over ESCALATE wins over ALLOW
  evaluatedAt: string;
}

// The ONLY payment entrypoint the LLM can reach. Produces an intent; policy-gated downstream.
// initiate_payment(intent) -> { decision, intent }  — the LLM NEVER calls the provider directly.
```

**Rules the contract encodes:**
- `evaluate(intent, credential): PolicyDecision` is **pure, synchronous, no I/O except a cap-lookup it
  is given**, no AI. Verdict precedence: **DENY > ESCALATE > ALLOW**.
- Revocation is checked **at evaluation time**, never cached.
- Every rule type gets boundary unit tests: cap exactly met (ALLOW), cap + ₦1 (DENY/ESCALATE),
  revoked credential, expired session, channel-scope narrower than request.

---

## 5. Held-intent state machine (needed for D4 async cosign)

```
PENDING ──policy──> ALLOWED ──provider──> EXECUTED
   │                   │
   │                   └─(provider err)─> FAILED
   ├──policy──> DENIED
   └──policy──> ESCALATED ──cosign approve──> ALLOWED ─> EXECUTED
                     │
                     ├─cosign deny──> VOIDED  (owner told in plain speech)
                     └─TTL expiry───> VOIDED  (15-min demo TTL)
```
On **voice**, ESCALATED ends the call leg; resolution happens async and the owner is notified by
callback/SMS. On **web/text**, the requester can wait in-session. Idempotency key must survive the hold.

---

## 6. Status board

Legend: ☐ not started · ◐ in progress · ☑ done · ⚠ blocked

### Week 0 — contracts (do before anything else)
- ☐ Shared types committed (`PaymentIntent`, `PolicyDecision`, `PolicyReasonCode`) — **A + B pair**
- ☐ REST + WS API sketch agreed (endpoints, payloads) — **A + B + F**
- ☐ `PolicyRule.params` jsonb schema per `rule_type` documented — **A**
- ☐ Idempotency-key scheme decided (who generates, per what) — **A + B**
- ☐ Repo layout: confirm monorepo vs separate frontend; add `frontend/` — **F**

### Week 1 — the spine (exit: a curl-able intent returns ALLOW/ESCALATE/DENY + reasons)
- ☐ Postgres schema + migrations (all core tables, money as integer kobo) — **A**
- ☐ `PolicyModule` + **full unit test suite** for every rule type & boundary — **A**
- ☐ `PaymentsModule` mock provider (20-digit token, seeded billers, latency, idempotency) — **A**
- ☐ `AuditModule` append-only log (no delete path) — **A**
- ☐ REST skeleton exposing intent → decision — **A**
- ☐ `AuthModule` scaffolding (owner OTP, delegate scoped tokens, DTMF PIN verify stub) — **B**
- ☐ Next.js scaffold + onboarding + policy views (WCAG AA, screen-reader) — **F**
- ☐ TTS/STT provider spike + decision — **B**

### Week 2 — the agent (exit: full text-chat version of every demo scene works)
- ☐ `AgentModule` Anthropic tool-use loop over **text first** — **B**
- ☐ Tools: `get_user_context`, `get_policy_summary`, `list_recent_transactions`, `initiate_payment`, `read_last_token`, `request_cosign_status`, `flag_suspicious` — **B**
- ☐ Habits + `get_user_context` (learned baselines) — **A/B**
- ☐ Audit summarization path ("what went out this month") — **A**
- ☐ `CosignModule` end to end with WS + held-intent state machine — **B**
- ☐ Demo console v1 (live intent/decision/reason stream) — **F**
- ☐ `/cosign`, `/dashboard`, `/activity` views wired to WS/REST — **F**

### Week 3 — voice & polish (exit: live feature-phone call works twice in a row)
- ☐ Africa's Talking VoiceAdapter (answer/record/play, `GetDigits` for PIN+confirm) — **B**
- ☐ STT→LLM→TTS pipeline with "one moment" filler + pre-generated clips — **B**
- ☐ DTMF PIN auth + lockout + trusted-contact notify — **B**
- ☐ Token read-back (grouped digits, twice, repeat on request) — **B**
- ☐ Local-language pass (English + Pidgin guaranteed; Yoruba if TTS holds up) — **B**
- ☐ WhatsApp adapter **or** faithful mock (identical interface) — **B**
- ☐ Anomaly scoring (statistical; LLM scam-script pass if time) — **A/B**
- ☐ Accessibility audit of web app — **F**
- ☐ `/demo/simulator` scam + prompt-injection scenes — **F**
- ☐ Demo scripting + rehearsal (twice through, on real hardware) — **all**

---

## 7. Painpoints & risks (live register)

| # | Risk | Severity | Mitigation / status |
|---|------|----------|---------------------|
| R1 | **Voice loop is turn-based, not streaming.** AT records→transcribe→LLM→TTS→play ≈ 8–20s/turn. Dead air reads as "broken" to elderly users. | High | Design agent for **few turns**; play "one moment" filler; pre-generate common TTS clips; DTMF short-circuits confirmation turns. |
| R2 | **STT for Yoruba/Pidgin + spoken amounts is inaccurate.** Misheard amounts are dangerous. | High | D1: amounts/PIN/confirm via **DTMF**, not STT. STT only for intent. Deterministic layer restates amount before execute. |
| R3 | **Demo depends on live telephony on stage.** Sandbox/latency/network. | High | Text-chat path is **always kept working** as fallback; Twilio Voice as backup rail; rehearse twice. |
| R4 | **Cosign has nowhere to wait on a phone call.** | Med | D4 async callback + held-intent state machine (§5). |
| R5 | **WhatsApp Business API approval won't land in 3 weeks.** | Med | Ship mock transport with identical adapter interface; state honestly. |
| R6 | **Frontend overload.** D2 (owner web) + D3 (human delegate) both add UI to a single frontend dev already owning 6 web surfaces. | Med | Prioritize demo-critical views (demo console, cosign, activity). Owner-web + delegate-web are **cut candidates** if Week 2 slips. Revisit end of Week 2. |
| R7 | **Monthly-cap race / period boundary.** Two intents against a near-full cap; undefined "month." | Low | Define period boundary explicitly; sum `EXECUTED` transactions. Accept race for prototype; document it. |
| R8 | **Float money bugs.** | Med | Integer kobo everywhere; enforce in schema + shared type. Lint/review gate. |
| R9 | **Anthropic tool loop runaway / no confirm-before-pay.** | Low | Max tool-iteration guard; system prompt mandates confirmation; policy is external anyway (defense in depth). |
| R10 | **Token/PIN at rest.** | Med | Tokens AES-GCM encrypted; PIN argon2 hashed; no raw audio retention; transcripts purged on session end. |

---

## 8. Decision log (append-only)

- **2026-07-13** — D1–D4 locked (see §2). Owner web login and human-delegate flow kept despite added
  frontend load; flagged as R6 cut-candidates if Week 2 slips.

---

## 9. Reference

- Full spec: [`PRD.md`](PRD.md) — Steward v0.1 (hackathon prototype). Stack: Next.js · NestJS · Postgres · Anthropic API · Africa's Talking.
- Backend lives in [`ecx-backend/`](ecx-backend) (NestJS, pnpm). Frontend not yet scaffolded.
- **Critical invariant (never violate):** the LLM never calls the payment provider. It calls
  `initiate_payment`, which produces a `PaymentIntent` that must pass the pure-TypeScript policy engine.
  That boundary is the product.
