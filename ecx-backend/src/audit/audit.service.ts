import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuditAppendedPayload, IntentEvents } from '../contracts';
import { PrismaService } from '../prisma/prisma.service';

/** Append-only audit log (no delete path). Emits `audit.appended` for the AnomalyModule (Week 2). */
@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  async append(accountId: string, actor: string, eventType: string, payload: Record<string, unknown>): Promise<void> {
    await this.prisma.auditEvent.create({
      data: { accountId, actor, eventType, payload: payload as object },
    });
    this.events.emit(IntentEvents.AuditAppended, { accountId, eventType, payload } satisfies AuditAppendedPayload);
  }
}
