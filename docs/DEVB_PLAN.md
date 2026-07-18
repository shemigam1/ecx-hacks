# Dev B — Remaining Build Plan

> Everything left in the Dev B lane (agent · channels · voice · cosign · auth), ordered for the demo.
> Companion to [`PROJECT.md`](../PROJECT.md), [`BACKEND_WORKPLAN.md`](../BACKEND_WORKPLAN.md), and the
> two-tier demo strategy in [`PATH_TO_DEMO.md`](PATH_TO_DEMO.md). P0 = demo-blocking · P1 = live-voice
> stretch · P2 = polish. _Last updated 2026-07-17._

## Already done (context)
AgentModule (Qwen3/OpenRouter behind swappable `LlmProvider`, 7 tools, loop + runaway guard, server-injected
identity) · CosignModule + socket.io `WebGateway` (D6) · Voice adapter first cut (AT webhook state
machine, DTMF PIN, record→STT→agent→DTMF confirm→token read-back, `SttProvider` seam + fake). 101 tests.

## Backlog (ordered)

| # | Task | Pri | Est | Acceptance |
|---|------|-----|-----|-----------|
| 1 | **Deterministic scene driver** | P0 | ½d | `POST /demo/scenario {name}` fires canned F1(ALLOW)/F2(DENY-scam)/F3(DENY-injection)/F4(ESCALATE) intents straight at `PaymentOrchestrator`; correct `intent.*` events emit; curl-verified |
| 2 | ✅ **Live agent smoke + config** | P0 | done | Real Qwen3 (OpenRouter, default `qwen/qwen3-235b-a22b`) drives F1 end-to-end; policy enforced live (DENY OUTSIDE_TIME_WINDOW correctly at ~22:40 WAT). Fixed DB-based identity + biller resolution + plain-text prompt. **To show ALLOW+token: demo within 6am–10pm WAT.** |
| 3 | **Whisper STT adapter** | P1 | 1d | `WhisperSttProvider` behind `STT_PROVIDER` transcribes a recordingUrl; env-configured; falls back to fake if unset; HTTP mocked in tests |
| 4 | **Live voice wiring + latency mask** | P1 | 1d | `PUBLIC_BASE_URL` (ngrok) + AT callback config; one clean F1 call; fixed prompts pre-generated as `<Play>` clips; greeting sets a "one moment" expectation |
| 5 | **AuthModule** | P1 | 1–1.5d | Owner phone+OTP / email-pass JWT; delegate scoped tokens; **real argon2 DTMF PIN** + 3-strike lockout + trusted-contact notify; guard protects agent/cosign/voice endpoints |
| 6 | **Session persistence** | P2 | ½d | Agent + voice sessions move from in-memory Maps to `conversation_sessions` (survive restart / multi-instance) |
| 7 | **WebGateway per-account rooms** | P2 | ½d | Clients `subscribe` to their account; events filtered by room instead of firehose |
| 8 | **Real TTS + local-language** | P2 | 1d | `TtsProvider` seam (YarnGPT/Spitch) via `<Play>`; Pidgin guaranteed (via `<Say>` text), Yoruba if TTS holds |
| 9 | **WhatsApp adapter or mock** | P2 | 1d | Same normalized `ConversationEvent` → `AgentService`; voice-note or text; faithful mock if Business API not approved (R5) |

## Approach notes (the non-obvious ones)

**#1 Scene driver.** New `src/demo/` module, LLM-free. Injects `credentialId/channel/idempotencyKey`
and calls `orchestrator.initiatePayment` with fixed payloads. F3 "injection" can either fire the
malicious intent directly (deterministic) or run the agent with an injected user message — keep a
direct-fire version as the reliable demo path. This is what lets Dev F's console light up on cue
without depending on live-model reliability.

**#3 Whisper STT.** Download `recordingUrl` → POST to a Whisper-compatible endpoint (OpenAI Whisper or
self-hosted `faster-whisper`). Config: `STT_API_URL`, `STT_API_KEY`, `STT_MODEL`. Nigerian English/Pidgin
accuracy is the risk (R2) — mitigated because amounts/PIN/confirm are DTMF, so STT only carries the
free-text intent, and the agent restates the amount before executing.

**#4 Latency mask — be honest about AT's model.** AT is synchronous: our webhook *response* is the next
call action, so we can't play audio *while* STT+LLM run in the same turn. Real mitigations: (a) minimize
turns (already done), (b) pre-generate fixed prompts as hosted `<Play>` clips to shave TTS synthesis,
(c) set expectation in the greeting. Measure first via [`voice-latency-spike.md`](voice-latency-spike.md).

**#5 AuthModule.** `AuthService` (OTP issue/verify, argon2 PIN verify), `@nestjs/jwt`, a `JwtAuthGuard`
(keep the header dev-stub for local). Wire `VoiceController` PIN → `AuthService.verifyPin` (replaces the
demo PIN); emit a `pin.lockout` event → trusted-contact notify. Also close the currently-open
agent/cosign/voice endpoints.

## Suggested sequence
1. **#1 scene driver** → unblocks Dev F's console (highest leverage; do first).
2. **#2 live agent smoke** → proves the real brain (needs your OpenRouter key).
3. **#3 Whisper STT** → **#4 live voice wiring** → rehearse one live F1 (Tier-2 stretch).
4. **#5 AuthModule** → replace demo PIN, secure endpoints.
5. **#6–#9** as time allows (persistence, rooms, TTS/local-lang, WhatsApp).

## Dependencies / needs from others
- **You:** `OPENROUTER_API_KEY` (+ model), an ngrok/public URL + Africa's Talking sandbox creds, and
  (if going live-money) the payment-provider/KYC call (D8).
- **Dev F:** consumes the WS events (#7 rooms optional) and the scene driver (#1) for `/demo/simulator`.

## Cut order if time runs short
#9 WhatsApp → #8 Yoruba (keep Pidgin) → #4 live voice (fall back to Tier-1) → #5 real Auth (keep demo
PIN). Never cut #1 (scene driver) — it guarantees the console demo.
