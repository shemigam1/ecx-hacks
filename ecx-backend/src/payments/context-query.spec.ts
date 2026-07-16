import { Test, TestingModule } from '@nestjs/testing';
import { ContextQueryService } from './context-query.service';
import { PrismaService } from '../prisma/prisma.service';
import { encryptToken } from './token-crypto.helper';

describe('ContextQueryService', () => {
  let service: ContextQueryService;
  let prisma: PrismaService;

  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
    },
    credential: {
      findUnique: jest.fn(),
    },
    biller: {
      findMany: jest.fn(),
    },
    paymentIntent: {
      findMany: jest.fn(),
    },
    transaction: {
      findUnique: jest.fn(),
    },
    habit: {
      upsert: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContextQueryService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ContextQueryService>(ContextQueryService);
    prisma = module.get<PrismaService>(PrismaService);

    jest.clearAllMocks();
  });

  describe('getUserContext', () => {
    it('returns the user account and rolling habits', async () => {
      const mockUserData = {
        id: 'user_1',
        name: 'Mama Nkechi',
        languagePref: 'pcm',
        ownedAccounts: [
          {
            id: 'acct_1',
            habits: [
              {
                billerId: 'ikeja_electric',
                typicalAmountMean: 500000,
                typicalIntervalDays: 9,
                lastPaidAt: new Date('2026-07-04T09:12:00Z'),
              },
            ],
          },
        ],
      };

      mockPrisma.user.findUnique.mockResolvedValue(mockUserData);
      mockPrisma.biller.findMany.mockResolvedValue([
        { id: 'ikeja_electric', name: 'Ikeja Electric' },
      ]);

      const res = await service.getUserContext('user_1');

      expect(res.name).toBe('Mama Nkechi');
      expect(res.languagePref).toBe('pcm');
      expect(res.accountId).toBe('acct_1');
      expect(res.habits).toHaveLength(1);
      expect(res.habits[0].billerLabel).toBe('Ikeja Electric');
      expect(res.habits[0].typicalAmount).toBe(500000);
      expect(res.habits[0].typicalIntervalDays).toBe(9);
      expect(res.habits[0].lastPaidAt).toBe('2026-07-04T09:12:00.000Z');
    });

    it('throws if user is not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.getUserContext('user_unknown')).rejects.toThrow('User not found');
    });
  });

  describe('getPolicySummary', () => {
    it('translates policy rules into natural-language sentences', async () => {
      const mockCredData = {
        id: 'cred_1',
        label: 'Mama Agent',
        status: 'ACTIVE',
        policyRules: [
          { ruleType: 'SPEND_CAP_MONTHLY', params: { limit: 1000000 } },
          { ruleType: 'SPEND_CAP_PER_TX', params: { limit: 200000 } },
          { ruleType: 'BILLER_ALLOWLIST', params: { billerIds: ['ikeja_electric'] } },
          { ruleType: 'RECIPIENT_LOCK', params: { recipients: ['0123456789'] } },
          { ruleType: 'COSIGN_THRESHOLD', params: { threshold: 500000 } },
          { ruleType: 'CHANNEL_SCOPE', params: { channels: ['VOICE'] } },
          { ruleType: 'TIME_WINDOW', params: { startHour: 8, endHour: 20, tz: 'Africa/Lagos' } },
        ],
      };

      mockPrisma.credential.findUnique.mockResolvedValue(mockCredData);
      mockPrisma.biller.findMany.mockResolvedValue([
        { id: 'ikeja_electric', name: 'Ikeja Electric' },
      ]);

      const res = await service.getPolicySummary('cred_1');

      expect(res.label).toBe('Mama Agent');
      expect(res.status).toBe('ACTIVE');
      expect(res.humanReadable).toContain('Up to ₦10,000.00 total per month.');
      expect(res.humanReadable).toContain('Up to ₦2,000.00 per transaction.');
      expect(res.humanReadable).toContain('Only allowed to pay: Ikeja Electric.');
      expect(res.humanReadable).toContain('Only allowed to pay recipients: 0123456789.');
      expect(res.humanReadable).toContain('Payments over ₦5,000.00 need approval from a trusted contact.');
      expect(res.humanReadable).toContain('Only allowed on channels: VOICE.');
      expect(res.humanReadable).toContain('Only allowed between 8:00 and 20:00 (Timezone: Africa/Lagos).');
    });
  });

  describe('listRecentTransactions', () => {
    it('returns formatted TxSummary array', async () => {
      const mockIntents = [
        {
          id: 'intent_1',
          amount: 500000,
          recipient: null,
          status: 'EXECUTED',
          biller: { name: 'Ikeja Electric' },
          transaction: { executedAt: new Date('2026-07-04T09:12:00Z') },
        },
      ];

      mockPrisma.paymentIntent.findMany.mockResolvedValue(mockIntents);

      const res = await service.listRecentTransactions('acct_1');

      expect(res).toHaveLength(1);
      expect(res[0].intentId).toBe('intent_1');
      expect(res[0].billerLabel).toBe('Ikeja Electric');
      expect(res[0].amount).toBe(500000);
      expect(res[0].status).toBe('EXECUTED');
      expect(res[0].executedAt).toBe('2026-07-04T09:12:00.000Z');
    });
  });

  describe('summarizeMonth', () => {
    it('returns a plain-speech summary of monthly payments', async () => {
      const mockIntents = [
        {
          id: 'intent_1',
          amount: 500000,
          biller: { name: 'Ikeja Electric' },
        },
        {
          id: 'intent_2',
          amount: 300000,
          biller: { name: 'DSTV' },
        },
        {
          id: 'intent_3',
          amount: 200000,
          biller: null, // transfer
        },
      ];

      mockPrisma.paymentIntent.findMany.mockResolvedValue(mockIntents);

      const summary = await service.summarizeMonth('acct_1', '2026-07');

      expect(summary).toContain('3 payments went out totaling ₦10,000.00');
      expect(summary).toContain('₦5,000.00 for Ikeja Electric');
      expect(summary).toContain('₦3,000.00 for DSTV');
      expect(summary).toContain('₦2,000.00 for transfers');
    });

    it('returns empty message when no payments found', async () => {
      mockPrisma.paymentIntent.findMany.mockResolvedValue([]);
      const summary = await service.summarizeMonth('acct_1', '2026-07');
      expect(summary).toBe('No payments were made this month.');
    });
  });

  describe('readLastToken', () => {
    it('decrypts and returns the token when reauthOk is true', async () => {
      const token = '1234 5678 9012 3456 7890';
      const encrypted = encryptToken(token);

      mockPrisma.transaction.findUnique.mockResolvedValue({
        tokenEncrypted: encrypted,
      });

      const res = await service.readLastToken('intent_1', true);
      expect(res).toBe(token);
    });

    it('throws if reauthOk is false', async () => {
      await expect(service.readLastToken('intent_1', false)).rejects.toThrow('Re-auth required');
    });
  });

  describe('handleIntentExecuted (Rolling Habits Listener)', () => {
    it('calculates mean, variance, and interval correctly and upserts a Habit row', async () => {
      // Create three payments for a biller:
      // P1: ₦5,000 (t=0)
      // P2: ₦6,000 (t=10 days)
      // P3: ₦4,000 (t=20 days)
      // Mean: ₦5,000
      // Variance: ((0)^2 + (1000)^2 + (-1000)^2) / 3 = 2,000,000 / 3 = 666,666.67
      // Interval: 20 days / 2 = 10 days
      const t0 = new Date('2026-07-01T00:00:00Z');
      const t1 = new Date('2026-07-11T00:00:00Z');
      const t2 = new Date('2026-07-21T00:00:00Z');

      const mockIntents = [
        { id: '1', amount: 500000, createdAt: t0, transaction: { executedAt: t0 } },
        { id: '2', amount: 600000, createdAt: t1, transaction: { executedAt: t1 } },
        { id: '3', amount: 400000, createdAt: t2, transaction: { executedAt: t2 } },
      ];

      mockPrisma.paymentIntent.findMany.mockResolvedValue(mockIntents);

      await service.handleIntentExecuted({
        intentId: '3',
        accountId: 'acct_1',
        amount: 400000,
        billerId: 'ikeja_electric',
        executedAt: t2.toISOString(),
      });

      expect(mockPrisma.habit.upsert).toHaveBeenCalledWith({
        where: {
          accountId_billerId: {
            accountId: 'acct_1',
            billerId: 'ikeja_electric',
          },
        },
        create: expect.objectContaining({
          typicalAmountMean: 500000,
          amountVar: 6666666666.666667,
          typicalIntervalDays: 10,
        }),
        update: expect.objectContaining({
          typicalAmountMean: 500000,
          amountVar: 6666666666.666667,
          typicalIntervalDays: 10,
        }),
      });
    });
  });
});
