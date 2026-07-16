import { Controller, Post, Body, Inject, Get, Param } from '@nestjs/common';
import type { PaymentOrchestrator } from '../contracts';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';

@Controller('payments')
export class PaymentTestController {
  constructor(
    @Inject('PaymentOrchestrator')
    private readonly paymentOrchestrator: PaymentOrchestrator,
  ) {}

  @Post('initiate')
  async initiate(@Body() input: InitiatePaymentDto) {
    return this.paymentOrchestrator.initiatePayment(input);
  }

  @Get(':id')
  async getStatus(@Param('id') id: string) {
    return this.paymentOrchestrator.requeryIntent(id);
  }
}
