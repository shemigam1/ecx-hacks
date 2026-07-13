# AGENTS.md

Guidance for any AI agent (Claude Code, Cursor, etc.) working in this repository.

## 🔴 STOP — read this first, every session

**Before doing anything else — before answering, planning, searching, or writing a single line of
code — read [`PROJECT.md`](PROJECT.md) in full.** It is the source of truth for project state, locked
decisions, ownership, the interface contract, and open risks. Do not rely on stale context, memory,
or assumptions; re-read it at the start of each session because it changes. The full product spec is
in [`PRD.md`](PRD.md) — read it too when you need the *why* behind a feature, not just the current state.

If you have not read `PROJECT.md` this session, you are not ready to act. Read it now.

## Working rules

1. **Honor locked decisions.** `PROJECT.md` §2 lists decisions that are settled (D1–D4 and any
   added since). Do not reopen or contradict them. If a task appears to require breaking one, stop and
   surface the conflict to the user instead of silently deviating.

2. **Never violate the critical invariant.** The LLM never calls the payment provider directly. It
   calls `initiate_payment`, which produces a `PaymentIntent` that must pass the pure-TypeScript,
   deterministic policy engine. That boundary is the product. No AI logic in policy evaluation, ever.

3. **Money is always integer minor units (kobo).** Never a float. Never a JS number used for storage
   math. Enforce this in every type, schema, and calculation you touch.

4. **Build against the shared contract.** Use the types in `PROJECT.md` §4 (`PaymentIntent`,
   `PolicyDecision`, `PolicyReasonCode`, etc.). Do not invent parallel shapes. If the contract is
   missing something you need, extend it deliberately and update `PROJECT.md`.

5. **Stay in your lane.** Ownership is split (§3): Dev A = deterministic spine, Dev B = agent +
   channels + cosign, F = Next.js frontend. Prefer changes within the relevant domain; touching a
   coupling point (shared types / REST / WS API) is a coordination event — call it out.

## Keep PROJECT.md alive (write-back is mandatory)

`PROJECT.md` is only useful if it stays current. When your work changes project state, **update it in
the same change**:

- Finished a task? Flip its box in the §6 status board (☐ → ◐ → ☑) and bump the "Last updated" line.
- Made or changed a decision? Add a row to the §2 table **and** an entry to the §8 decision log
  (append-only — never rewrite history).
- Hit or resolved a risk? Update the §7 risk register.
- Added a new coordination interface? Reflect it in §4.

Treat a change that alters project state but leaves `PROJECT.md` stale as incomplete work.

## Definition of done for any task

- Code matches the surrounding style and the shared contract.
- Policy-relevant changes have boundary unit tests (cap met / cap+₦1 / revoked / expired / channel scope).
- No float money, no LLM in the policy path, no direct provider calls from the agent layer.
- `PROJECT.md` updated to reflect the new state.
