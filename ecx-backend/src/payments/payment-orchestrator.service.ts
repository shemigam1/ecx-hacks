import { Injectable, Inject } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import * as contracts from '../contracts';
import type { PaymentProvider } from './payment-provider.interface';
import type {
  PaymentIntent,
  PolicyDecision,
  Credential,
} from '@prisma/client';

@Injectable()
export class PaymentOrchestratorService implements contracts.PaymentOrchestrator {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly eventEmitter: EventEmitter2,
    @Inject('PolicyEngine') private readonly policyEngine: contracts.PolicyEngine,
    @Inject('PaymentProvider') private readonly paymentProvider: PaymentProvider,
  ) { }

  async initiatePayment(
    input: contracts.InitiatePaymentInput,
  ): Promise<{ intent: contracts.PaymentIntent; decision: contracts.PolicyDecision }> {
    // 1. Check idempotency cache first
    const existing = await this.prisma.paymentIntent.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      include: { decision: true },
    });

    if (existing) {
      const decisionContract = existing.decision
        ? this.mapDecisionToContract(existing.decision)
        : {
          verdict: (existing.status === 'EXECUTED'
            ? 'ALLOW'
            : existing.status === 'ESCALATED'
              ? 'ESCALATE'
              : 'DENY') as 'ALLOW' | 'ESCALATE' | 'DENY',
          reasons: [],
          evaluatedAt: existing.createdAt.toISOString(),
        };

      return {
        intent: this.mapIntentToContract(existing),
        decision: decisionContract,
      };
    }

    // 2. Fetch the credential and its rules
    const dbCred = await this.prisma.credential.findUnique({
      where: { id: input.credentialId },
      include: { policyRules: true },
    });

    if (!dbCred) {
      throw new Error(`Credential not found: ${input.credentialId}`);
    }

    const credentialContract = this.mapCredentialToContract(dbCred);

    // 3. Calculate monthlySpentSoFar for this credential in the current calendar month
    const now = new Date();
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const aggregate = await this.prisma.paymentIntent.aggregate({
      where: {
        credentialId: dbCred.id,
        status: 'EXECUTED',
        createdAt: {
          gte: startOfMonth,
        },
      },
      _sum: {
        amount: true,
      },
    });

    const monthlySpentSoFar = aggregate._sum.amount || 0;

    // 4. Evaluate the policy
    const evalCtx: contracts.PolicyEvalContext = {
      monthlySpentSoFar,
      now,
    };

    const tempIntent: contracts.PaymentIntent = {
      id: '',
      credentialId: input.credentialId,
      channel: input.channel,
      billerId: input.billerId || undefined,
      recipient: input.recipient || undefined,
      amount: input.amount,
      meta: input.meta || {},
      status: 'PENDING',
      idempotencyKey: input.idempotencyKey,
    };

    const decision = this.policyEngine.evaluate(
      tempIntent,
      credentialContract,
      evalCtx,
    );

    // Map decision verdict to db status
    let initialStatus: 'PENDING' | 'ALLOWED' | 'ESCALATED' | 'DENIED' = 'PENDING';
    if (decision.verdict === 'ALLOW') {
      initialStatus = 'ALLOWED';
    } else if (decision.verdict === 'ESCALATE') {
      initialStatus = 'ESCALATED';
    } else if (decision.verdict === 'DENY') {
      initialStatus = 'DENIED';
    }

    // 5. Database transaction to create the intent and decision
    const savedIntent = await this.prisma.$transaction(async (tx) => {
      const intent = await tx.paymentIntent.create({
        data: {
          credentialId: input.credentialId,
          channel: input.channel,
          billerId: input.billerId || null,
          recipient: input.recipient || null,
          amount: input.amount,
          meta: (input.meta as any) || {},
          status: initialStatus,
          idempotencyKey: input.idempotencyKey,
        },
      });

      await tx.policyDecision.create({
        data: {
          intentId: intent.id,
          verdict: decision.verdict,
          reasons: decision.reasons as any,
          evaluatedAt: new Date(decision.evaluatedAt),
        },
      });

      if (decision.verdict === 'ESCALATE') {
        // Resolve first trusted contact in the system (prototype design)
        const trustedContact = await tx.user.findFirst({
          where: { role: 'TRUSTED_CONTACT' },
        });

        if (!trustedContact) {
          throw new Error('No trusted contact configured in the system.');
        }

        await tx.cosignRequest.create({
          data: {
            intentId: intent.id,
            trustedContactId: trustedContact.id,
            status: 'PENDING',
          },
        });
      }

      return intent;
    });

    // 6. Post-transaction handlers
    if (savedIntent.status === 'ALLOWED') {
      try {
        const result = await this.paymentProvider.execute(
          input.idempotencyKey,
          input.amount,
          input.billerId,
          input.recipient,
        );

        // Update to EXECUTED and store transaction
        const executedIntent = await this.prisma.$transaction(async (tx) => {
          const updated = await tx.paymentIntent.update({
            where: { id: savedIntent.id },
            data: { status: 'EXECUTED' },
          });

          await tx.transaction.create({
            data: {
              intentId: savedIntent.id,
              providerRef: result.providerRef,
              tokenEncrypted: result.token || null,
            },
          });

          return updated;
        });

        await this.auditService.log(
          dbCred.accountId,
          'AI_AGENT',
          'payment.executed',
          {
            intentId: savedIntent.id,
            amount: input.amount,
            providerRef: result.providerRef,
          },
        );

        this.eventEmitter.emit(contracts.IntentEvents.Executed, {
          intentId: savedIntent.id,
          accountId: dbCred.accountId,
          amount: input.amount,
          billerId: input.billerId,
          executedAt: new Date().toISOString(),
        } as contracts.IntentExecutedPayload);

        return {
          intent: this.mapIntentToContract(executedIntent),
          decision,
        };
      } catch (err) {
        const failedIntent = await this.prisma.paymentIntent.update({
          where: { id: savedIntent.id },
          data: { status: 'FAILED' },
        });

        await this.auditService.log(
          dbCred.accountId,
          'AI_AGENT',
          'payment.failed',
          {
            intentId: savedIntent.id,
            amount: input.amount,
            error: err.message,
          },
        );

        return {
          intent: this.mapIntentToContract(failedIntent),
          decision,
        };
      }
    } else if (savedIntent.status === 'ESCALATED') {
      await this.auditService.log(
        dbCred.accountId,
        'AI_AGENT',
        'payment.escalated',
        {
          intentId: savedIntent.id,
          amount: input.amount,
          reasons: decision.reasons,
        },
      );

      this.eventEmitter.emit(contracts.IntentEvents.Escalated, {
        intentId: savedIntent.id,
        accountId: dbCred.accountId,
        amount: input.amount,
        reasons: decision.reasons,
      } as contracts.IntentEscalatedPayload);
    } else if (savedIntent.status === 'DENIED') {
      await this.auditService.log(
        dbCred.accountId,
        'AI_AGENT',
        'payment.denied',
        {
          intentId: savedIntent.id,
          amount: input.amount,
          reasons: decision.reasons,
        },
      );
    }

    return {
      intent: this.mapIntentToContract(savedIntent),
      decision,
    };
  }

  async resumeIntent(intentId: string): Promise<{ intent: contracts.PaymentIntent }> {
    const intent = await this.prisma.paymentIntent.findUnique({
      where: { id: intentId },
      include: {
        credential: { include: { policyRules: true } },
        decision: true,
      },
    });

    if (!intent) {
      throw new Error(`Intent not found: ${intentId}`);
    }

    if (intent.status !== 'ESCALATED') {
      throw new Error(
        `Intent is not escalated: current status is ${intent.status}`,
      );
    }

    // 1. Recheck policy (revocation & rules check)
    if (intent.credential.status === 'REVOKED') {
      await this.voidIntent(
        intentId,
        'Credential was revoked before cosign execution',
      );
      throw new Error('Credential has been revoked');
    }

    // Compute monthly spent so far again
    const now = new Date();
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const aggregate = await this.prisma.paymentIntent.aggregate({
      where: {
        credentialId: intent.credentialId,
        status: 'EXECUTED',
        createdAt: {
          gte: startOfMonth,
        },
      },
      _sum: {
        amount: true,
      },
    });

    const monthlySpentSoFar = aggregate._sum.amount || 0;
    const credentialContract = this.mapCredentialToContract(intent.credential);
    const intentContract = this.mapIntentToContract(intent);

    const decision = this.policyEngine.evaluate(intentContract, credentialContract, {
      monthlySpentSoFar,
      now,
    });

    if (decision.verdict === 'DENY') {
      const denyReason = decision.reasons.map((r) => r.code).join(', ');
      await this.voidIntent(intentId, `Policy check denied on resume: ${denyReason}`);
      throw new Error(`Policy evaluation denied resuming intent: ${denyReason}`);
    }

    // 2. Execute via provider
    try {
      const result = await this.paymentProvider.execute(
        intent.idempotencyKey,
        intent.amount,
        intent.billerId || undefined,
        intent.recipient || undefined,
      );

      const executedIntent = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.paymentIntent.update({
          where: { id: intentId },
          data: { status: 'EXECUTED' },
        });

        await tx.transaction.create({
          data: {
            intentId: intent.id,
            providerRef: result.providerRef,
            tokenEncrypted: result.token || null,
          },
        });

        await tx.cosignRequest.updateMany({
          where: { intentId, status: 'PENDING' },
          data: { status: 'APPROVED', resolvedAt: new Date() },
        });

        return updated;
      });

      await this.auditService.log(
        intent.credential.accountId,
        'SYSTEM',
        'payment.executed',
        {
          intentId: intent.id,
          amount: intent.amount,
          providerRef: result.providerRef,
          cosignApproved: true,
        },
      );

      this.eventEmitter.emit(contracts.IntentEvents.Executed, {
        intentId: intent.id,
        accountId: intent.credential.accountId,
        amount: intent.amount,
        billerId: intent.billerId || undefined,
        executedAt: new Date().toISOString(),
      } as contracts.IntentExecutedPayload);

      return { intent: this.mapIntentToContract(executedIntent) };
    } catch (err) {
      const failedIntent = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.paymentIntent.update({
          where: { id: intentId },
          data: { status: 'FAILED' },
        });

        await tx.cosignRequest.updateMany({
          where: { intentId, status: 'PENDING' },
          data: { status: 'DENIED', resolvedAt: new Date() },
        });

        return updated;
      });

      await this.auditService.log(
        intent.credential.accountId,
        'SYSTEM',
        'payment.failed',
        {
          intentId: intent.id,
          amount: intent.amount,
          error: err.message,
        },
      );

      return { intent: this.mapIntentToContract(failedIntent) };
    }
  }

  async voidIntent(intentId: string, reason: string): Promise<void> {
    const intent = await this.prisma.paymentIntent.update({
      where: { id: intentId },
      data: { status: 'VOIDED' },
      include: { credential: true },
    });

    await this.prisma.cosignRequest.updateMany({
      where: { intentId, status: 'PENDING' },
      data: { status: 'DENIED', resolvedAt: new Date() },
    });

    await this.auditService.log(
      intent.credential.accountId,
      'SYSTEM',
      'payment.voided',
      {
        intentId,
        reason,
      },
    );

    this.eventEmitter.emit(contracts.IntentEvents.Voided, {
      intentId,
      reason,
    } as contracts.IntentVoidedPayload);
  }

  @OnEvent(contracts.CosignEvents.Resolved)
  async handleCosignResolved(payload: contracts.CosignResolvedPayload) {
    if (payload.approve) {
      try {
        await this.resumeIntent(payload.intentId);
      } catch (err) {
        // Logging error is handled by log inside resumeIntent or silent catch
      }
    } else {
      await this.voidIntent(
        payload.intentId,
        `Cosign request was denied by user ${payload.byUserId}`,
      );
    }
  }

  // --- Mapper helper functions ---

  private mapIntentToContract(dbIntent: PaymentIntent): contracts.PaymentIntent {
    return {
      id: dbIntent.id,
      credentialId: dbIntent.credentialId,
      channel: dbIntent.channel as contracts.Channel,
      billerId: dbIntent.billerId || undefined,
      recipient: dbIntent.recipient || undefined,
      amount: dbIntent.amount,
      meta: (dbIntent.meta as Record<string, unknown>) || {},
      status: dbIntent.status as any,
      idempotencyKey: dbIntent.idempotencyKey,
    };
  }

  private mapDecisionToContract(
    dbDecision: PolicyDecision | null,
  ): contracts.PolicyDecision {
    if (!dbDecision) {
      return {
        verdict: 'ALLOW',
        reasons: [],
        evaluatedAt: new Date().toISOString(),
      };
    }

    return {
      verdict: dbDecision.verdict as any,
      reasons: (dbDecision.reasons as any) || [],
      evaluatedAt: dbDecision.evaluatedAt.toISOString(),
    };
  }

  private mapCredentialToContract(
    dbCred: Credential & { policyRules: any[] },
  ): contracts.Credential {
    return {
      id: dbCred.id,
      accountId: dbCred.accountId,
      delegateType: dbCred.delegateType as any,
      delegateUserId: dbCred.delegateUserId || undefined,
      label: dbCred.label,
      status: dbCred.status as any,
      rules: dbCred.policyRules.map((r) => ({
        ruleType: r.ruleType,
        params: r.params,
      })) as contracts.PolicyRule[],
    };
  }
}
