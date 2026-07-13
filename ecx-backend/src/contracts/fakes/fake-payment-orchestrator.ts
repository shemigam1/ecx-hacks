/**
 * FAKE implementations of the seams so Dev B can build the agent loop in Week 0/1 before Dev A's
 * real spine exists. Deterministic, in-memory, NO persistence, NO provider. Swap for the real
 * implementations in Week 2. This file must never be imported by production wiring.
 *
 * The tiny inline policy here exists only to make the three verdicts observable end-to-end; the real,
 * exhaustively-tested engine lives in PolicyModule (Dev A).
 */
import { randomUUID } from 'node:crypto';
import {
  ContextQuery,
  Credential,
  InitiatePaymentInput,
  PaymentIntent,
  PaymentOrchestrator,
  PolicyDecision,
  PolicyReason,
  PolicySummary,
  TxSummary,
  UserContext,
} from '../index';

const DEMO_CREDENTIAL: Credential = {
  id: 'cred_demo',
  accountId: 'acct_demo',
  delegateType: 'AI_AGENT',
  label: 'Steward Agent (demo)',
  status: 'ACTIVE',
  rules: [
    { ruleType: 'BILLER_ALLOWLIST', params: { billerIds: ['ikeja_electric', 'dstv', 'mtn_airtime'] } },
    { ruleType: 'SPEND_CAP_PER_TX', params: { limit: 2_000_000 } }, // ₦20,000
    { ruleType: 'COSIGN_THRESHOLD', params: { threshold: 1_000_000 } }, // ₦10,000
  ],
};

/** Minimal stand-in for the real PolicyEngine — enough to exercise ALLOW / ESCALATE / DENY. */
function fakeEvaluate(intent: PaymentIntent, cred: Credential): PolicyDecision {
  const reasons: PolicyReason[] = [];
  let verdict: PolicyDecision['verdict'] = 'ALLOW';

  if (cred.status === 'REVOKED') {
    reasons.push({ code: 'CREDENTIAL_REVOKED' });
    verdict = 'DENY';
  }
  for (const rule of cred.rules) {
    if (rule.ruleType === 'BILLER_ALLOWLIST' && intent.billerId && !rule.params.billerIds.includes(intent.billerId)) {
      reasons.push({ code: 'BILLER_NOT_ALLOWLISTED', detail: intent.billerId });
      verdict = 'DENY';
    }
    if (rule.ruleType === 'SPEND_CAP_PER_TX' && intent.amount > rule.params.limit) {
      reasons.push({ code: 'PER_TX_CAP_EXCEEDED' });
      verdict = 'DENY';
    }
    if (rule.ruleType === 'COSIGN_THRESHOLD' && intent.amount > rule.params.threshold && verdict !== 'DENY') {
      reasons.push({ code: 'AMOUNT_ABOVE_COSIGN_THRESHOLD' });
      verdict = 'ESCALATE'; // DENY still wins if set later; handled by precedence below
    }
  }
  // Precedence: DENY > ESCALATE > ALLOW.
  if (reasons.some((r) => isDenyCode(r.code))) verdict = 'DENY';
  return { verdict, reasons, evaluatedAt: new Date().toISOString() };
}

function isDenyCode(code: PolicyReason['code']): boolean {
  return (
    code === 'CREDENTIAL_REVOKED' ||
    code === 'BILLER_NOT_ALLOWLISTED' ||
    code === 'RECIPIENT_NOT_ALLOWLISTED' ||
    code === 'PER_TX_CAP_EXCEEDED' ||
    code === 'MONTHLY_CAP_EXCEEDED' ||
    code === 'CHANNEL_SCOPE_EXCEEDED' ||
    code === 'OUTSIDE_TIME_WINDOW' ||
    code === 'RECIPIENT_LOCK_MISMATCH'
  );
}

export class FakePaymentOrchestrator implements PaymentOrchestrator {
  private readonly intents = new Map<string, PaymentIntent>();
  private readonly byIdempotencyKey = new Map<string, string>();

  constructor(private readonly credential: Credential = DEMO_CREDENTIAL) {}

  async initiatePayment(input: InitiatePaymentInput) {
    const existingId = this.byIdempotencyKey.get(input.idempotencyKey);
    if (existingId) {
      const intent = this.intents.get(existingId)!;
      return { intent, decision: fakeEvaluate(intent, this.credential) };
    }

    const intent: PaymentIntent = {
      id: `intent_${randomUUID()}`,
      credentialId: input.credentialId,
      channel: input.channel,
      billerId: input.billerId,
      recipient: input.recipient,
      amount: input.amount,
      meta: input.meta ?? {},
      status: 'PENDING',
      idempotencyKey: input.idempotencyKey,
    };

    const decision = fakeEvaluate(intent, this.credential);
    intent.status = decision.verdict === 'ALLOW' ? 'EXECUTED' : decision.verdict === 'ESCALATE' ? 'ESCALATED' : 'DENIED';

    this.intents.set(intent.id, intent);
    this.byIdempotencyKey.set(intent.idempotencyKey, intent.id);
    return { intent, decision };
  }

  async resumeIntent(intentId: string) {
    const intent = this.mustGet(intentId);
    intent.status = 'EXECUTED';
    return { intent };
  }

  async voidIntent(intentId: string, _reason: string) {
    this.mustGet(intentId).status = 'VOIDED';
  }

  private mustGet(intentId: string): PaymentIntent {
    const intent = this.intents.get(intentId);
    if (!intent) throw new Error(`FakePaymentOrchestrator: unknown intent ${intentId}`);
    return intent;
  }
}

export class FakeContextQuery implements ContextQuery {
  async getUserContext(userId: string): Promise<UserContext> {
    return {
      userId,
      accountId: 'acct_demo',
      name: 'Mama Nkechi',
      languagePref: 'pcm', // Nigerian Pidgin
      habits: [
        { billerId: 'ikeja_electric', billerLabel: 'Ikeja Electric', typicalAmount: 500_000, typicalIntervalDays: 9 },
      ],
    };
  }

  async getPolicySummary(credentialId: string): Promise<PolicySummary> {
    return {
      credentialId,
      label: 'Steward Agent (demo)',
      status: 'ACTIVE',
      humanReadable: [
        'Up to ₦20,000 per payment.',
        'Payments over ₦10,000 need your daughter to approve.',
        'Only Ikeja Electric, DSTV and MTN airtime are allowed.',
      ],
    };
  }

  async listRecentTransactions(): Promise<TxSummary[]> {
    return [
      { intentId: 'intent_demo1', billerLabel: 'Ikeja Electric', amount: 500_000, status: 'EXECUTED', executedAt: '2026-07-04T09:12:00Z' },
    ];
  }

  async summarizeMonth(): Promise<string> {
    return 'This month, one payment went out: five thousand naira for Ikeja Electric light.';
  }

  async readLastToken(_intentId: string, reauthOk: boolean): Promise<string> {
    if (!reauthOk) throw new Error('Re-auth required to read token');
    return '1234 5678 9012 3456 7890';
  }
}
