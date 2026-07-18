import { Controller, Get, Param, Query } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Read model for the web Activity page: `GET /accounts/:id/audit`. Append-only audit, newest first. */
@Controller('accounts')
export class AccountsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':id/audit')
  async audit(@Param('id') id: string, @Query('limit') limit?: string) {
    const take = Math.min(Number(limit) || 100, 500);
    const rows = await this.prisma.auditEvent.findMany({
      where: { accountId: id },
      orderBy: { createdAt: 'desc' },
      take,
    });
    return rows.map((r) => ({
      id: r.id,
      eventType: EVENT_ALIAS[r.eventType] ?? r.eventType,
      actorType: r.actor,
      createdAt: r.createdAt.toISOString(),
      payload: r.payload,
    }));
  }
}

/**
 * Align the backend's `payment.*` audit vocabulary with the web Activity page's `intent.*` vocabulary
 * (gap #17) so it renders plain-language lines. Unmapped types (failed, revoked, lockout) pass through.
 */
const EVENT_ALIAS: Record<string, string> = {
  'payment.executed': 'intent.executed',
  'payment.denied': 'intent.denied',
  'payment.escalated': 'intent.escalated',
  'payment.voided': 'intent.voided',
};
