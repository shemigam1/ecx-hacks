import { Module } from '@nestjs/common';
import { MockPaymentProvider } from './mock-payment-provider.service';

@Module({
  providers: [
    {
      provide: 'PaymentProvider',
      useClass: MockPaymentProvider,
    },
    MockPaymentProvider,
  ],
  exports: ['PaymentProvider', MockPaymentProvider],
})
export class PaymentsModule {}
