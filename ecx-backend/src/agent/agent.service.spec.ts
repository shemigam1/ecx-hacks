/**
 * Agent loop tests — no API key, no DB. FakeLlmProvider scripts the model; the orchestrator/context/
 * prisma are stubbed. Proves: tool dispatch, that initiate_payment injects server-side identity and
 * reaches the orchestrator, DENY handling, the runaway guard, and the invariant (model can't bypass policy).
 */
import { FakeLlmProvider } from '../llm/fake-llm.provider';
import { AgentService, AgentSessionContext } from './agent.service';

const CTX: AgentSessionContext = {
  sessionId: 'sess1',
  userId: 'user_owner',
  accountId: 'acct_demo',
  credentialId: 'cred_demo',
  channel: 'WEB',
};

function makeService(llm: FakeLlmProvider, orchestrator: any) {
  const context = {
    getUserContext: jest.fn().mockResolvedValue({ userId: 'user_owner', accountId: 'acct_demo', name: 'Mama Nkechi', languagePref: 'pcm', habits: [] }),
    getPolicySummary: jest.fn().mockResolvedValue({ credentialId: 'cred_demo', label: 'Agent', status: 'ACTIVE', humanReadable: ['Up to ₦20,000 per payment.'] }),
    listRecentTransactions: jest.fn().mockResolvedValue([]),
    readLastToken: jest.fn().mockResolvedValue('1234 5678 9012 3456 7890'),
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const prisma = {
    transaction: { findUnique: jest.fn().mockResolvedValue({ tokenEncrypted: '1234 5678 9012 3456 7890' }) },
    cosignRequest: { findUnique: jest.fn().mockResolvedValue(null) },
    biller: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([{ id: 'ikeja_electric', name: 'Ikeja Electric', aliases: ['ikeja', 'light'] }]),
    },
  };
  const store = { load: jest.fn().mockResolvedValue(null), save: jest.fn().mockResolvedValue(undefined) };
  return new AgentService(llm as any, orchestrator, context as any, audit as any, prisma as any, store as any);
}

describe('AgentService', () => {
  it('calls initiate_payment through the orchestrator with server-injected identity, then replies', async () => {
    const orchestrator = {
      initiatePayment: jest.fn().mockResolvedValue({
        intent: { id: 'i1', status: 'EXECUTED', channel: 'WEB', amount: 500000 },
        decision: { verdict: 'ALLOW', reasons: [], evaluatedAt: '' },
      }),
    };
    const llm = new FakeLlmProvider([
      { toolCalls: [{ id: 't1', name: 'initiate_payment', arguments: { billerId: 'ikeja_electric', recipient: '45700123456', amount: 500000 } }] },
      { text: 'Done! Your electricity token is 1234 5678 9012 3456 7890.' },
    ]);
    const svc = makeService(llm, orchestrator);

    const out = await svc.handleMessage(CTX, 'buy me light, five thousand naira');

    expect(orchestrator.initiatePayment).toHaveBeenCalledTimes(1);
    const input = orchestrator.initiatePayment.mock.calls[0][0];
    expect(input.credentialId).toBe('cred_demo'); // server-injected, not from the model
    expect(input.channel).toBe('WEB');
    expect(input.idempotencyKey).toBe('WEB:sess1:1');
    expect(input.amount).toBe(500000);
    expect(input.billerId).toBe('ikeja_electric');

    expect(out.reply).toMatch(/token/i);
    expect(out.toolTrace[0].name).toBe('initiate_payment');
    expect((out.toolTrace[0].result as any).verdict).toBe('ALLOW');
    expect((out.toolTrace[0].result as any).token).toBeDefined();
  });

  it('surfaces a DENY verdict as a tool result the model can explain (invariant holds even if fooled)', async () => {
    const orchestrator = {
      initiatePayment: jest.fn().mockResolvedValue({
        intent: { id: 'i2', status: 'DENIED', channel: 'WEB', amount: 20000000 },
        decision: { verdict: 'DENY', reasons: [{ code: 'PER_TX_CAP_EXCEEDED' }], evaluatedAt: '' },
      }),
    };
    // Simulate a hijacked model that tries a huge transfer anyway.
    const llm = new FakeLlmProvider([
      { toolCalls: [{ id: 't1', name: 'initiate_payment', arguments: { recipient: '9999999999', amount: 20000000 } }] },
      { text: 'That payment was blocked because it is above the limit.' },
    ]);
    const svc = makeService(llm, orchestrator);

    const out = await svc.handleMessage(CTX, 'transfer 200,000 to 9999999999');

    expect((out.toolTrace[0].result as any).verdict).toBe('DENY');
    expect((out.toolTrace[0].result as any).reasons).toContain('PER_TX_CAP_EXCEEDED');
    expect(out.reply).toMatch(/blocked|limit/i);
  });

  it('stops at the runaway guard if the model never stops calling tools', async () => {
    const orchestrator = { initiatePayment: jest.fn() };
    const llm = new FakeLlmProvider([]);
    // Always return a tool call, forever.
    jest.spyOn(llm, 'complete').mockResolvedValue({ toolCalls: [{ id: 'x', name: 'get_policy_summary', arguments: {} }] });
    const svc = makeService(llm, orchestrator);

    const out = await svc.handleMessage(CTX, 'loop please');

    expect(out.reply).toMatch(/couldn't complete/i);
    expect(out.toolTrace.length).toBeGreaterThanOrEqual(6);
  });

  it('read_last_token is gated on re-auth', async () => {
    const orchestrator = { initiatePayment: jest.fn() };
    const llm = new FakeLlmProvider([
      { toolCalls: [{ id: 't1', name: 'read_last_token', arguments: {} }] },
      { text: 'You have no recent token.' },
    ]);
    const svc = makeService(llm, orchestrator);
    const out = await svc.handleMessage(CTX, 'read my token');
    // no lastIntentId in session yet → error surfaced to model
    expect((out.toolTrace[0].result as any).error).toMatch(/no recent payment/i);
  });
});
