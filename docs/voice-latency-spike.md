# Voice-Latency Spike Plan (run in Week 1)

> **Why now:** the Week-3 voice pipeline is the project's critical tail (PROJECT.md R1/R2/R3). The one
> way to de-risk it is to measure the real per-turn round-trip **early**, with throwaway code, instead
> of discovering an unusable latency on stage. Owner: **Dev B**. Timebox: **~1 day**.

## Goal
Answer one question with a number: **how many seconds elapse between the caller finishing speaking and
hearing the agent's reply**, on the real Africa's Talking record→play loop — and whether it's tolerable
for an elderly user (target: keep dead air < ~3s, or mask it with a filler clip).

## What to build (throwaway — do NOT wire into the app)
A single AT voice webhook that:
1. Answers, plays a greeting, `Record`s one utterance.
2. Downloads the recording, runs STT (Whisper-compatible).
3. Sends the transcript to the agent model (**Qwen3 via OpenRouter**, D8) — a trivial 1-turn prompt, no tools.
4. Synthesizes the reply with the candidate TTS provider (Spitch / YarnGPT / fallback).
5. Hosts the audio and `Play`s it back.

Log a timestamp at each stage boundary.

## Measure (record a table)
| Stage | Metric |
|-------|--------|
| Record → recording available | AT callback latency |
| STT | transcription time (English, Pidgin, Yoruba separately) |
| LLM | first-token + full-response time (Qwen3/OpenRouter; try a Groq-hosted model for comparison) |
| TTS | synthesis time |
| Host + Play | upload + AT play latency |
| **Total** | **caller-perceived turn time** |

## Decisions this spike unblocks
- **TTS provider** (still-open Week-1 decision): pick on latency **and** Nigerian-accent quality.
- **Turn budget for the agent:** if a turn is ~10s+, engineer for minimum turns, a "one moment" filler,
  and pre-generated clips for fixed prompts (greeting, PIN request, confirmation).
- **Model host:** OpenRouter vs a low-latency host (Groq) for the brain — latency here feeds R1 directly.
- **Go/no-go on live Yoruba STT** vs English + Pidgin for the demo.

## Exit
A one-paragraph findings note appended here with the measured total, the TTS pick, and a recommended
max-turn count for F1 (electricity purchase). Feeds AgentModule design.
