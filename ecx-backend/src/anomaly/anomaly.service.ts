import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import * as contracts from '../contracts';

@Injectable()
export class AnomalyService {
  constructor(private readonly prisma: PrismaService) {}

  @OnEvent(contracts.IntentEvents.Executed)
  async handleIntentExecuted(payload: contracts.IntentExecutedPayload) {
    const { intentId, accountId, amount, billerId, executedAt } = payload;

    // 1. Recipient Set Anomaly
    let recipientScore = 0.0;
    const currentIntent = await this.prisma.paymentIntent.findUnique({
      where: { id: intentId },
    });
    const recipient = currentIntent?.recipient;

    if (recipient) {
      // Find previous successful payments for this account
      const previousTransfers = await this.prisma.paymentIntent.findMany({
        where: {
          id: { not: intentId },
          credential: { accountId },
          status: 'EXECUTED',
          recipient: { not: null },
        },
      });

      const recipientSet = new Set(previousTransfers.map((p) => p.recipient));
      if (!recipientSet.has(recipient)) {
        recipientScore = 1.0; // New recipient
      }
    }

    // 2. Amount Distribution Anomaly (z-score)
    let amountScore = 0.0;
    if (billerId) {
      const previousPayments = await this.prisma.paymentIntent.findMany({
        where: {
          id: { not: intentId },
          credential: { accountId },
          billerId,
          status: 'EXECUTED',
        },
      });

      if (previousPayments.length >= 3) {
        const amounts = previousPayments.map((p) => p.amount);
        const mean = amounts.reduce((s, a) => s + a, 0) / amounts.length;
        const variance = amounts.reduce((s, a) => s + Math.pow(a - mean, 2), 0) / amounts.length;
        const stdDev = Math.sqrt(variance);

        if (stdDev === 0) {
          if (amount !== mean) {
            amountScore = 1.0; // Changed amount when it was strictly constant before
          }
        } else {
          const z = Math.abs(amount - mean) / stdDev;
          if (z > 3.0) {
            amountScore = 1.0;
          } else if (z > 1.96) {
            amountScore = 0.5;
          }
        }
      }
    }

    // 3. Time-of-day Anomaly (Late night in Nigeria: 23:00 to 05:00 West Africa Time / UTC+1)
    let timeScore = 0.0;
    try {
      const date = new Date(executedAt);
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Africa/Lagos',
        hour: 'numeric',
        hourCycle: 'h23',
      });
      const hour = parseInt(formatter.format(date), 10);
      if (hour >= 23 || hour < 5) {
        timeScore = 1.0;
      }
    } catch (e) {
      // Fallback in case of Date parsing/formatting error
    }

    const score = Math.max(recipientScore, amountScore, timeScore);

    // Save flag if the score exceeds the threshold
    if (score >= 0.5) {
      await this.prisma.anomalyFlag.create({
        data: {
          accountId,
          intentId,
          score,
          factors: {
            recipientScore,
            amountScore,
            timeScore,
            details: {
              newRecipient: recipientScore > 0,
              unusualAmount: amountScore > 0,
              nighttimePayment: timeScore > 0,
            },
          },
        },
      });
    }
  }
}
