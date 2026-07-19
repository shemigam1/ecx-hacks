import type { LlmToolDef } from '../llm/llm-provider';

/**
 * The 7 tools exposed to the model (PRD §6 AgentModule). Note the critical framing on
 * `initiate_payment`: it is the ONLY way money moves and it is policy-gated server-side — so even a
 * hijacked model cannot exceed the mandate. `amount` is always integer KOBO (₦1 = 100 kobo).
 *
 * credentialId / channel / idempotencyKey are injected server-side from the session — the model does
 * NOT get to choose whose credential to spend or forge an idempotency key.
 */
// Descriptions kept terse — they're sent on every round (token cost). The caller's context and rules
// are already in the system prompt, so get_user_context / get_policy_summary are rarely needed.
export const AGENT_TOOLS: LlmToolDef[] = [
  {
    name: 'get_user_context',
    description: "Caller's name, language, usual payments (only if not already given).",
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_policy_summary',
    description: 'Spending rules for this delegate (only if not already given).',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'list_recent_transactions',
    description: 'Recent payments, newest first.',
    parameters: { type: 'object', properties: { limit: { type: 'integer' } }, required: [] },
  },
  {
    name: 'initiate_payment',
    description:
      'Attempt a payment (the ONLY way money moves). The server returns ALLOW/ESCALATE/DENY. Confirm amount + biller with the user first. amount is in KOBO (₦5,000 = 500000).',
    parameters: {
      type: 'object',
      properties: {
        billerId: { type: 'string', description: 'biller by name, e.g. "Ikeja Electric", "DSTV", "MTN Airtime" ("light"/"nepa" ok)' },
        recipient: { type: 'string', description: 'meter number or account number' },
        amount: { type: 'integer', description: 'kobo' },
      },
      required: ['amount'],
    },
  },
  {
    name: 'read_last_token',
    description: "Read back this session's most recent electricity token.",
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'request_cosign_status',
    description: 'Check if a co-sign request was approved/denied.',
    parameters: { type: 'object', properties: { intentId: { type: 'string' } }, required: ['intentId'] },
  },
  {
    name: 'flag_suspicious',
    description: 'Flag a possible scam (pressure to pay a new account).',
    parameters: { type: 'object', properties: { reason: { type: 'string' } }, required: ['reason'] },
  },
];
