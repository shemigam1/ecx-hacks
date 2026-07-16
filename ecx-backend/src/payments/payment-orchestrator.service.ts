import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  InitiatePaymentInput,
  IntentEscalatedPayload,
  IntentEvents,
  IntentExecutedPayload,
  IntentVoidedPayload,
  PaymentIntent,
  PaymentOrchestrator,
  PolicyDecision,
  PolicyReason,
} from '../contracts';
import { PrismaService } from '../prisma/prisma.service';
import { PolicyService } from '../policy/policy.service';
import { AuditService } from '../audit/audit.service';
import { PAYMENT_PROVIDER } from './payment-provider';
import type { PaymentProvider, ProviderResult } from './payment-provider';
import { toContractCredential, toContractIntent } from './prisma-mappers';
import { encryptToken } from './token-crypto';

/**
 * Seam 1 implementation (BACKEND_WORKPLAN.md §3). The ONLY path money takes.
 * create intent → evaluate policy → ALLOW executes via provider / ESCALATE holds + emits /
 * DENY records. Idempotent on idempotencyKey. Revocation re-checked at execution time.
 */
@Injectable()
export class PaymentOrchestratorService implements PaymentOrchestrator {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  async initiatePayment(input: InitiatePaymentInput): Promise<{ intent: PaymentIntent; decision: PolicyDecision }> {
    // Idempotency: same key ⇒ return the original intent + decision, never a second payment.
    const existing = await this.prisma.paymentIntent.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      include: { decision: true },
    });
    if (existing) {
      return { intent: toContractIntent(existing), decision: this.decisionFromRow(existing.decision) };
    }

    const credential = await this.prisma.credential.findUnique({
      where: { id: input.credentialId },
      include: { policyRules: true },
    });
    if (!credential) throw new NotFoundException(`credential ${input.credentialId} not found`);

    const created = await this.prisma.paymentIntent.create({
      data: {
        credentialId: input.credentialId,
        channel: input.channel,
        billerId: input.billerId ?? null,
        recipient: input.recipient ?? null,
        amount: input.amount,
        meta: (input.meta ?? {}) as object,
        status: 'PENDING',
        idempotencyKey: input.idempotencyKey,
      },
    });

    const now = new Date();
    const monthlySpentSoFar = await this.monthlySpend(input.credentialId, now);
    const decision = this.policy.evaluate(toContractIntent(created), toContractCredential(credential), {
      monthlySpentSoFar,
      now,
    });

    await this.prisma.policyDecision.create({
      data: { intentId: created.id, verdict: decision.verdict, reasons: decision.reasons as object, evaluatedAt: now },
    });
    await this.audit.append(credential.accountId, this.actor(credential.delegateType), 'INTENT_EVALUATED', {
      intentId: created.id,
      verdict: decision.verdict,
      reasons: decision.reasons,
      amount: input.amount,
      billerId: input.billerId,
      channel: input.channel,
    });

    let status: PaymentIntent['status'];
    if (decision.verdict === 'DENY') {
      status = 'DENIED';
    } else if (decision.verdict === 'ESCALATE') {
      status = 'ESCALATED';
      this.events.emit(IntentEvents.Escalated, {
        intentId: created.id,
        accountId: credential.accountId,
        amount: input.amount,
        reasons: decision.reasons,
      } satisfies IntentEscalatedPayload);
    } else {
      status = await this.executeAndRecord(created, credential.accountId, input.amount, input.billerId);
    }

    const updated = await this.prisma.paymentIntent.update({ where: { id: created.id }, data: { status } });
    return { intent: toContractIntent(updated), decision };
  }

  /** Called by CosignModule after approval. Re-checks policy (revocation!) then executes. */
  async resumeIntent(intentId: string): Promise<{ intent: PaymentIntent }> {
    const row = await this.prisma.paymentIntent.findUnique({
      where: { id: intentId },
      include: { credential: { include: { policyRules: true } } },
    });
    if (!row) throw new NotFoundException(`intent ${intentId} not found`);

    const now = new Date();
    const decision = this.policy.evaluate(toContractIntent(row), toContractCredential(row.credential), {
      monthlySpentSoFar: await this.monthlySpend(row.credentialId, now),
      now,
    });
    if (decision.verdict !== 'ALLOW') {
      await this.voidIntent(intentId, `policy re-check on resume: ${decision.verdict}`);
      const voided = await this.prisma.paymentIntent.findUniqueOrThrow({ where: { id: intentId } });
      return { intent: toContractIntent(voided) };
    }

    const status = await this.executeAndRecord(row, row.credential.accountId, row.amount, row.billerId ?? undefined);
    const updated = await this.prisma.paymentIntent.update({ where: { id: intentId }, data: { status } });
    return { intent: toContractIntent(updated) };
  }

  /** Called on cosign deny / TTL expiry. */
  async voidIntent(intentId: string, reason: string): Promise<void> {
    const row = await this.prisma.paymentIntent.update({ where: { id: intentId }, data: { status: 'VOIDED' } });
    this.events.emit(IntentEvents.Voided, { intentId, reason } satisfies IntentVoidedPayload);
    await this.audit.append(await this.accountIdFor(row.credentialId), 'SYSTEM', 'INTENT_VOIDED', { intentId, reason });
  }

  // ---- internals ------------------------------------------------------------------------------

  private async executeAndRecord(
    intentRow: { id: string; idempotencyKey: string; billerId: string | null; recipient: string | null; amount: number; meta: unknown },
    accountId: string,
    amount: number,
    billerId?: string,
  ): Promise<PaymentIntent['status']> {
    const result = await this.execute(intentRow);

    if (result.status === 'FAILED') {
      await this.audit.append(accountId, 'SYSTEM', 'INTENT_FAILED', { intentId: intentRow.id, message: result.message });
      return 'FAILED';
    }

    await this.prisma.transaction.create({
      data: {
        intentId: intentRow.id,
        providerRef: result.providerRef,
        tokenEncrypted: result.token ? encryptToken(result.token) : null,
      },
    });

    if (result.status === 'PENDING') {
      // Provider will settle asynchronously; poll via requeryStatus (Week 3). Held as ALLOWED.
      return 'ALLOWED';
    }

    this.events.emit(IntentEvents.Executed, {
      intentId: intentRow.id,
      accountId,
      amount,
      billerId,
      executedAt: new Date().toISOString(),
    } satisfies IntentExecutedPayload);
    await this.audit.append(accountId, 'SYSTEM', 'INTENT_EXECUTED', { intentId: intentRow.id, providerRef: result.providerRef });
    return 'EXECUTED';
  }

  /** Dispatch to the right rail by biller category / recipient. */
  private async execute(intentRow: {
    idempotencyKey: string;
    billerId: string | null;
    recipient: string | null;
    amount: number;
    meta: unknown;
  }): Promise<ProviderResult> {
    const requestId = intentRow.idempotencyKey;
    const meterNo = intentRow.recipient ?? (intentRow.meta as { meterNo?: string })?.meterNo ?? '00000000';

    if (intentRow.billerId) {
      const biller = await this.provider.resolveBiller(intentRow.billerId);
      if (biller?.category === 'ELECTRICITY') {
        return this.provider.vendElectricity(meterNo, intentRow.amount, requestId);
      }
      return this.provider.paySubscription(intentRow.billerId, meterNo, intentRow.amount, requestId);
    }
    if (intentRow.recipient) {
      return this.provider.transfer(intentRow.recipient, intentRow.amount, requestId);
    }
    return { status: 'FAILED', providerRef: `MOCK-${requestId}`, message: 'no biller or recipient on intent' };
  }

  /** Sum of EXECUTED spend for this credential in the current calendar month (UTC), in kobo. */
  private async monthlySpend(credentialId: string, now: Date): Promise<number> {
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const agg = await this.prisma.paymentIntent.aggregate({
      _sum: { amount: true },
      where: { credentialId, status: 'EXECUTED', createdAt: { gte: monthStart } },
    });
    return agg._sum.amount ?? 0;
  }

  private decisionFromRow(row: { verdict: string; reasons: unknown; evaluatedAt: Date } | null): PolicyDecision {
    if (!row) return { verdict: 'DENY', reasons: [], evaluatedAt: new Date().toISOString() };
    return {
      verdict: row.verdict as PolicyDecision['verdict'],
      reasons: (row.reasons ?? []) as PolicyReason[],
      evaluatedAt: row.evaluatedAt.toISOString(),
    };
  }

  private actor(delegateType: string): string {
    return delegateType === 'AI_AGENT' ? 'AI_AGENT' : 'DELEGATE';
  }

  private async accountIdFor(credentialId: string): Promise<string> {
    const c = await this.prisma.credential.findUniqueOrThrow({ where: { id: credentialId } });
    return c.accountId;
  }
}
