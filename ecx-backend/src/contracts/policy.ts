/**
 * The policy contract. The PolicyEngine (Dev A, PolicyModule) is the deterministic core:
 * pure, synchronous, zero AI, zero I/O beyond the context it is handed. THIS BOUNDARY IS THE PRODUCT.
 */
import { Channel, Kobo } from './primitives';

export type Verdict = 'ALLOW' | 'ESCALATE' | 'DENY';

/** Machine-readable reason codes the agent turns into plain speech. */
export type PolicyReasonCode =
  | 'RECIPIENT_NOT_ALLOWLISTED'
  | 'BILLER_NOT_ALLOWLISTED'
  | 'MONTHLY_CAP_EXCEEDED'
  | 'PER_TX_CAP_EXCEEDED'
  | 'AMOUNT_ABOVE_COSIGN_THRESHOLD'
  | 'CHANNEL_SCOPE_EXCEEDED'
  | 'OUTSIDE_TIME_WINDOW'
  | 'CREDENTIAL_REVOKED'
  | 'RECIPIENT_LOCK_MISMATCH';

export interface PolicyReason {
  code: PolicyReasonCode;
  detail?: string;
}

export interface PolicyDecision {
  verdict: Verdict;
  /** Verdict precedence when reasons conflict: any DENY reason wins over ESCALATE wins over ALLOW. */
  reasons: PolicyReason[];
  evaluatedAt: string; // ISO 8601
}

/**
 * PolicyRule as a discriminated union — this IS the documented `policy_rules.params` jsonb schema
 * per `rule_type` (W0-A4). Add a rule type here and the whole codebase type-checks against it.
 */
export type PolicyRule =
  | { ruleType: 'SPEND_CAP_MONTHLY'; params: { limit: Kobo } }
  | { ruleType: 'SPEND_CAP_PER_TX'; params: { limit: Kobo } }
  | { ruleType: 'BILLER_ALLOWLIST'; params: { billerIds: string[] } }
  | { ruleType: 'RECIPIENT_LOCK'; params: { recipients: string[] } }
  | { ruleType: 'COSIGN_THRESHOLD'; params: { threshold: Kobo } }
  | { ruleType: 'CHANNEL_SCOPE'; params: { channels: Channel[] } }
  | { ruleType: 'TIME_WINDOW'; params: { startHour: number; endHour: number; tz: string } };

export type RuleType = PolicyRule['ruleType'];

export interface Credential {
  id: string;
  accountId: string;
  delegateType: 'HUMAN' | 'AI_AGENT';
  delegateUserId?: string;
  label: string;
  status: 'ACTIVE' | 'REVOKED';
  /** Per-channel overrides applied on top of base rules; phone channel defaults narrowest. */
  rules: PolicyRule[];
}

/**
 * Everything the pure evaluator needs that it can't compute itself. The caller (PaymentOrchestrator)
 * looks these up and hands them in, keeping `evaluate` free of I/O.
 */
export interface PolicyEvalContext {
  /** Sum of EXECUTED spend for this credential in the current monthly window, in kobo. */
  monthlySpentSoFar: Kobo;
  /** Evaluation clock (injected for deterministic tests and TIME_WINDOW checks). */
  now: Date;
}

/** Implemented by Dev A in PolicyModule. Pure & synchronous. */
export interface PolicyEngine {
  evaluate(
    intent: import('./payment-intent').PaymentIntent,
    credential: Credential,
    ctx: PolicyEvalContext,
  ): PolicyDecision;
}
