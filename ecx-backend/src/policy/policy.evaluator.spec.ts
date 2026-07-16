/**
 * Exhaustive boundary tests for the policy evaluator. This is the product's credibility — every rule
 * type and its exact boundary (cap met vs cap+₦1), precedence, revocation, and the demo scenarios.
 */
import { Channel, Credential, PaymentIntent, PolicyEvalContext, PolicyReasonCode, PolicyRule } from '../contracts';
import { evaluate } from './policy.evaluator';

const FIXED_NOW = new Date('2026-07-15T12:00:00Z'); // 13:00 in Africa/Lagos (UTC+1)

function makeIntent(over: Partial<PaymentIntent> = {}): PaymentIntent {
  return {
    id: 'intent_1',
    credentialId: 'cred_1',
    channel: 'VOICE',
    billerId: 'ikeja_electric',
    amount: 500_000, // ₦5,000
    meta: {},
    status: 'PENDING',
    idempotencyKey: 'VOICE:s1:t1',
    ...over,
  };
}

function makeCred(rules: PolicyRule[], over: Partial<Credential> = {}): Credential {
  return {
    id: 'cred_1',
    accountId: 'acct_1',
    delegateType: 'AI_AGENT',
    label: 'test',
    status: 'ACTIVE',
    rules,
    ...over,
  };
}

function makeCtx(over: Partial<PolicyEvalContext> = {}): PolicyEvalContext {
  return { monthlySpentSoFar: 0, now: FIXED_NOW, ...over };
}

const codes = (r: { reasons: { code: PolicyReasonCode }[] }) => r.reasons.map((x) => x.code);

