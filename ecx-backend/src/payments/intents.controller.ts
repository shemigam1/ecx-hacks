import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import type { InitiatePaymentInput } from '../contracts';
import { DevAuthGuard } from '../auth/dev-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentOrchestratorService } from './payment-orchestrator.service';
import { toContractIntent } from './prisma-mappers';

/**
 * The Week-1 exit gate: `POST /api/intents` runs an intent through the real spine and returns
 * ALLOW / ESCALATE / DENY + reasons. Guarded by the dev-stub auth guard (Seam 4).
 */
@Controller('intents')
@UseGuards(DevAuthGuard)
export class IntentsController {
  constructor(
    private readonly orchestrator: PaymentOrchestratorService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  async create(@Body() body: InitiatePaymentInput) {
    if (!body?.credentialId || !body?.channel || typeof body?.amount !== 'number' || !body?.idempotencyKey) {
      throw new BadRequestException('credentialId, channel, amount (integer kobo), and idempotencyKey are required');
    }
    if (!Number.isInteger(body.amount) || body.amount <= 0) {
      throw new BadRequestException('amount must be a positive integer number of kobo');
    }
    return this.orchestrator.initiatePayment(body);
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const row = await this.prisma.paymentIntent.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(`intent ${id} not found`);
    return toContractIntent(row);
  }
}
