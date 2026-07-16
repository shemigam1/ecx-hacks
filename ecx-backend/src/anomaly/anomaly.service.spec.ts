import { Test, TestingModule } from '@nestjs/testing';
import { AnomalyService } from './anomaly.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AnomalyService', () => {
  let service: AnomalyService;
  let prisma: PrismaService;

  const mockPrisma = {
    paymentIntent: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    anomalyFlag: {
      create: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnomalyService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AnomalyService>(AnomalyService);
    prisma = module.get<PrismaService>(PrismaService);

    jest.clearAllMocks();
  });

  describe('handleIntentExecuted', () => {
    it('does not create any AnomalyFlag if there is no anomaly (low score)', async () => {
      // 1. Recipient is already paid in history
      mockPrisma.paymentIntent.findUnique.mockResolvedValue({
        id: 'intent_current',
        recipient: 'recipient_old',
      });
      mockPrisma.paymentIntent.findMany.mockResolvedValue([
        { id: 'intent_prev', recipient: 'recipient_old' },
      ]);

      const daytime = '2026-07-04T12:00:00.000Z'; // 13:00 WAT (Lagos)

      await service.handleIntentExecuted({
        intentId: 'intent_current',
        accountId: 'acct_1',
        amount: 500000,
        executedAt: daytime,
      });

      expect(mockPrisma.anomalyFlag.create).not.toHaveBeenCalled();
    });

    it('creates AnomalyFlag with recipientScore = 1.0 on a new recipient', async () => {
      mockPrisma.paymentIntent.findUnique.mockResolvedValue({
        id: 'intent_current',
        recipient: 'recipient_new',
      });
      // Previous transactions paid to different recipient
      mockPrisma.paymentIntent.findMany.mockResolvedValue([
        { id: 'intent_prev', recipient: 'recipient_old' },
      ]);

      const daytime = '2026-07-04T12:00:00.000Z'; // 13:00 WAT (Lagos)

      await service.handleIntentExecuted({
        intentId: 'intent_current',
        accountId: 'acct_1',
        amount: 500000,
        executedAt: daytime,
      });

      expect(mockPrisma.anomalyFlag.create).toHaveBeenCalledWith({
        data: {
          accountId: 'acct_1',
          intentId: 'intent_current',
          score: 1.0,
          factors: expect.objectContaining({
            recipientScore: 1.0,
            details: expect.objectContaining({
              newRecipient: true,
            }),
          }),
        },
      });
    });

    it('creates AnomalyFlag with timeScore = 1.0 on a nighttime transaction (23:00 to 05:00 Lagos time)', async () => {
      mockPrisma.paymentIntent.findUnique.mockResolvedValue({
        id: 'intent_current',
        recipient: null,
      });

      const nighttime = '2026-07-04T23:30:00.000Z'; // 00:30 WAT (Lagos is UTC+1)

      await service.handleIntentExecuted({
        intentId: 'intent_current',
        accountId: 'acct_1',
        amount: 500000,
        executedAt: nighttime,
      });

      expect(mockPrisma.anomalyFlag.create).toHaveBeenCalledWith({
        data: {
          accountId: 'acct_1',
          intentId: 'intent_current',
          score: 1.0,
          factors: expect.objectContaining({
            timeScore: 1.0,
            details: expect.objectContaining({
              nighttimePayment: true,
            }),
          }),
        },
      });
    });

    it('creates AnomalyFlag with amountScore = 1.0 if z-score > 3.0', async () => {
      mockPrisma.paymentIntent.findUnique.mockResolvedValue({
        id: 'intent_current',
        recipient: null,
      });

      // Previous payments to the same biller: all ₦5,000 (mean = 500_000, stdDev = 0)
      // New amount is ₦10,000 (1_000_000 kobo).
      // Since stdDev is 0 and amount differs, it should trigger amountScore = 1.0.
      mockPrisma.paymentIntent.findMany.mockResolvedValue([
        { id: 'intent_prev1', amount: 500000, billerId: 'ikeja' },
        { id: 'intent_prev2', amount: 500000, billerId: 'ikeja' },
        { id: 'intent_prev3', amount: 500000, billerId: 'ikeja' },
      ]);

      const daytime = '2026-07-04T12:00:00.000Z';

      await service.handleIntentExecuted({
        intentId: 'intent_current',
        accountId: 'acct_1',
        amount: 1000000,
        billerId: 'ikeja',
        executedAt: daytime,
      });

      expect(mockPrisma.anomalyFlag.create).toHaveBeenCalledWith({
        data: {
          accountId: 'acct_1',
          intentId: 'intent_current',
          score: 1.0,
          factors: expect.objectContaining({
            amountScore: 1.0,
            details: expect.objectContaining({
              unusualAmount: true,
            }),
          }),
        },
      });
    });

    it('creates AnomalyFlag with amountScore = 0.5 if z-score > 1.96', async () => {
      mockPrisma.paymentIntent.findUnique.mockResolvedValue({
        id: 'intent_current',
        recipient: null,
      });

      // Previous payments: ₦4,000, ₦5,000, ₦6,000.
      // Mean = 5,000.
      // Variance = ((1000)^2 + 0 + (-1000)^2) / 3 = 666,666.67
      // stdDev = ~816.5
      // New payment = ₦7,000 (700,000 kobo).
      // z = (700000 - 500000) / 81650 = 200000 / 81650 = 2.45
      // Since 2.45 > 1.96, it should trigger amountScore = 0.5.
      mockPrisma.paymentIntent.findMany.mockResolvedValue([
        { id: '1', amount: 400000, billerId: 'ikeja' },
        { id: '2', amount: 500000, billerId: 'ikeja' },
        { id: '3', amount: 600000, billerId: 'ikeja' },
      ]);

      const daytime = '2026-07-04T12:00:00.000Z';

      await service.handleIntentExecuted({
        intentId: 'intent_current',
        accountId: 'acct_1',
        amount: 700000,
        billerId: 'ikeja',
        executedAt: daytime,
      });

      expect(mockPrisma.anomalyFlag.create).toHaveBeenCalledWith({
        data: {
          accountId: 'acct_1',
          intentId: 'intent_current',
          score: 0.5,
          factors: expect.objectContaining({
            amountScore: 0.5,
            details: expect.objectContaining({
              unusualAmount: true,
            }),
          }),
        },
      });
    });
  });
});
