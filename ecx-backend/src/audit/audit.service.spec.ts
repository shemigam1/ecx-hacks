import { Test, TestingModule } from '@nestjs/testing';
import { AuditService } from './audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { IntentEvents } from '../contracts';

describe('AuditService', () => {
  let service: AuditService;
  let prisma: PrismaService;
  let eventEmitter: EventEmitter2;

  const mockPrismaService = {
    auditEvent: {
      create: jest.fn().mockImplementation(({ data }) => {
        return Promise.resolve({
          id: 'mock-uuid-123',
          createdAt: new Date(),
          ...data,
        });
      }),
    },
  };

  const mockEventEmitter = {
    emit: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<AuditService>(AuditService);
    prisma = module.get<PrismaService>(PrismaService);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);

    jest.clearAllMocks();
  });

  it('should log audit event and emit audit.appended event', async () => {
    const accountId = 'acct_123';
    const actor = 'actor_123';
    const eventType = 'test.event';
    const payload = { key: 'value' };

    const result = await service.log(accountId, actor, eventType, payload);

    expect(prisma.auditEvent.create).toHaveBeenCalledWith({
      data: { accountId, actor, eventType, payload },
    });

    expect(eventEmitter.emit).toHaveBeenCalledWith(IntentEvents.AuditAppended, {
      accountId,
      eventType,
      payload,
    });

    expect(result.id).toBe('mock-uuid-123');
    expect(result.accountId).toBe(accountId);
    expect(result.actor).toBe(actor);
    expect(result.eventType).toBe(eventType);
    expect(result.payload).toEqual(payload);
  });

  it('has no delete or update methods (strictly append-only)', () => {
    const methods = Object.getOwnPropertyNames(AuditService.prototype);
    expect(methods.includes('delete')).toBe(false);
    expect(methods.includes('update')).toBe(false);
    expect(methods.includes('remove')).toBe(false);
  });
});
