import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { IntentEvents, AuditAppendedPayload } from '../contracts';
import { AuditEvent } from '@prisma/client';

@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Appends an audit event to the database and emits 'audit.appended' event.
   * There are no updates or deletion methods to keep the log strictly append-only.
   */
  async log(
    accountId: string,
    actor: string,
    eventType: string,
    payload: Record<string, any>,
  ): Promise<AuditEvent> {
    const event = await this.prisma.auditEvent.create({
      data: {
        accountId,
        actor,
        eventType,
        payload,
      },
    });

    const eventPayload: AuditAppendedPayload = {
      accountId,
      eventType,
      payload,
    };

    this.eventEmitter.emit(IntentEvents.AuditAppended, eventPayload);

    return event;
  }
}
