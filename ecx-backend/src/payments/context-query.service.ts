import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import * as contracts from '../contracts';
import { decryptToken } from './token-crypto.helper';

@Injectable()
export class ContextQueryService implements contracts.ContextQuery {
  constructor(private readonly prisma: PrismaService) {}

  async getUserContext(userId: string): Promise<contracts.UserContext> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        ownedAccounts: {
          include: {
            habits: true,
          },
        },
      },
    });

    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    const account = user.ownedAccounts[0];
    if (!account) {
      throw new Error(`No account associated with user: ${userId}`);
    }

    // Retrieve names of billers for the habits
    const billerIds = account.habits.map((h) => h.billerId);
    const billerNames = new Map<string, string>();
    if (billerIds.length > 0) {
      const billers = await this.prisma.biller.findMany({
        where: { id: { in: billerIds } },
      });
      billers.forEach((b) => billerNames.set(b.id, b.name));
    }

    const habits: contracts.HabitSummary[] = account.habits.map((h) => ({
      billerId: h.billerId,
      billerLabel: billerNames.get(h.billerId) || h.billerId,
      typicalAmount: h.typicalAmountMean,
      typicalIntervalDays: h.typicalIntervalDays || 0,
      lastPaidAt: h.lastPaidAt?.toISOString(),
    }));

    return {
      userId,
      accountId: account.id,
      name: user.name,
      languagePref: user.languagePref,
      habits,
    };
  }

  async getPolicySummary(credentialId: string): Promise<contracts.PolicySummary> {
    const cred = await this.prisma.credential.findUnique({
      where: { id: credentialId },
      include: { policyRules: true },
    });

    if (!cred) {
      throw new Error(`Credential not found: ${credentialId}`);
    }

    const humanReadable: string[] = [];

    // Collect all biller ids to fetch labels
    const billerIds = new Set<string>();
    for (const rule of cred.policyRules) {
      if (rule.ruleType === 'BILLER_ALLOWLIST') {
        const params = rule.params as { billerIds: string[] };
        params.billerIds.forEach((id) => billerIds.add(id));
      }
    }
    const billerNames = new Map<string, string>();
    if (billerIds.size > 0) {
      const billers = await this.prisma.biller.findMany({
        where: { id: { in: Array.from(billerIds) } },
      });
      billers.forEach((b) => billerNames.set(b.id, b.name));
    }

    for (const rule of cred.policyRules) {
      switch (rule.ruleType) {
        case 'SPEND_CAP_MONTHLY': {
          const limit = (rule.params as any).limit;
          humanReadable.push(`Up to ${contracts.formatNaira(limit)} total per month.`);
          break;
        }
        case 'SPEND_CAP_PER_TX': {
          const limit = (rule.params as any).limit;
          humanReadable.push(`Up to ${contracts.formatNaira(limit)} per transaction.`);
          break;
        }
        case 'BILLER_ALLOWLIST': {
          const ids = (rule.params as any).billerIds as string[];
          const names = ids.map((id) => billerNames.get(id) || id);
          humanReadable.push(`Only allowed to pay: ${names.join(', ')}.`);
          break;
        }
        case 'RECIPIENT_LOCK': {
          const recipients = (rule.params as any).recipients as string[];
          humanReadable.push(`Only allowed to pay recipients: ${recipients.join(', ')}.`);
          break;
        }
        case 'COSIGN_THRESHOLD': {
          const threshold = (rule.params as any).threshold;
          humanReadable.push(
            `Payments over ${contracts.formatNaira(threshold)} need approval from a trusted contact.`,
          );
          break;
        }
        case 'CHANNEL_SCOPE': {
          const channels = (rule.params as any).channels as string[];
          humanReadable.push(`Only allowed on channels: ${channels.join(', ')}.`);
          break;
        }
        case 'TIME_WINDOW': {
          const { startHour, endHour, tz } = rule.params as {
            startHour: number;
            endHour: number;
            tz: string;
          };
          humanReadable.push(`Only allowed between ${startHour}:00 and ${endHour}:00 (Timezone: ${tz}).`);
          break;
        }
      }
    }

    return {
      credentialId,
      label: cred.label,
      status: cred.status as 'ACTIVE' | 'REVOKED',
      humanReadable,
    };
  }

  async listRecentTransactions(
    accountId: string,
    opts?: { limit?: number },
  ): Promise<contracts.TxSummary[]> {
    const limit = opts?.limit ?? 10;
    const intents = await this.prisma.paymentIntent.findMany({
      where: {
        credential: { accountId },
      },
      include: {
        biller: true,
        transaction: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    });

    return intents.map((intent) => ({
      intentId: intent.id,
      billerLabel: intent.biller?.name || undefined,
      recipient: intent.recipient || undefined,
      amount: intent.amount,
      status: intent.status,
      executedAt: intent.transaction?.executedAt.toISOString() || undefined,
    }));
  }

  async summarizeMonth(accountId: string, month: string): Promise<string> {
    const [yearStr, monthStr] = month.split('-');
    const year = parseInt(yearStr, 10);
    const monthIndex = parseInt(monthStr, 10) - 1;

    const startOfMonth = new Date(Date.UTC(year, monthIndex, 1));
    const endOfMonth = new Date(Date.UTC(year, monthIndex + 1, 1));

    const intents = await this.prisma.paymentIntent.findMany({
      where: {
        credential: { accountId },
        status: 'EXECUTED',
        createdAt: {
          gte: startOfMonth,
          lt: endOfMonth,
        },
      },
      include: {
        biller: true,
      },
    });

    if (intents.length === 0) {
      return 'No payments were made this month.';
    }

    const totalSpend = intents.reduce((sum, intent) => sum + intent.amount, 0);

    const summaries: string[] = [];
    const billerGroups = new Map<string, { count: number; total: number }>();
    let transferTotal = 0;
    let transferCount = 0;

    for (const intent of intents) {
      if (intent.biller) {
        const existing = billerGroups.get(intent.biller.name) || { count: 0, total: 0 };
        billerGroups.set(intent.biller.name, {
          count: existing.count + 1,
          total: existing.total + intent.amount,
        });
      } else {
        transferCount++;
        transferTotal += intent.amount;
      }
    }

    for (const [billerName, group] of billerGroups.entries()) {
      summaries.push(`${contracts.formatNaira(group.total)} for ${billerName}`);
    }
    if (transferCount > 0) {
      summaries.push(`${contracts.formatNaira(transferTotal)} for transfers`);
    }

    const countWord = intents.length === 1 ? 'payment' : 'payments';
    return `This month, ${intents.length} ${countWord} went out totaling ${contracts.formatNaira(totalSpend)}: ${summaries.join(', and ')}.`;
  }

  async readLastToken(intentId: string, reauthOk: boolean): Promise<string> {
    if (!reauthOk) {
      throw new Error('Re-auth required to read token');
    }

    const transaction = await this.prisma.transaction.findUnique({
      where: { intentId },
    });

    if (!transaction) {
      throw new Error(`Transaction not found for intent: ${intentId}`);
    }

    if (!transaction.tokenEncrypted) {
      throw new Error('No token associated with this transaction');
    }

    return decryptToken(transaction.tokenEncrypted);
  }

  @OnEvent(contracts.IntentEvents.Executed)
  async handleIntentExecuted(payload: contracts.IntentExecutedPayload) {
    const { accountId, billerId } = payload;
    if (!billerId) return;

    // Recalculate rolling habits for this account and biller from EXECUTED intents
    const intents = await this.prisma.paymentIntent.findMany({
      where: {
        credential: { accountId },
        billerId,
        status: 'EXECUTED',
      },
      include: {
        transaction: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    if (intents.length === 0) return;

    const amounts = intents.map((intent) => intent.amount);
    const n = amounts.length;

    const sum = amounts.reduce((acc, val) => acc + val, 0);
    const typicalAmountMean = Math.round(sum / n);

    let amountVar = 0;
    if (n > 1) {
      const squaredDiffs = amounts.map((amount) => Math.pow(amount - typicalAmountMean, 2));
      const diffsSum = squaredDiffs.reduce((acc, val) => acc + val, 0);
      amountVar = diffsSum / n;
    }

    let typicalIntervalDays: number | null = null;
    if (n > 1) {
      const times = intents.map((intent) => {
        const date = intent.transaction?.executedAt || intent.createdAt;
        return new Date(date).getTime();
      });
      const firstTime = times[0];
      const lastTime = times[n - 1];
      const totalDurationMs = lastTime - firstTime;
      const totalDurationDays = totalDurationMs / (1000 * 60 * 60 * 24);
      typicalIntervalDays = totalDurationDays / (n - 1);
    }

    const lastPaidAt = intents[n - 1].transaction?.executedAt || intents[n - 1].createdAt;

    await this.prisma.habit.upsert({
      where: {
        accountId_billerId: {
          accountId,
          billerId,
        },
      },
      create: {
        accountId,
        billerId,
        typicalAmountMean,
        amountVar,
        typicalIntervalDays,
        lastPaidAt: new Date(lastPaidAt),
      },
      update: {
        typicalAmountMean,
        amountVar,
        typicalIntervalDays,
        lastPaidAt: new Date(lastPaidAt),
      },
    });
  }
}
