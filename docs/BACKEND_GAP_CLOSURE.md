# Backend Gap-Closure Plan

> Turning "core done + live-verified" into "backend ready," gap by gap. Organized by three readiness
> bars so it's clear what unblocks what. Deep Dev-B task detail lives in [`DEVB_PLAN.md`](DEVB_PLAN.md);
> this doc is the readiness checklist + remediation. _Last updated 2026-07-17._

## Readiness bars
- **Bar 1 — Tier-1 demo-ready** (web console demo works reliably, no telephony).
- **Bar 2 — Tier-2 live-voice-ready** (a real feature-phone call completes F1).
- **Bar 3 — Secured & robust** (auth closed, state persisted).

---

## Gaps → fixes

| # | Gap | Fix | Owner | Bar | Est | Acceptance |
|---|-----|-----|-------|-----|-----|-----------|
| 1 | ✅ **Scene driver** | `src/demo/`: `GET /demo/scenarios`, `POST /demo/scenario {name}` fires F1/F3/F4/channel_scope through the real orchestrator + emits `demo.decision` → WebGateway → console. **Done & curl-verified** (DENY scenes live). ⚠️ F1_allow/F4_escalate need gap #3 (their only extra blocker is `OUTSIDE_TIME_WINDOW`). | **B** | 1 | done | ✓ |
| 2 | **Uncommitted work** (identity/biller resolution, agent, cosign, voice) | Review + commit (I don't commit) | **You** | 1 | — | `git status` clean; CI/build green on the committed tree |
| 3 | **`TIME_WINDOW` blocks evening ALLOW/ESCALATE** (6am–10pm WAT) — **now confirmed blocking 2 of 4 scene-driver scenes** | Widen the demo credential's window (e.g. `startHour:0,endHour:24`) in the seed, or demo in-hours | **A** (seed) | 1 | 15m | `F1_allow`→ALLOW and `F4_escalate`→ESCALATE at demo time |
| 4 | **Agent invents a meter number** | Seed a meter on the account/habits; `get_user_context` returns it; agent uses it | **A** (seed/ctx) | 1 | ½d | F1 uses the real seeded meter, not a hallucinated one |
| 5 | **`start:prod` broken** — `nest build` emits `dist/src/main.js` (prisma/seed.ts pulls rootDir up) | Exclude `prisma` in `tsconfig.build.json` or set `rootDir: ./src` | **A** | 1 | 15m | `node dist/main.js` boots |
| 6 | ✅ **Endpoints unauthenticated** | **Done** — global `ApiKeyGuard` (APP_GUARD) requires `x-api-key` (web) or `?k=` (voice webhooks); `@Public()` on health; also covers Dev A's `/payments` test controller. Verified: `/agent`,`/demo`,`/cosign`,`/voice` → 401 without key, work with it. `INTERNAL_API_KEY` env. **Interim** (shared secret, not per-user) — superseded by #7. WS auth now added in #7. | **B** | 1 | done | ✓ |
| 7 | ✅ **AuthModule** | **Done** — `AuthService`: **argon2 DTMF PIN** + 3-strike lockout + `auth.pin_lockout` notify (wired into `VoiceController`); phone-**OTP → JWT** login (`POST /auth/otp/request|verify`); `JwtAuthGuard` + `@CurrentPrincipal` (`GET /auth/me`); **WS handshake auth** on the gateway. Live-verified. Follow-ups: real SMS delivery, delegate-scoped JWTs, apply JWT to `/cosign/resolve` (use principal as `byUserId`). | **B** | 3 | done | ✓ |
| 8 | ✅ **Whisper STT** | **Done** — `WhisperSttProvider` (OpenAI-compatible: OpenAI/Groq/self-hosted faster-whisper) behind `STT_PROVIDER`; VoiceModule factory uses it when `STT_API_KEY` set, else `FakeSttProvider`; `intent` handler re-prompts on STT failure (never 500s). Mocked-HTTP tests. **To go live: set `STT_API_KEY` (+ `STT_BASE_URL` for Groq).** | **B** | 2 | done | ✓ |
| 9 | **Live voice not wired** — no `PUBLIC_BASE_URL`/AT config | ngrok/public URL + AT sandbox callback config; latency mask (pre-gen `<Play>` clips for fixed prompts) | **B** + **You** (creds) | 2 | 1d | One clean live F1 call end-to-end |
| 10 | ✅ **Session persistence** | **Done** — `SessionStore` (`conversation_sessions`, 30-min TTL) replaces the in-memory Maps in AgentService + VoiceController (voice keys namespaced `voice:` to avoid colliding with agent history). Save is best-effort (never 500s a call). **Live-verified**: agent remembered across turns; a real `conversation_sessions` row persisted. | **B** | 3 | done | ✓ |
| 11 | ✅ **Per-account WS rooms** | **Done** — clients `subscribe {accountId, demo?}`; payment events (Escalated/Executed, which carry accountId) emit to `account:{id}` only; the judge console opts into a `demo` firehose room. No cross-account leak. Unit-tested (5 gateway tests). | **B** | 3 | done | ✓ |
| 12 | **Payments still mock** (no real rail) | VTpass/Flutterwave **sandbox** behind `PaymentProvider` (D8); start KYC if going live-money | **A** | 2/opt | 1–2d | Sandbox vend returns a real token via the same interface |
| 13 | **English-only TTS** (AT `<Say>`) | Pidgin via `<Say>` text now; `TtsProvider` + `<Play>` (YarnGPT/Spitch) for Yoruba | **B** | opt | 1d | Pidgin prompt spoken; Yoruba via Play if TTS holds |
| 14 | **No WhatsApp channel** | WhatsApp adapter or faithful mock → same `ConversationEvent` → `AgentService` | **B** | opt | 1d | A WhatsApp (or mock) message drives the agent |

---

## Sequence (recommended)

**To hit Bar 1 (Tier-1 demo-ready) — do first:**
1. #1 scene driver (B) → unblocks Dev F's console.
2. #6 light auth guard on state-changing routes (B) — cheap, closes the worst of the open-endpoint risk.
3. #2 commit (you); #3 time window + #5 build fix + #4 meter (A — small).

**To hit Bar 2 (live voice):**
4. #8 Whisper STT (B) → #9 live wiring + latency mask (B + your ngrok/AT creds) → rehearse one F1 call.

**To hit Bar 3 (secured & robust):**
5. #7 AuthModule (B) → replaces demo PIN, supersedes the #6 interim guard.
6. #10 session persistence, #11 WS rooms (B).

**Optional / stretch:** #12 real provider (A, if going live-money), #13 local-language TTS, #14 WhatsApp.

## What I (Dev B) will build vs. what I need from others
- **Mine:** #1, #6, #7, #8, #9(code), #10, #11, #13, #14.
- **Yours:** #2 commit; ngrok/public URL + Africa's Talking sandbox creds for #9. (OpenRouter key ✅ done.)
- **Dev A:** #3 (widen demo window), #4 (seed meter), #5 (build fix), #12 (real provider) — I'll flag these; I won't touch spine/seed code.

## Definition of "backend ready"
- **Bar 1:** ✅ #1–#5 (+ #6). Tier-1 demo runs end to end from the web.
- **Bar 2:** ✅ + #8, #9. A live F1 call completes and reads the token back.
- **Bar 3:** ✅ + #7, #10, #11. Endpoints authenticated, sessions durable.
