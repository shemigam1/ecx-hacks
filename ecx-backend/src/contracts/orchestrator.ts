/**
 * Seam 1 & 2 (BACKEND_WORKPLAN.md §3). Dev A owns the implementations; Dev B codes against
 * these interfaces and uses the fakes in ./fakes until the real ones land.
 */
import { PolicyDecision } from './policy';
import { InitiatePaymentInput, PaymentIntent } from './payment-intent';
import { Channel, Kobo } from './primitives';

/**
 * Seam 1 — the single entrypoint behind the agent's `initiate_payment` tool.
 * The LLM NEVER reaches a provider directly; it only ever gets here.
 */
export interface PaymentOrchestrator {
  /**
   * Create intent → evaluate policy → ALLOW: execute via provider; ESCALATE: persist held intent and
   * emit `intent.escalated`; DENY: record. Idempotent on `input.idempotencyKey`.
   */
  initiatePayment(input: InitiatePaymentInput): Promise<{ intent: PaymentIntent; decision: PolicyDecision }>;

  /** Called by CosignModule after approval: re-checks (revocation!) and executes the held intent. */
  resumeIntent(intentId: string): Promise<{ intent: PaymentIntent }>;

  /** Called on cosign deny / TTL expiry. */
  voidIntent(intentId: string, reason: string): Promise<void>;

  /** Recheck/requery the status of a payment intent that is currently pending execution at the provider. */
  requeryIntent(intentId: string): Promise<{ intent: PaymentIntent }>;
}

// ---- Seam 2: read models for the agent's tools -----------------------------------------------

export interface HabitSummary {
  billerId: string;
  billerLabel: string;
  typicalAmount: Kobo;
  typicalIntervalDays: number;
  lastPaidAt?: string;
}

export interface UserContext {
  userId: string;
  accountId: string;
  name: string;
  languagePref: string;
  habits: HabitSummary[];
}

export interface PolicySummary {
  credentialId: string;
  label: string;
  status: 'ACTIVE' | 'REVOKED';
  /** Plain-language lines the agent can speak, e.g. "Up to ₦5,000 per payment to Ikeja Electric." */
  humanReadable: string[];
}

export interface TxSummary {
  intentId: string;
  billerLabel?: string;
  recipient?: string;
  amount: Kobo;
  status: string;
  executedAt?: string;
}

/** Seam 2 — read side for `get_user_context`, `get_policy_summary`, etc. Dev A owns. */
export interface ContextQuery {
  getUserContext(userId: string): Promise<UserContext>;
  getPolicySummary(credentialId: string): Promise<PolicySummary>;
  listRecentTransactions(accountId: string, opts?: { limit?: number }): Promise<TxSummary[]>;
  /** month as `YYYY-MM`. Returns a plain-speech summary for "what went out this month". */
  summarizeMonth(accountId: string, month: string): Promise<string>;
  /** Re-auth gated (D1 DTMF PIN). Returns the decrypted electricity token. */
  readLastToken(intentId: string, reauthOk: boolean): Promise<string>;
}

export type { Channel };
