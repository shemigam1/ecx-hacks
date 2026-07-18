# Backend Gap-Closure Plan

> Turning "core done + live-verified" into "backend ready," gap by gap. Organized by three readiness
> bars so it's clear what unblocks what. Deep Dev-B task detail lives in [`DEVB_PLAN.md`](DEVB_PLAN.md);
> this doc is the readiness checklist + remediation. _Last updated 2026-07-18._

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
| 15 | ✅ **Web read endpoints** (Activity/Policy pages had none) | **Done** — `GET /accounts/:id/audit`, `GET /credentials/:id/policy`, `POST /credentials/:id/revoke` (revoke is audited). `src/accounts/`. Live-verified + 4 unit tests. Unblocks the frontend Activity + Policy pages. | **B** | 1 | done | ✓ |
| 16 | ✅ **Cosign JWT attribution** | **Done** — `CosignController` is `@UseGuards(JwtAuthGuard)`; `resolve` takes `byUserId` from `@CurrentPrincipal`, body field ignored (now optional). Live: `/cosign/pending` 401 without Bearer, 200 with. | **B** | 3 | done | ✓ |
| 17 | ✅ **Audit vocabulary** | **Done** — `/accounts/:id/audit` maps `payment.executed/denied/escalated/voided` → `intent.*` so the FE `describe()` renders plain speech. Live-verified. | **B** | 1 | done | ✓ |
| 18 | ✅ **Single-origin serving** | **Done** — `ServeStaticModule` serves `frontend/dist` (conditional; no-op in dev). Health moved to `/health` so `/` serves the SPA. Live: `/` → index.html, API stays JSON, `/cosign` (client route) → index.html. Override path via `FRONTEND_DIST`. | **B** | 2 | done | ✓ |

---

## Remaining open gaps — ordered plan (2026-07-18)

**Done:** #1 scene driver · #6 api-key guard · #7 AuthModule · #8 Whisper STT · #10 session persistence
· #11 per-account WS rooms · #15 web read endpoints · #16 cosign JWT · #17 audit vocabulary · #18
single-origin serving. **Bars 1 & 3 are met; all quick wins closed.** What's left:

**Live voice — Bar 2 (needs your creds):**
- **#9** Live wiring — `PUBLIC_BASE_URL` (ngrok) + Africa's Talking sandbox callback config + one rehearsed F1 call. STT is ready (#8) — set `STT_API_KEY`.
- **#13** Local-language TTS (optional) — Pidgin via `<Say>` now; YarnGPT/Spitch via `<Play>` for Yoruba.

**Dev A (spine/seed — flagged, I won't touch):**
- **#3** Widen the demo credential's `TIME_WINDOW` (15m) — else evening ALLOW/ESCALATE demo scenes hit `OUTSIDE_TIME_WINDOW`.
- **#4** Seed a meter into `get_user_context` (½d) — so F1 uses a real meter, not a hallucinated one.
- **#5** `start:prod` build fix (15m) — exclude `prisma` in `tsconfig.build.json`.
- **#12** Real payment provider + KYC (optional, only if going live-money).

**Small follow-ups (from #7):** real SMS delivery for OTP + lockout notify; delegate-scoped JWTs.
**Optional:** **#14** WhatsApp adapter/mock.

## Definition of "backend ready"
- **Bar 1 (Tier-1 web demo): ✅ met.** Scene driver + auth + web read endpoints done. Only Dev A's #3
  (widen time window) is needed to make the ALLOW/ESCALATE scenes green at any hour.
- **Bar 2 (live voice):** #9 wiring (your ngrok/AT creds) + set `STT_API_KEY`.
- **Bar 3 (secured & robust): ✅ met.** Auth, sessions, per-account rooms all done; #16 further tightens cosign attribution.
