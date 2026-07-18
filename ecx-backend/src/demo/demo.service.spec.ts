import { BadRequestException } from '@nestjs/common';
import { DemoEvents } from '../contracts';
import { DemoService } from './demo.service';

function make(decision: { verdict: string; reasons: { code: string }[] }, intentStatus: string) {
  const orchestrator = {
    initiatePayment: jest.fn().mockResolvedValue({
      intent: { id: 'i1', status: intentStatus },
      decision: { verdict: decision.verdict, reasons: decision.reasons, evaluatedAt: '' },
    }),
  };
  const prisma = {
    credential: { findFirst: jest.fn().mockResolvedValue({ id: 'cred-uuid', accountId: 'acct-uuid' }) },
    biller: { findFirst: jest.fn().mockResolvedValue({ id: 'biller-uuid', name: 'Ikeja Electric' }) },
  };
  const events = { emit: jest.fn() };
  return { svc: new DemoService(orchestrator as any, prisma as any, events as any), orchestrator, prisma, events };
}

describe('DemoService', () => {
  it('lists the available scenarios', () => {
    const { svc } = make({ verdict: 'ALLOW', reasons: [] }, 'EXECUTED');
    const names = svc.list().map((s) => s.name);
    expect(names).toEqual(expect.arrayContaining(['F1_allow', 'F3_injection', 'F4_escalate']));
  });

  it('F3_injection fires a ₦200,000 transfer at the orchestrator (no biller) and reports the verdict', async () => {
    const { svc, orchestrator, events } = make({ verdict: 'DENY', reasons: [{ code: 'PER_TX_CAP_EXCEEDED' }] }, 'DENIED');
    const out = await svc.run('F3_injection', {});
    const input = orchestrator.initiatePayment.mock.calls[0][0];
    expect(input.amount).toBe(20_000_000);
    expect(input.billerId).toBeUndefined();
    expect(input.recipient).toBe('0123456789');
    expect(input.credentialId).toBe('cred-uuid'); // resolved from DB, not hardcoded
    expect(out.verdict).toBe('DENY');
    expect(out.reasons).toContain('PER_TX_CAP_EXCEEDED');
    expect(events.emit).toHaveBeenCalledWith(DemoEvents.Decision, expect.objectContaining({ scenario: 'F3_injection', verdict: 'DENY' }));
  });

  it('F1_allow resolves the biller name to a real id', async () => {
    const { svc, orchestrator } = make({ verdict: 'ALLOW', reasons: [] }, 'EXECUTED');
    await svc.run('F1_allow', {});
    expect(orchestrator.initiatePayment.mock.calls[0][0].billerId).toBe('biller-uuid');
  });

  it('rejects an unknown scenario', async () => {
    const { svc } = make({ verdict: 'ALLOW', reasons: [] }, 'EXECUTED');
    await expect(svc.run('nope', {})).rejects.toBeInstanceOf(BadRequestException);
  });
});
