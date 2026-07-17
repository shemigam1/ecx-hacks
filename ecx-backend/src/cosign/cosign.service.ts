import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CosignEvents } from '../contracts';
import type { CosignResolvedPayload } from '../contracts';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Cosign (F4). Listing + resolution. Resolution just emits `cosign.resolved`; the PaymentOrchestrator
 * already listens (`@OnEvent`) and runs resumeIntent / voidIntent (which re-checks revocation and
 * updates the cosign row). This keeps the held-intent state machine owned by the orchestrator.
 */
@Injectable()
export class CosignService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  async listPending() {
    const rows = await this.prisma.cosignRequest.findMany({
      where: { status: 'PENDING' },
      include: { intent: { include: { biller: true, credential: true, decision: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({
      intentId: r.intentId,
      trustedContactId: r.trustedContactId,
      createdAt: r.createdAt.toISOString(),
      accountId: r.intent.credential.accountId,
      amount: r.intent.amount,
      billerLabel: r.intent.biller?.name,
      recipient: r.intent.recipient ?? undefined,
      reasons: (r.intent.decision?.reasons as { code: string }[] | undefined)?.map((x) => x.code) ?? [],
    }));
  }

  async resolve(intentId: string, approve: boolean, byUserId: string) {
    const req = await this.prisma.cosignRequest.findUnique({ where: { intentId } });
    if (!req) throw new NotFoundException(`no cosign request for intent ${intentId}`);
    if (req.status !== 'PENDING') throw new BadRequestException(`cosign already resolved: ${req.status}`);

    // Fire-and-forget to the orchestrator's @OnEvent handler; the resulting intent.executed /
    // intent.voided is broadcast over WS by the WebGateway.
    this.events.emit(CosignEvents.Resolved, { intentId, approve, byUserId } satisfies CosignResolvedPayload);
    return { intentId, approve, status: 'PROCESSING' };
  }
}
