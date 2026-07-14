import { PolicyService } from './policy.service';
import { Credential, PaymentIntent, PolicyEvalContext } from '../contracts';

describe('PolicyService', () => {
  let service: PolicyService;

  beforeEach(() => {
    service = new PolicyService();
  });

  const baseCredential: Omit<Credential, 'rules'> = {
    id: 'cred_123',
    accountId: 'acct_456',
    delegateType: 'AI_AGENT',
    label: 'Test Credential',
    status: 'ACTIVE',
  };

  const baseIntent: Omit<PaymentIntent, 'amount'> = {
    id: 'intent_123',
    credentialId: 'cred_123',
    channel: 'WEB',
    meta: {},
    status: 'PENDING',
    idempotencyKey: 'WEB:s1:t1',
  };

  const defaultCtx: PolicyEvalContext = {
    monthlySpentSoFar: 0,
    now: new Date('2026-07-15T12:00:00Z'), // Wednesday noon UTC
  };

  it('ALLOWs a request when no rules are configured', () => {
    const cred: Credential = { ...baseCredential, rules: [] };
    const intent: PaymentIntent = { ...baseIntent, amount: 5000 };
    const decision = service.evaluate(intent, cred, defaultCtx);

    expect(decision.verdict).toBe('ALLOW');
    expect(decision.reasons).toHaveLength(0);
  });

  describe('Credential Revocation', () => {
    it('DENYs when credential status is REVOKED', () => {
      const cred: Credential = { ...baseCredential, status: 'REVOKED', rules: [] };
      const intent: PaymentIntent = { ...baseIntent, amount: 5000 };
      const decision = service.evaluate(intent, cred, defaultCtx);

      expect(decision.verdict).toBe('DENY');
      expect(decision.reasons.map((r) => r.code)).toContain('CREDENTIAL_REVOKED');
    });
  });

  describe('SPEND_CAP_MONTHLY', () => {
    const rules = [{ ruleType: 'SPEND_CAP_MONTHLY' as const, params: { limit: 100000 } }]; // 1,000 Naira in kobo

    it('ALLOWs when exactly at limit', () => {
      const cred: Credential = { ...baseCredential, rules };
      const intent: PaymentIntent = { ...baseIntent, amount: 20000 };
      const ctx: PolicyEvalContext = { ...defaultCtx, monthlySpentSoFar: 80000 };
      const decision = service.evaluate(intent, cred, ctx);

      expect(decision.verdict).toBe('ALLOW');
      expect(decision.reasons).toHaveLength(0);
    });

    it('DENYs when limit is exceeded by 1 kobo', () => {
      const cred: Credential = { ...baseCredential, rules };
      const intent: PaymentIntent = { ...baseIntent, amount: 20001 };
      const ctx: PolicyEvalContext = { ...defaultCtx, monthlySpentSoFar: 80000 };
      const decision = service.evaluate(intent, cred, ctx);

      expect(decision.verdict).toBe('DENY');
      expect(decision.reasons.map((r) => r.code)).toContain('MONTHLY_CAP_EXCEEDED');
    });
  });

  describe('SPEND_CAP_PER_TX', () => {
    const rules = [{ ruleType: 'SPEND_CAP_PER_TX' as const, params: { limit: 50000 } }]; // 500 Naira in kobo

    it('ALLOWs when exactly at transaction limit', () => {
      const cred: Credential = { ...baseCredential, rules };
      const intent: PaymentIntent = { ...baseIntent, amount: 50000 };
      const decision = service.evaluate(intent, cred, defaultCtx);

      expect(decision.verdict).toBe('ALLOW');
      expect(decision.reasons).toHaveLength(0);
    });

    it('DENYs when transaction limit is exceeded by 1 kobo', () => {
      const cred: Credential = { ...baseCredential, rules };
      const intent: PaymentIntent = { ...baseIntent, amount: 50001 };
      const decision = service.evaluate(intent, cred, defaultCtx);

      expect(decision.verdict).toBe('DENY');
      expect(decision.reasons.map((r) => r.code)).toContain('PER_TX_CAP_EXCEEDED');
    });
  });

  describe('BILLER_ALLOWLIST', () => {
    const rules = [{ ruleType: 'BILLER_ALLOWLIST' as const, params: { billerIds: ['biller_a', 'biller_b'] } }];

    it('ALLOWs when biller is on the allowlist', () => {
      const cred: Credential = { ...baseCredential, rules };
      const intent: PaymentIntent = { ...baseIntent, amount: 1000, billerId: 'biller_a' };
      const decision = service.evaluate(intent, cred, defaultCtx);

      expect(decision.verdict).toBe('ALLOW');
      expect(decision.reasons).toHaveLength(0);
    });

    it('DENYs when biller is not on the allowlist', () => {
      const cred: Credential = { ...baseCredential, rules };
      const intent: PaymentIntent = { ...baseIntent, amount: 1000, billerId: 'biller_c' };
      const decision = service.evaluate(intent, cred, defaultCtx);

      expect(decision.verdict).toBe('DENY');
      expect(decision.reasons.map((r) => r.code)).toContain('BILLER_NOT_ALLOWLISTED');
    });

    it('does not evaluate when billerId is missing', () => {
      const cred: Credential = { ...baseCredential, rules };
      const intent: PaymentIntent = { ...baseIntent, amount: 1000 };
      const decision = service.evaluate(intent, cred, defaultCtx);

      expect(decision.verdict).toBe('ALLOW');
      expect(decision.reasons).toHaveLength(0);
    });
  });

  describe('RECIPIENT_LOCK', () => {
    const rules = [{ ruleType: 'RECIPIENT_LOCK' as const, params: { recipients: ['rec_1', 'rec_2'] } }];

    it('ALLOWs when recipient is matched', () => {
      const cred: Credential = { ...baseCredential, rules };
      const intent: PaymentIntent = { ...baseIntent, amount: 1000, recipient: 'rec_1' };
      const decision = service.evaluate(intent, cred, defaultCtx);

      expect(decision.verdict).toBe('ALLOW');
      expect(decision.reasons).toHaveLength(0);
    });

    it('DENYs and returns mismatch reasons when recipient is not matched', () => {
      const cred: Credential = { ...baseCredential, rules };
      const intent: PaymentIntent = { ...baseIntent, amount: 1000, recipient: 'rec_3' };
      const decision = service.evaluate(intent, cred, defaultCtx);

      expect(decision.verdict).toBe('DENY');
      const codes = decision.reasons.map((r) => r.code);
      expect(codes).toContain('RECIPIENT_LOCK_MISMATCH');
      expect(codes).toContain('RECIPIENT_NOT_ALLOWLISTED');
    });

    it('does not evaluate when recipient is missing', () => {
      const cred: Credential = { ...baseCredential, rules };
      const intent: PaymentIntent = { ...baseIntent, amount: 1000 };
      const decision = service.evaluate(intent, cred, defaultCtx);

      expect(decision.verdict).toBe('ALLOW');
      expect(decision.reasons).toHaveLength(0);
    });
  });

  describe('COSIGN_THRESHOLD', () => {
    const rules = [{ ruleType: 'COSIGN_THRESHOLD' as const, params: { threshold: 50000 } }];

    it('ALLOWs when amount is exactly at threshold', () => {
      const cred: Credential = { ...baseCredential, rules };
      const intent: PaymentIntent = { ...baseIntent, amount: 50000 };
      const decision = service.evaluate(intent, cred, defaultCtx);

      expect(decision.verdict).toBe('ALLOW');
      expect(decision.reasons).toHaveLength(0);
    });

    it('ESCALATEs when amount is exceeded by 1 kobo', () => {
      const cred: Credential = { ...baseCredential, rules };
      const intent: PaymentIntent = { ...baseIntent, amount: 50001 };
      const decision = service.evaluate(intent, cred, defaultCtx);

      expect(decision.verdict).toBe('ESCALATE');
      expect(decision.reasons.map((r) => r.code)).toContain('AMOUNT_ABOVE_COSIGN_THRESHOLD');
    });
  });

  describe('CHANNEL_SCOPE', () => {
    const rules = [{ ruleType: 'CHANNEL_SCOPE' as const, params: { channels: ['VOICE', 'WEB'] as const } }];

    it('ALLOWs when channel is allowed', () => {
      const cred: Credential = { ...baseCredential, rules };
      const intent: PaymentIntent = { ...baseIntent, amount: 1000, channel: 'VOICE' };
      const decision = service.evaluate(intent, cred, defaultCtx);

      expect(decision.verdict).toBe('ALLOW');
    });

    it('DENYs when channel is not allowed', () => {
      const cred: Credential = { ...baseCredential, rules };
      const intent: PaymentIntent = { ...baseIntent, amount: 1000, channel: 'WHATSAPP' };
      const decision = service.evaluate(intent, cred, defaultCtx);

      expect(decision.verdict).toBe('DENY');
      expect(decision.reasons.map((r) => r.code)).toContain('CHANNEL_SCOPE_EXCEEDED');
    });
  });

  describe('TIME_WINDOW', () => {
    describe('Non-wraparound window (09:00 - 17:00)', () => {
      const rules = [
        {
          ruleType: 'TIME_WINDOW' as const,
          params: { startHour: 9, endHour: 17, tz: 'Africa/Lagos' },
        },
      ];

      it('ALLOWs when time is exactly at startHour', () => {
        const cred: Credential = { ...baseCredential, rules };
        const intent: PaymentIntent = { ...baseIntent, amount: 1000 };
        // 09:00 Lagos time is 08:00 UTC
        const ctx = { ...defaultCtx, now: new Date('2026-07-15T08:00:00Z') };
        const decision = service.evaluate(intent, cred, ctx);

        expect(decision.verdict).toBe('ALLOW');
      });

      it('ALLOWs when time is mid-window', () => {
        const cred: Credential = { ...baseCredential, rules };
        const intent: PaymentIntent = { ...baseIntent, amount: 1000 };
        // 12:00 Lagos time is 11:00 UTC
        const ctx = { ...defaultCtx, now: new Date('2026-07-15T11:00:00Z') };
        const decision = service.evaluate(intent, cred, ctx);

        expect(decision.verdict).toBe('ALLOW');
      });

      it('DENYs when time is exactly at endHour', () => {
        const cred: Credential = { ...baseCredential, rules };
        const intent: PaymentIntent = { ...baseIntent, amount: 1000 };
        // 17:00 Lagos time is 16:00 UTC
        const ctx = { ...defaultCtx, now: new Date('2026-07-15T16:00:00Z') };
        const decision = service.evaluate(intent, cred, ctx);

        expect(decision.verdict).toBe('DENY');
        expect(decision.reasons.map((r) => r.code)).toContain('OUTSIDE_TIME_WINDOW');
      });

      it('DENYs when time is before startHour', () => {
        const cred: Credential = { ...baseCredential, rules };
        const intent: PaymentIntent = { ...baseIntent, amount: 1000 };
        // 08:59 Lagos time is 07:59 UTC
        const ctx = { ...defaultCtx, now: new Date('2026-07-15T07:59:00Z') };
        const decision = service.evaluate(intent, cred, ctx);

        expect(decision.verdict).toBe('DENY');
        expect(decision.reasons.map((r) => r.code)).toContain('OUTSIDE_TIME_WINDOW');
      });
    });

    describe('Midnight-wraparound window (22:00 - 06:00)', () => {
      const rules = [
        {
          ruleType: 'TIME_WINDOW' as const,
          params: { startHour: 22, endHour: 6, tz: 'Africa/Lagos' },
        },
      ];

      it('ALLOWs when time is 23:00 (before midnight)', () => {
        const cred: Credential = { ...baseCredential, rules };
        const intent: PaymentIntent = { ...baseIntent, amount: 1000 };
        // 23:00 Lagos time is 22:00 UTC
        const ctx = { ...defaultCtx, now: new Date('2026-07-15T22:00:00Z') };
        const decision = service.evaluate(intent, cred, ctx);

        expect(decision.verdict).toBe('ALLOW');
      });

      it('ALLOWs when time is 02:00 (after midnight)', () => {
        const cred: Credential = { ...baseCredential, rules };
        const intent: PaymentIntent = { ...baseIntent, amount: 1000 };
        // 02:00 Lagos time is 01:00 UTC
        const ctx = { ...defaultCtx, now: new Date('2026-07-15T01:00:00Z') };
        const decision = service.evaluate(intent, cred, ctx);

        expect(decision.verdict).toBe('ALLOW');
      });

      it('DENYs when time is 12:00 (midday)', () => {
        const cred: Credential = { ...baseCredential, rules };
        const intent: PaymentIntent = { ...baseIntent, amount: 1000 };
        // 12:00 Lagos time is 11:00 UTC
        const ctx = { ...defaultCtx, now: new Date('2026-07-15T11:00:00Z') };
        const decision = service.evaluate(intent, cred, ctx);

        expect(decision.verdict).toBe('DENY');
        expect(decision.reasons.map((r) => r.code)).toContain('OUTSIDE_TIME_WINDOW');
      });
    });

    describe('Same start and end hour (always active)', () => {
      const rules = [
        {
          ruleType: 'TIME_WINDOW' as const,
          params: { startHour: 9, endHour: 9, tz: 'Africa/Lagos' },
        },
      ];

      it('ALLOWs at any hour', () => {
        const cred: Credential = { ...baseCredential, rules };
        const intent: PaymentIntent = { ...baseIntent, amount: 1000 };
        // Check midday
        const ctx = { ...defaultCtx, now: new Date('2026-07-15T12:00:00Z') };
        const decision = service.evaluate(intent, cred, ctx);
        expect(decision.verdict).toBe('ALLOW');
      });
    });
  });

  describe('Verdict Precedence', () => {
    it('DENYs when both a DENY reason and an ESCALATE reason exist', () => {
      const rules = [
        { ruleType: 'SPEND_CAP_PER_TX' as const, params: { limit: 50000 } }, // DENY above 50,000
        { ruleType: 'COSIGN_THRESHOLD' as const, params: { threshold: 10000 } }, // ESCALATE above 10,000
      ];
      const cred: Credential = { ...baseCredential, rules };
      const intent: PaymentIntent = { ...baseIntent, amount: 60000 }; // Exceeds both limits
      const decision = service.evaluate(intent, cred, defaultCtx);

      expect(decision.verdict).toBe('DENY');
      const codes = decision.reasons.map((r) => r.code);
      expect(codes).toContain('PER_TX_CAP_EXCEEDED');
      expect(codes).toContain('AMOUNT_ABOVE_COSIGN_THRESHOLD');
    });
  });
});
