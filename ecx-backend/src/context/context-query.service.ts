import { Injectable } from '@nestjs/common';
import { formatNaira } from '../contracts';
import type { ContextQuery, PolicyRule, PolicySummary, TxSummary, UserContext } from '../contracts';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Minimal Prisma-backed read model for the agent's read tools (Seam 2). Owned jointly (A/B) per the
 * workplan; Dev B builds a minimal version to unblock the agent. Reads real data where it exists and
 * degrades gracefully when seed/habits are absent.
 */
@Injectable()
export class ContextQueryService implements ContextQuery {
  constructor(private readonly prisma: PrismaService) {}

  async getUserContext(userId: string): Promise<UserContext> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const account = await this.prisma.account.findFirst({ where: { ownerUserId: userId } });
    const habits = account ? await this.prisma.habit.findMany({ where: { accountId: account.id } }) : [];
    return {
      userId,
      accountId: account?.id ?? '',
      name: user?.name ?? 'there',
      languagePref: user?.languagePref ?? 'en',
      habits: habits.map((h) => ({
        billerId: h.billerId,
        billerLabel: h.billerId,
        typicalAmount: h.typicalAmountMean,
        typicalIntervalDays: h.typicalIntervalDays ?? 0,
        lastPaidAt: h.lastPaidAt?.toISOString(),
      })),
    };
  }

  async getPolicySummary(credentialId: string): Promise<PolicySummary> {
    const cred = await this.prisma.credential.findUnique({ where: { id: credentialId }, include: { policyRules: true } });
    if (!cred) return { credentialId, label: 'unknown', status: 'ACTIVE', humanReadable: [] };
    return {
      credentialId,
      label: cred.label,
      status: cred.status as PolicySummary['status'],
      humanReadable: cred.policyRules.map((r) => ruleToText({ ruleType: r.ruleType, params: r.params } as PolicyRule)).filter(Boolean),
    };
  }

  async listRecentTransactions(accountId: string, opts?: { limit?: number }): Promise<TxSummary[]> {
    const rows = await this.prisma.paymentIntent.findMany({
      where: { credential: { accountId } },
      include: { biller: true, transaction: true },
      orderBy: { createdAt: 'desc' },
      take: opts?.limit ?? 5,
    });
    return rows.map((i) => ({
      intentId: i.id,
      billerLabel: i.biller?.name,
      recipient: i.recipient ?? undefined,
      amount: i.amount,
      status: i.status,
      executedAt: i.transaction?.executedAt?.toISOString(),
    }));
  }

  async summarizeMonth(accountId: string, month: string): Promise<string> {
    const start = new Date(`${month}-01T00:00:00Z`);
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    const executed = await this.prisma.paymentIntent.findMany({
      where: { credential: { accountId }, status: 'EXECUTED', createdAt: { gte: start, lt: end } },
      include: { biller: true },
    });
    if (executed.length === 0) return 'No payments went out this month.';
    const total = executed.reduce((s, i) => s + i.amount, 0);
    const lines = executed.map((i) => `${formatNaira(i.amount)} for ${i.biller?.name ?? i.recipient ?? 'a payment'}`);
    return `This month, ${executed.length} payment(s) totalling ${formatNaira(total)} went out: ${lines.join('; ')}.`;
  }

  async readLastToken(intentId: string, reauthOk: boolean): Promise<string> {
    if (!reauthOk) throw new Error('Re-auth required to read token');
    const tx = await this.prisma.transaction.findUnique({ where: { intentId } });
    if (!tx?.tokenEncrypted) throw new Error('No token available for this payment');
    return tx.tokenEncrypted;
  }
}

/** Turn a policy rule into a plain sentence the agent can speak. */
function ruleToText(rule: PolicyRule): string {
  switch (rule.ruleType) {
    case 'SPEND_CAP_PER_TX':
      return `Up to ${formatNaira(rule.params.limit)} per payment.`;
    case 'SPEND_CAP_MONTHLY':
      return `Up to ${formatNaira(rule.params.limit)} per month.`;
    case 'BILLER_ALLOWLIST':
      return `Only these billers are allowed: ${rule.params.billerIds.join(', ')}.`;
    case 'RECIPIENT_LOCK':
      return 'Payments only to approved recipients.';
    case 'COSIGN_THRESHOLD':
      return `Payments above ${formatNaira(rule.params.threshold)} need approval from a trusted contact.`;
    case 'CHANNEL_SCOPE':
      return `Allowed channels: ${rule.params.channels.join(', ')}.`;
    case 'TIME_WINDOW':
      return `Payments only allowed between ${rule.params.startHour}:00 and ${rule.params.endHour}:00.`;
    default:
      return '';
  }
}
