import { Test, TestingModule } from '@nestjs/testing';
import { PaymentOrchestratorService } from './payment-orchestrator.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { IntentEvents, CosignEvents } from '../contracts';

describe('PaymentOrchestratorService', () => {
  let service: PaymentOrchestratorService;
  let prisma: PrismaService;
  let auditService: AuditService;
  let eventEmitter: EventEmitter2;
  let policyEngine: any;
  let paymentProvider: any;

  // Mock data helpers
  const mockUser = { id: 'user_trusted_1', role: 'TRUSTED_CONTACT' };
  const mockCredential = {
    id: 'cred_1',
    accountId: 'acct_1',
    delegateType: 'AI_AGENT',
    label: 'Test Credential',
    status: 'ACTIVE',
    policyRules: [],
  };

  const mockPrisma = {
    paymentIntent: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
    },
    policyDecision: {
      create: jest.fn(),
    },
    credential: {
      findUnique: jest.fn(),
    },
    user: {
      findFirst: jest.fn(),
    },
    cosignRequest: {
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    transaction: {
      create: jest.fn(),
    },
    $transaction: jest.fn((cb) => cb(mockPrisma)),
  };

  const mockAudit = {
    log: jest.fn(),
  };

  const mockEventEmitter = {
    emit: jest.fn(),
  };

  const mockPolicyEngine = {
    evaluate: jest.fn(),
  };

  const mockPaymentProvider = {
    execute: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentOrchestratorService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: 'PolicyEngine', useValue: mockPolicyEngine },
        { provide: 'PaymentProvider', useValue: mockPaymentProvider },
      ],
    }).compile();

    service = module.get<PaymentOrchestratorService>(PaymentOrchestratorService);
    prisma = module.get<PrismaService>(PrismaService);
    auditService = module.get<AuditService>(AuditService);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
    policyEngine = mockPolicyEngine;
    paymentProvider = mockPaymentProvider;

    jest.clearAllMocks();
  });

  describe('initiatePayment', () => {
    it('returns cached intent and decision on duplicate idempotency key', async () => {
      const existingIntent = {
        id: 'intent_123',
        credentialId: 'cred_1',
        channel: 'WEB',
        billerId: 'dstv',
        recipient: '123',
        amount: 5000,
        meta: {},
        status: 'EXECUTED',
        idempotencyKey: 'dup_key',
        createdAt: new Date(),
        decision: {
          verdict: 'ALLOW',
          reasons: [],
          evaluatedAt: new Date(),
        },
      };

      mockPrisma.paymentIntent.findUnique.mockResolvedValue(existingIntent);

      const res = await service.initiatePayment({
        credentialId: 'cred_1',
        channel: 'WEB',
        amount: 5000,
        idempotencyKey: 'dup_key',
      });

      expect(res.intent.id).toBe('intent_123');
      expect(res.decision.verdict).toBe('ALLOW');
      expect(mockPrisma.paymentIntent.findUnique).toHaveBeenCalledWith({
        where: { idempotencyKey: 'dup_key' },
        include: { decision: true },
      });
      expect(mockPrisma.credential.findUnique).not.toHaveBeenCalled();
    });

    it('processes ALLOW decision, executes payment, saves transaction, emits executed event', async () => {
      mockPrisma.paymentIntent.findUnique.mockResolvedValue(null);
      mockPrisma.credential.findUnique.mockResolvedValue(mockCredential);
      mockPolicyEngine.evaluate.mockReturnValue({
        verdict: 'ALLOW',
        reasons: [],
        evaluatedAt: new Date().toISOString(),
      });

      const dbIntent = {
        id: 'intent_123',
        credentialId: 'cred_1',
        channel: 'WEB',
        amount: 5000,
        idempotencyKey: 'key_1',
        status: 'ALLOWED',
        meta: {},
      };
      mockPrisma.paymentIntent.create.mockResolvedValue(dbIntent);
      mockPrisma.paymentIntent.update.mockResolvedValue({
        ...dbIntent,
        status: 'EXECUTED',
      });
      mockPaymentProvider.execute.mockResolvedValue({
        providerRef: 'ref_abc',
        token: 'token_123',
      });

      const res = await service.initiatePayment({
        credentialId: 'cred_1',
        channel: 'WEB',
        amount: 5000,
        idempotencyKey: 'key_1',
      });

      expect(res.intent.status).toBe('EXECUTED');
      expect(mockPaymentProvider.execute).toHaveBeenCalledWith(
        'key_1',
        5000,
        undefined,
        undefined,
      );
      expect(mockPrisma.transaction.create).toHaveBeenCalledWith({
        data: {
          intentId: 'intent_123',
          providerRef: 'ref_abc',
          tokenEncrypted: 'token_123',
        },
      });
      expect(auditService.log).toHaveBeenCalledWith(
        'acct_1',
        'AI_AGENT',
        'payment.executed',
        expect.any(Object),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        IntentEvents.Executed,
        expect.any(Object),
      );
    });

    it('processes ALLOW decision but transitions to FAILED on provider exception', async () => {
      mockPrisma.paymentIntent.findUnique.mockResolvedValue(null);
      mockPrisma.credential.findUnique.mockResolvedValue(mockCredential);
      mockPolicyEngine.evaluate.mockReturnValue({
        verdict: 'ALLOW',
        reasons: [],
        evaluatedAt: new Date().toISOString(),
      });

      const dbIntent = {
        id: 'intent_123',
        credentialId: 'cred_1',
        channel: 'WEB',
        amount: 5000,
        idempotencyKey: 'key_err',
        status: 'ALLOWED',
        meta: {},
      };
      mockPrisma.paymentIntent.create.mockResolvedValue(dbIntent);
      mockPrisma.paymentIntent.update.mockResolvedValue({
        ...dbIntent,
        status: 'FAILED',
      });
      mockPaymentProvider.execute.mockRejectedValue(new Error('Network Error'));

      const res = await service.initiatePayment({
        credentialId: 'cred_1',
        channel: 'WEB',
        amount: 5000,
        idempotencyKey: 'key_err',
      });

      expect(res.intent.status).toBe('FAILED');
      expect(auditService.log).toHaveBeenCalledWith(
        'acct_1',
        'AI_AGENT',
        'payment.failed',
        expect.any(Object),
      );
    });

    it('processes ESCALATE decision, creates cosign request, and emits escalated event', async () => {
      mockPrisma.paymentIntent.findUnique.mockResolvedValue(null);
      mockPrisma.credential.findUnique.mockResolvedValue(mockCredential);
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockPolicyEngine.evaluate.mockReturnValue({
        verdict: 'ESCALATE',
        reasons: [{ code: 'AMOUNT_ABOVE_COSIGN_THRESHOLD' }],
        evaluatedAt: new Date().toISOString(),
      });

      const dbIntent = {
        id: 'intent_escalate_123',
        credentialId: 'cred_1',
        channel: 'WEB',
        amount: 15000,
        idempotencyKey: 'key_esc',
        status: 'ESCALATED',
        meta: {},
      };
      mockPrisma.paymentIntent.create.mockResolvedValue(dbIntent);

      const res = await service.initiatePayment({
        credentialId: 'cred_1',
        channel: 'WEB',
        amount: 15000,
        idempotencyKey: 'key_esc',
      });

      expect(res.intent.status).toBe('ESCALATED');
      expect(mockPrisma.cosignRequest.create).toHaveBeenCalledWith({
        data: {
          intentId: 'intent_escalate_123',
          trustedContactId: 'user_trusted_1',
          status: 'PENDING',
        },
      });
      expect(auditService.log).toHaveBeenCalledWith(
        'acct_1',
        'AI_AGENT',
        'payment.escalated',
        expect.any(Object),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        IntentEvents.Escalated,
        expect.any(Object),
      );
    });

    it('processes DENY decision, logs denied to audit, returns denied intent', async () => {
      mockPrisma.paymentIntent.findUnique.mockResolvedValue(null);
      mockPrisma.credential.findUnique.mockResolvedValue(mockCredential);
      mockPolicyEngine.evaluate.mockReturnValue({
        verdict: 'DENY',
        reasons: [{ code: 'BILLER_NOT_ALLOWLISTED' }],
        evaluatedAt: new Date().toISOString(),
      });

      const dbIntent = {
        id: 'intent_deny_123',
        credentialId: 'cred_1',
        channel: 'WEB',
        amount: 1000,
        idempotencyKey: 'key_deny',
        status: 'DENIED',
        meta: {},
      };
      mockPrisma.paymentIntent.create.mockResolvedValue(dbIntent);

      const res = await service.initiatePayment({
        credentialId: 'cred_1',
        channel: 'WEB',
        amount: 1000,
        idempotencyKey: 'key_deny',
      });

      expect(res.intent.status).toBe('DENIED');
      expect(auditService.log).toHaveBeenCalledWith(
        'acct_1',
        'AI_AGENT',
        'payment.denied',
        expect.any(Object),
      );
      expect(mockPaymentProvider.execute).not.toHaveBeenCalled();
    });
  });

  describe('resumeIntent', () => {
    it('throws error and voids intent if credential is revoked', async () => {
      const intentWithRevokedCred = {
        id: 'intent_esc_123',
        credentialId: 'cred_1',
        amount: 5000,
        status: 'ESCALATED',
        idempotencyKey: 'key_esc',
        credential: {
          ...mockCredential,
          status: 'REVOKED',
        },
      };

      mockPrisma.paymentIntent.findUnique.mockResolvedValue(intentWithRevokedCred);
      mockPrisma.paymentIntent.update.mockResolvedValue({
        ...intentWithRevokedCred,
        status: 'VOIDED',
      });

      await expect(service.resumeIntent('intent_esc_123')).rejects.toThrow(
        'Credential has been revoked',
      );

      expect(mockPrisma.paymentIntent.update).toHaveBeenCalledWith({
        where: { id: 'intent_esc_123' },
        data: { status: 'VOIDED' },
        include: { credential: true },
      });
      expect(mockPrisma.cosignRequest.updateMany).toHaveBeenCalledWith({
        where: { intentId: 'intent_esc_123', status: 'PENDING' },
        data: { status: 'DENIED', resolvedAt: expect.any(Date) },
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        IntentEvents.Voided,
        expect.any(Object),
      );
    });

    it('executes transaction and resolves cosign to APPROVED if policy still passes on resume', async () => {
      const intentWithActiveCred = {
        id: 'intent_esc_123',
        credentialId: 'cred_1',
        amount: 5000,
        status: 'ESCALATED',
        idempotencyKey: 'key_esc',
        channel: 'WEB',
        meta: {},
        credential: {
          ...mockCredential,
          status: 'ACTIVE',
        },
      };

      mockPrisma.paymentIntent.findUnique.mockResolvedValue(intentWithActiveCred);
      mockPolicyEngine.evaluate.mockReturnValue({
        verdict: 'ALLOW',
        reasons: [],
        evaluatedAt: new Date().toISOString(),
      });
      mockPaymentProvider.execute.mockResolvedValue({
        providerRef: 'ref_resume',
      });
      mockPrisma.paymentIntent.update.mockResolvedValue({
        ...intentWithActiveCred,
        status: 'EXECUTED',
      });

      const res = await service.resumeIntent('intent_esc_123');

      expect(res.intent.status).toBe('EXECUTED');
      expect(mockPaymentProvider.execute).toHaveBeenCalledWith(
        'key_esc',
        5000,
        undefined,
        undefined,
      );
      expect(mockPrisma.cosignRequest.updateMany).toHaveBeenCalledWith({
        where: { intentId: 'intent_esc_123', status: 'PENDING' },
        data: { status: 'APPROVED', resolvedAt: expect.any(Date) },
      });
    });
  });

  describe('voidIntent', () => {
    it('sets status to VOIDED, resolves cosign request to DENIED, logs and emits voided event', async () => {
      const intent = {
        id: 'intent_esc_123',
        credentialId: 'cred_1',
        amount: 5000,
        status: 'ESCALATED',
        credential: { accountId: 'acct_1' },
      };

      mockPrisma.paymentIntent.update.mockResolvedValue(intent);

      await service.voidIntent('intent_esc_123', 'TTL Expired');

      expect(mockPrisma.paymentIntent.update).toHaveBeenCalledWith({
        where: { id: 'intent_esc_123' },
        data: { status: 'VOIDED' },
        include: { credential: true },
      });
      expect(mockPrisma.cosignRequest.updateMany).toHaveBeenCalledWith({
        where: { intentId: 'intent_esc_123', status: 'PENDING' },
        data: { status: 'DENIED', resolvedAt: expect.any(Date) },
      });
      expect(auditService.log).toHaveBeenCalledWith(
        'acct_1',
        'SYSTEM',
        'payment.voided',
        { intentId: 'intent_esc_123', reason: 'TTL Expired' },
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(IntentEvents.Voided, {
        intentId: 'intent_esc_123',
        reason: 'TTL Expired',
      });
    });
  });

  describe('OnEvent(cosign.resolved)', () => {
    it('calls resumeIntent if approved', async () => {
      const resumeSpy = jest.spyOn(service, 'resumeIntent').mockResolvedValue({
        intent: {} as any,
      });

      await service.handleCosignResolved({
        intentId: 'intent_123',
        approve: true,
        byUserId: 'user_daughter',
      });

      expect(resumeSpy).toHaveBeenCalledWith('intent_123');
    });

    it('calls voidIntent if denied', async () => {
      const voidSpy = jest.spyOn(service, 'voidIntent').mockResolvedValue();

      await service.handleCosignResolved({
        intentId: 'intent_123',
        approve: false,
        byUserId: 'user_daughter',
      });

      expect(voidSpy).toHaveBeenCalledWith(
        'intent_123',
        'Cosign request was denied by user user_daughter',
      );
    });
  });
});
