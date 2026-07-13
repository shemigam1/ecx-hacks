/**
 * Smoke test proving the Seam 1 shape produces all three verdicts. This is the Week-0 exit gate:
 * once green, Dev B can build the agent loop against the fake with confidence in the contract.
 */
import { InitiatePaymentInput } from '../index';
import { FakeContextQuery, FakePaymentOrchestrator } from './fake-payment-orchestrator';

const base: Omit<InitiatePaymentInput, 'amount' | 'idempotencyKey'> = {
  credentialId: 'cred_demo',
  channel: 'VOICE',
  billerId: 'ikeja_electric',
};

describe('FakePaymentOrchestrator (Seam 1 smoke test)', () => {
  let orch: FakePaymentOrchestrator;
  beforeEach(() => {
    orch = new FakePaymentOrchestrator();
  });

  it('ALLOWs an in-allowlist payment under the cosign threshold and executes it', async () => {
    const { decision, intent } = await orch.initiatePayment({ ...base, amount: 500_000, idempotencyKey: 'VOICE:s1:t1' });
    expect(decision.verdict).toBe('ALLOW');
    expect(intent.status).toBe('EXECUTED');
  });

  it('ESCALATEs a payment above the cosign threshold', async () => {
    const { decision, intent } = await orch.initiatePayment({ ...base, amount: 1_500_000, idempotencyKey: 'VOICE:s1:t2' });
    expect(decision.verdict).toBe('ESCALATE');
    expect(decision.reasons.map((r) => r.code)).toContain('AMOUNT_ABOVE_COSIGN_THRESHOLD');
    expect(intent.status).toBe('ESCALATED');
  });

  it('DENYs a biller not on the allowlist (F2 scam bounce)', async () => {
    const { decision, intent } = await orch.initiatePayment({
      ...base,
      billerId: 'unknown_biller',
      amount: 500_000,
      idempotencyKey: 'VOICE:s1:t3',
    });
    expect(decision.verdict).toBe('DENY');
    expect(decision.reasons.map((r) => r.code)).toContain('BILLER_NOT_ALLOWLISTED');
    expect(intent.status).toBe('DENIED');
  });

  it('DENYs a payment above the per-tx cap even if it would otherwise escalate', async () => {
    const { decision } = await orch.initiatePayment({ ...base, amount: 5_000_000, idempotencyKey: 'VOICE:s1:t4' });
    expect(decision.verdict).toBe('DENY');
    expect(decision.reasons.map((r) => r.code)).toContain('PER_TX_CAP_EXCEEDED');
  });

  it('is idempotent: the same key does not create a second intent', async () => {
    const a = await orch.initiatePayment({ ...base, amount: 500_000, idempotencyKey: 'VOICE:s1:dup' });
    const b = await orch.initiatePayment({ ...base, amount: 500_000, idempotencyKey: 'VOICE:s1:dup' });
    expect(b.intent.id).toBe(a.intent.id);
  });

  it('resumeIntent executes a held intent; voidIntent voids it', async () => {
    const { intent } = await orch.initiatePayment({ ...base, amount: 1_500_000, idempotencyKey: 'VOICE:s1:t5' });
    const resumed = await orch.resumeIntent(intent.id);
    expect(resumed.intent.status).toBe('EXECUTED');

    const { intent: held } = await orch.initiatePayment({ ...base, amount: 1_500_000, idempotencyKey: 'VOICE:s1:t6' });
    await orch.voidIntent(held.id, 'cosign denied');
    // re-resume would flip it, so assert void took effect via a fresh void call not throwing
    expect(held.status).toBe('VOIDED');
  });
});

describe('FakeContextQuery (Seam 2 smoke test)', () => {
  const ctx = new FakeContextQuery();

  it('returns user habits for get_user_context', async () => {
    const u = await ctx.getUserContext('user_demo');
    expect(u.habits[0].billerId).toBe('ikeja_electric');
  });

  it('gates readLastToken behind re-auth', async () => {
    await expect(ctx.readLastToken('intent_demo1', false)).rejects.toThrow(/Re-auth/);
    await expect(ctx.readLastToken('intent_demo1', true)).resolves.toMatch(/\d{4} \d{4}/);
  });
});
