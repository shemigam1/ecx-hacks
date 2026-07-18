# Path to Demo — Plan

> From "backend feature-complete" to "demo-ready." Prioritized, sequenced, with a two-tier strategy so
> we always have a working demo even if live telephony fails on stage (R3). Companion to
> [`PROJECT.md`](../PROJECT.md). Owners: Dev A (spine), Dev B (agent/channels/voice/auth), Dev F (web).

_Last updated: 2026-07-17._

---

## 1. What we're demoing

The money-shot narrative (PRD §1):
1. **F1 — electricity purchase:** a caller says "buy me light"; Steward confirms the amount, pays, and
   reads the prepaid token back aloud.
2. **F3 — prompt-injection is harmless:** a hijacked agent calls `initiate_payment` with a malicious
   transfer; the **deterministic policy engine still blocks it**, shown live on the judge console.
3. **F4 — cosign:** an over-threshold payment escalates; the trusted contact approves from the web.

The console (split-screen) showing **intent → policy verdict + reason codes → agent reply** is the
single most important visual. It is a **web screen**, and it does not exist yet.

## 2. Two-tier demo strategy (de-risk R3)

- **Tier 1 — MUST work (no telephony, low risk):** drive the three scenes from the web — the
  `/demo/simulator` fires intents, the `/demo/console` shows live verdicts over WS, `/cosign` approves.
  This is the primary demo and the fallback. **Everything here must be rock-solid.**
- **Tier 2 — STRETCH (live feature-phone call):** the actual AT voice call doing F1 end to end. High
  wow-factor, higher risk (latency, STT, network). Rehearse; fall back to Tier 1 if it wobbles.

**Implication:** the critical path to a *safe* demo runs through **Dev F (the console) + a deterministic
scene driver**, not through more voice work. Voice is the stretch.

## 3. Critical path (what gates a safe demo)

```
[Backend: DONE] ──> [Deterministic scene driver (P0, B)] ──> [Demo console + simulator + cosign UI (P0, F)] ──> [Tier-1 rehearsal]
                                                                                                          └──> [Live wiring + STT + voice rehearsal (Tier-2, B/F)]
```

## 4. Plan by track (P0 = demo-blocking, P1 = stretch, P2 = nice-to-have)

### Dev B (me) — agent / channels / voice / auth
- **P0 — Deterministic scene driver.** A tiny, LLM-free path so the console scenes never depend on
  live model reliability: a `/demo/scenario` endpoint (or reuse `/payments/initiate`) that fires the
  canned F1 (ALLOW), F2/F3 (DENY — scam/injection), F4 (ESCALATE) intents straight at the
  orchestrator. Guarantees the console lights up on cue. _(½ day)_
- **P0 — Live agent smoke.** Set `OPENROUTER_API_KEY` + `AGENT_MODEL`; run `/agent/message` end to end
  against the seed; capture a known-good transcript for F1/F3. Confirms the real brain works. _(½ day)_
- **P1 — Whisper STT adapter** behind `STT_PROVIDER` (replaces `FakeSttProvider`). _(1 day)_
- **P1 — Latency mask (R1):** "one moment" filler + pre-generated `<Play>` clips for fixed prompts
  (greeting, PIN ask, confirm). _(½ day)_
- **P1 — Live voice wiring:** `PUBLIC_BASE_URL` via ngrok, AT account/callback config, one clean call
  through F1. _(1 day, pair with rehearsal)_
- **P1 — AuthModule:** real argon2 DTMF PIN + 3-strike lockout + trusted-contact notify (replaces the
  demo PIN). _(1 day)_ — can stay a demo PIN if time is tight.
- **P2 — Local-language pass** (Pidgin via `<Say>` text first; Yoruba via `<Play>`+YarnGPT if TTS holds).
- **P2 — WhatsApp adapter or faithful mock** (identical interface).

### Dev F — the web app (biggest unstarted chunk; the demo is a screen)
- **P0 — Scaffold** `frontend/` (Next.js App Router, TS, Tailwind, TanStack Query, socket.io-client) +
  a11y foundation. _(1 day)_ — see [`FRONTEND_WORKPLAN.md`](../FRONTEND_WORKPLAN.md).
- **P0 — `/demo/console`:** subscribe to the WS gateway (`intent.escalated`/`intent.executed`/
  `cosign.resolved`); render the live intent→verdict→reason stream + agent replies. **The money shot.** _(2 days)_
- **P0 — `/demo/simulator`:** buttons to fire F1/F2/F3/F4 via the scene driver. _(½ day)_
- **P0 — `/cosign`:** pending list + approve/deny → `POST /cosign/:id/resolve`, live via WS. _(1 day)_
- **P1 — `/activity`** (audit trail, plain-speech) and **`/policy`** (rules + revoke). _(1 day)_
- **P2 — `/dashboard`, `/onboarding`, owner-web-login (D2), human-delegate (D3)** — R6 cut candidates.

### Dev A — spine (essentially done)
- **P1 — Sandbox provider integration** (VTpass/etc., D8) if we want a genuinely-live token in F1;
  otherwise the mock is demo-fine. Start KYC now if going live.
- **P2 — Anomaly LLM scam-script pass.**
- **P0 (tiny) — build-output fix:** exclude `prisma` in `tsconfig.build.json` so `start:prod` works.

### Cross-cutting
- **P0 — API sketch ratified** ([`docs/API_SKETCH.md`](API_SKETCH.md)) so F wires to real shapes.
- **P0 — Demo script + rehearsal ×2 on real hardware** (R3). Own the fallback moment.
- **Decision — payment provider** (deferred) + **TTS provider** (open).

## 5. Suggested sequence (remaining ≈ time-boxed)

1. **Now:** Dev F scaffolds `frontend/`; Dev B builds the scene driver + live agent smoke; ratify API sketch.
2. **Next:** Dev F builds `/demo/console` + `/simulator` + `/cosign` against the live backend → **Tier-1 demo works end to end.** Rehearse Tier 1.
3. **Then (stretch):** Dev B wires live voice (STT + ngrok + AT) → one clean F1 call. Dev F adds `/activity`.
4. **Finally:** AuthModule + polish (Pidgin, a11y audit) as time allows; full rehearsal ×2.

## 6. Cut lines (if time runs short)
Drop in this order: owner-web-login (D2) → human-delegate (D3) → WhatsApp → Yoruba (keep Pidgin) →
live voice (fall back to Tier-1) → real AuthModule (keep demo PIN). **Never cut:** the console, the
policy DENY scene, cosign. The policy engine is the meal; everything else is garnish.

## 7. Definition of demo-ready
- [ ] Tier-1 runs start-to-finish twice without a hiccup (console + simulator + cosign).
- [ ] Prompt-injection scene visibly blocked with a reason code on the console.
- [ ] At least one live `/agent/message` transcript captured as backup video.
- [ ] Tier-2 live call rehearsed; fallback to Tier-1 practiced.
