import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CosignEvents } from '../contracts';
import { CosignService } from './cosign.service';

function make(reqRow: any) {
  const prisma = {
    cosignRequest: {
      findUnique: jest.fn().mockResolvedValue(reqRow),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  const events = { emit: jest.fn() };
  return { svc: new CosignService(prisma as any, events as any), prisma, events };
}

describe('CosignService', () => {
  it('resolve() emits cosign.resolved for a pending request', async () => {
    const { svc, events } = make({ intentId: 'i1', status: 'PENDING' });
    const out = await svc.resolve('i1', true, 'user_ada');
    expect(events.emit).toHaveBeenCalledWith(CosignEvents.Resolved, { intentId: 'i1', approve: true, byUserId: 'user_ada' });
    expect(out.status).toBe('PROCESSING');
  });

  it('resolve() 404s when there is no cosign request', async () => {
    const { svc } = make(null);
    await expect(svc.resolve('nope', true, 'u')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('resolve() rejects an already-resolved request (no double-spend on approve)', async () => {
    const { svc, events } = make({ intentId: 'i1', status: 'APPROVED' });
    await expect(svc.resolve('i1', true, 'u')).rejects.toBeInstanceOf(BadRequestException);
    expect(events.emit).not.toHaveBeenCalled();
  });
});