describe('policy evaluator', () => {
  describe('baseline', () => {
    it('ALLOWs when there are no rules', () => {
      const d = evaluate(makeIntent(), makeCred([]), makeCtx());
      expect(d.verdict).toBe('ALLOW');
      expect(d.reasons).toHaveLength(0);
    });

    it('stamps evaluatedAt from the injected clock (deterministic)', () => {
      const d = evaluate(makeIntent(), makeCred([]), makeCtx());
      expect(d.evaluatedAt).toBe(FIXED_NOW.toISOString());
    });

    it('does not mutate its inputs', () => {
      const intent = Object.freeze(makeIntent());
      const cred = Object.freeze(makeCred([{ ruleType: 'SPEND_CAP_PER_TX', params: { limit: 100 } }]));
      expect(() => evaluate(intent, cred, makeCtx())).not.toThrow();
    });
  });

  describe('CREDENTIAL_REVOKED', () => {
    it('DENYs a revoked credential regardless of rules', () => {
      const d = evaluate(makeIntent(), makeCred([], { status: 'REVOKED' }), makeCtx());
      expect(d.verdict).toBe('DENY');
      expect(codes(d)).toContain('CREDENTIAL_REVOKED');
    });
  });

  describe('SPEND_CAP_PER_TX (boundary)', () => {
    const rules: PolicyRule[] = [{ ruleType: 'SPEND_CAP_PER_TX', params: { limit: 500_000 } }];
    it('ALLOWs when amount exactly equals the cap', () => {
      expect(evaluate(makeIntent({ amount: 500_000 }), makeCred(rules), makeCtx()).verdict).toBe('ALLOW');
    });
    it('DENYs when amount exceeds the cap by ₦1 (100 kobo)', () => {
      const d = evaluate(makeIntent({ amount: 500_100 }), makeCred(rules), makeCtx());
      expect(d.verdict).toBe('DENY');
      expect(codes(d)).toContain('PER_TX_CAP_EXCEEDED');
    });
  });

  describe('SPEND_CAP_MONTHLY (boundary, uses ctx.monthlySpentSoFar)', () => {
    const rules: PolicyRule[] = [{ ruleType: 'SPEND_CAP_MONTHLY', params: { limit: 500_000 } }];
    it('ALLOWs when running total exactly hits the cap', () => {
      const d = evaluate(makeIntent({ amount: 100_000 }), makeCred(rules), makeCtx({ monthlySpentSoFar: 400_000 }));
      expect(d.verdict).toBe('ALLOW');
    });
    it('DENYs when running total exceeds the cap by ₦1', () => {
      const d = evaluate(makeIntent({ amount: 100_100 }), makeCred(rules), makeCtx({ monthlySpentSoFar: 400_000 }));
      expect(d.verdict).toBe('DENY');
      expect(codes(d)).toContain('MONTHLY_CAP_EXCEEDED');
    });
  });

  describe('BILLER_ALLOWLIST', () => {
    const rules: PolicyRule[] = [{ ruleType: 'BILLER_ALLOWLIST', params: { billerIds: ['ikeja_electric', 'dstv'] } }];
    it('ALLOWs an allowlisted biller', () => {
      expect(evaluate(makeIntent({ billerId: 'dstv' }), makeCred(rules), makeCtx()).verdict).toBe('ALLOW');
    });
    it('DENYs a biller not on the allowlist (F2 scam bounce)', () => {
      const d = evaluate(makeIntent({ billerId: 'random_acct' }), makeCred(rules), makeCtx());
      expect(d.verdict).toBe('DENY');
      expect(codes(d)).toContain('BILLER_NOT_ALLOWLISTED');
    });
    it('does not fire for a transfer with no billerId', () => {
      const d = evaluate(makeIntent({ billerId: undefined, recipient: '0123456789' }), makeCred(rules), makeCtx());
      expect(d.verdict).toBe('ALLOW');
    });
  });

  describe('RECIPIENT_LOCK', () => {
    const rules: PolicyRule[] = [{ ruleType: 'RECIPIENT_LOCK', params: { recipients: ['0011223344'] } }];
    it('ALLOWs a locked recipient', () => {
      const intent = makeIntent({ billerId: undefined, recipient: '0011223344' });
      expect(evaluate(intent, makeCred(rules), makeCtx()).verdict).toBe('ALLOW');
    });
    it('DENYs a recipient not in the lock set (redirect attempt)', () => {
      const intent = makeIntent({ billerId: undefined, recipient: '9999999999' });
      const d = evaluate(intent, makeCred(rules), makeCtx());
      expect(d.verdict).toBe('DENY');
      expect(codes(d)).toContain('RECIPIENT_LOCK_MISMATCH');
    });
  });

  describe('CHANNEL_SCOPE', () => {
    const rules: PolicyRule[] = [{ ruleType: 'CHANNEL_SCOPE', params: { channels: ['WEB'] } }];
    it('ALLOWs a request on an in-scope channel', () => {
      expect(evaluate(makeIntent({ channel: 'WEB' }), makeCred(rules), makeCtx()).verdict).toBe('ALLOW');
    });
    it('DENYs a request on an out-of-scope channel (VOICE narrowest)', () => {
      const d = evaluate(makeIntent({ channel: 'VOICE' as Channel }), makeCred(rules), makeCtx());
      expect(d.verdict).toBe('DENY');
      expect(codes(d)).toContain('CHANNEL_SCOPE_EXCEEDED');
    });
  });

  describe('TIME_WINDOW (timezone-aware, [start,end))', () => {
    it('ALLOWs inside a daytime window (13:00 Lagos in [8,18))', () => {
      const rules: PolicyRule[] = [{ ruleType: 'TIME_WINDOW', params: { startHour: 8, endHour: 18, tz: 'Africa/Lagos' } }];
      expect(evaluate(makeIntent(), makeCred(rules), makeCtx()).verdict).toBe('ALLOW');
    });
    it('DENYs outside the window (13:00 Lagos not in [0,6))', () => {
      const rules: PolicyRule[] = [{ ruleType: 'TIME_WINDOW', params: { startHour: 0, endHour: 6, tz: 'Africa/Lagos' } }];
      const d = evaluate(makeIntent(), makeCred(rules), makeCtx());
      expect(d.verdict).toBe('DENY');
      expect(codes(d)).toContain('OUTSIDE_TIME_WINDOW');
    });
    it('handles overnight windows: 00:30 Lagos is inside [22,6)', () => {
      const rules: PolicyRule[] = [{ ruleType: 'TIME_WINDOW', params: { startHour: 22, endHour: 6, tz: 'Africa/Lagos' } }];
      const ctx = makeCtx({ now: new Date('2026-07-15T23:30:00Z') }); // 00:30 next day in Lagos
      expect(evaluate(makeIntent(), makeCred(rules), ctx).verdict).toBe('ALLOW');
    });
    it('DENYs overnight window when outside: 13:00 Lagos not in [22,6)', () => {
      const rules: PolicyRule[] = [{ ruleType: 'TIME_WINDOW', params: { startHour: 22, endHour: 6, tz: 'Africa/Lagos' } }];
      expect(evaluate(makeIntent(), makeCred(rules), makeCtx()).verdict).toBe('DENY');
    });
  });

  describe('COSIGN_THRESHOLD (escalation, boundary)', () => {
    const rules: PolicyRule[] = [{ ruleType: 'COSIGN_THRESHOLD', params: { threshold: 1_000_000 } }];
    it('ALLOWs when amount exactly equals the threshold', () => {
      expect(evaluate(makeIntent({ amount: 1_000_000 }), makeCred(rules), makeCtx()).verdict).toBe('ALLOW');
    });
    it('ESCALATEs when amount is above the threshold by ₦1', () => {
      const d = evaluate(makeIntent({ amount: 1_000_100 }), makeCred(rules), makeCtx());
      expect(d.verdict).toBe('ESCALATE');
      expect(codes(d)).toContain('AMOUNT_ABOVE_COSIGN_THRESHOLD');
    });
  });

  describe('precedence: DENY > ESCALATE > ALLOW', () => {
    it('DENYs when a rule denies even though another would escalate', () => {
      const rules: PolicyRule[] = [
        { ruleType: 'SPEND_CAP_PER_TX', params: { limit: 1_000_000 } }, // 2m > 1m => DENY
        { ruleType: 'COSIGN_THRESHOLD', params: { threshold: 500_000 } }, // 2m > 500k => ESCALATE
      ];
      const d = evaluate(makeIntent({ amount: 2_000_000 }), makeCred(rules), makeCtx());
      expect(d.verdict).toBe('DENY');
      expect(codes(d)).toEqual(expect.arrayContaining(['PER_TX_CAP_EXCEEDED', 'AMOUNT_ABOVE_COSIGN_THRESHOLD']));
    });

    it('ESCALATEs when only escalation applies among several passing rules', () => {
      const rules: PolicyRule[] = [
        { ruleType: 'SPEND_CAP_PER_TX', params: { limit: 5_000_000 } },
        { ruleType: 'BILLER_ALLOWLIST', params: { billerIds: ['ikeja_electric'] } },
        { ruleType: 'COSIGN_THRESHOLD', params: { threshold: 1_000_000 } },
      ];
      const d = evaluate(makeIntent({ amount: 1_500_000 }), makeCred(rules), makeCtx());
      expect(d.verdict).toBe('ESCALATE');
    });
  });

  describe('F1 happy path (electricity, within mandate)', () => {
    it('ALLOWs ₦5,000 Ikeja Electric under a realistic policy', () => {
      const rules: PolicyRule[] = [
        { ruleType: 'BILLER_ALLOWLIST', params: { billerIds: ['ikeja_electric', 'dstv', 'mtn_airtime'] } },
        { ruleType: 'SPEND_CAP_PER_TX', params: { limit: 2_000_000 } },
        { ruleType: 'SPEND_CAP_MONTHLY', params: { limit: 5_000_000 } },
        { ruleType: 'COSIGN_THRESHOLD', params: { threshold: 1_000_000 } },
      ];
      const d = evaluate(makeIntent({ amount: 500_000 }), makeCred(rules), makeCtx({ monthlySpentSoFar: 1_000_000 }));
      expect(d.verdict).toBe('ALLOW');
      expect(d.reasons).toHaveLength(0);
    });
  });
});
