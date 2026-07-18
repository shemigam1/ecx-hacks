import { NotFoundException } from '@nestjs/common';
import { AccountsController } from './accounts.controller';
import { CredentialsController } from './credentials.controller';

describe('AccountsController', () => {
  it('maps audit rows to the web shape, newest first', async () => {
    const prisma = {
      auditEvent: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'e1', eventType: 'payment.executed', actor: 'AI_AGENT', createdAt: new Date('2026-07-18T10:00:00Z'), payload: { intentId: 'i1' } },
        ]),
      },
    };
    const rows = await new AccountsController(prisma as any).audit('acct1');
    expect(prisma.auditEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { accountId: 'acct1' }, orderBy: { createdAt: 'desc' } }));
    // payment.executed → intent.executed (gap #17 vocabulary alignment)
    expect(rows[0]).toEqual({ id: 'e1', eventType: 'intent.executed', actorType: 'AI_AGENT', createdAt: '2026-07-18T10:00:00.000Z', payload: { intentId: 'i1' } });
  });
});

describe('CredentialsController', () => {
  const cred = { id: 'c1', accountId: 'a1', label: 'Agent', status: 'ACTIVE', policyRules: [{ ruleType: 'SPEND_CAP_PER_TX', params: { limit: 1000000 } }] };

  function make(found = cred) {
    const prisma = {
      credential: {
        findUnique: jest.fn().mockResolvedValue(found),
        update: jest.fn().mockResolvedValue({ ...cred, status: 'REVOKED' }),
      },
    };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    return { ctrl: new CredentialsController(prisma as any, audit as any), prisma, audit };
  }

  it('returns the raw rules for the policy view', async () => {
    const { ctrl } = make();
    const out = await ctrl.policy('c1');
    expect(out).toEqual({ credentialId: 'c1', label: 'Agent', status: 'ACTIVE', rules: [{ ruleType: 'SPEND_CAP_PER_TX', params: { limit: 1000000 } }] });
  });

  it('404s an unknown credential', async () => {
    const { ctrl } = make(null as any);
    await expect(ctrl.policy('nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('revokes and audits', async () => {
    const { ctrl, prisma, audit } = make();
    const out = await ctrl.revoke('c1');
    expect(prisma.credential.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'REVOKED' }) }));
    expect(audit.log).toHaveBeenCalledWith('a1', 'OWNER', 'credential.revoked', expect.objectContaining({ credentialId: 'c1' }));
    expect(out.status).toBe('REVOKED');
  });
});
