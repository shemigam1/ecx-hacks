import { Controller, Post, Body, Inject } from '@nestjs/common';
import type { PaymentOrchestrator, InitiatePaymentInput } from '../contracts';

@Controller('payments')
export class PaymentTestController {
  constructor(
    @Inject('PaymentOrchestrator')
    private readonly paymentOrchestrator: PaymentOrchestrator,
  ) {}

  @Post('initiate')
  async initiate(@Body() input: InitiatePaymentInput) {
    return this.paymentOrchestrator.initiatePayment(input);
  }
}
