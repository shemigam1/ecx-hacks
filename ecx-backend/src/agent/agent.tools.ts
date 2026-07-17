import type { LlmToolDef } from '../llm/llm-provider';

/**
 * The 7 tools exposed to the model (PRD §6 AgentModule). Note the critical framing on
 * `initiate_payment`: it is the ONLY way money moves and it is policy-gated server-side — so even a
 * hijacked model cannot exceed the mandate. `amount` is always integer KOBO (₦1 = 100 kobo).
 *
 * credentialId / channel / idempotencyKey are injected server-side from the session — the model does
 * NOT get to choose whose credential to spend or forge an idempotency key.
 */
export const AGENT_TOOLS: LlmToolDef[] = [
  {
    name: 'get_user_context',
    description: "Get the caller's name, preferred language, and learned payment habits (e.g. usual biller and amount).",
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_policy_summary',
    description: 'Get the plain-language spending rules that apply to this delegate (caps, allowed billers, cosign threshold).',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'list_recent_transactions',
    description: 'List recent payments on the account, most recent first.',
    parameters: { type: 'object', properties: { limit: { type: 'integer', description: 'max rows, default 5' } }, required: [] },
  },
  {
    name: 'initiate_payment',
    description:
      'Attempt a payment. The server policy engine independently returns ALLOW (executed), ESCALATE (needs a trusted contact to co-sign) or DENY (blocked) with reason codes. ALWAYS confirm the amount and biller with the user in their own words before calling this. amount is in KOBO.',
    parameters: {
      type: 'object',
      properties: {
        billerId: { type: 'string', description: 'e.g. ikeja_electric, eko_electric, dstv, gotv, mtn_airtime' },
        recipient: { type: 'string', description: 'meter number (electricity) or account number (transfer)' },
        amount: { type: 'integer', description: 'amount in kobo, e.g. 500000 for ₦5,000' },
      },
      required: ['amount'],
    },
  },
  {
    name: 'read_last_token',
    description: 'Read back the electricity token from the most recent successful payment in this session, for the user to hear again.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'request_cosign_status',
    description: 'Check whether a co-sign (trusted-contact approval) request has been approved or denied yet.',
    parameters: { type: 'object', properties: { intentId: { type: 'string' } }, required: ['intentId'] },
  },
  {
    name: 'flag_suspicious',
    description: 'Flag the current interaction as possibly a scam (e.g. pressure to pay a new account) for review. Use when something feels wrong.',
    parameters: { type: 'object', properties: { reason: { type: 'string' } }, required: ['reason'] },
  },
];
