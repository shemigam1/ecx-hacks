import { Module } from '@nestjs/common';
import { MockPaymentProvider } from './mock-payment-provider.service';
import { PaymentOrchestratorService } from './payment-orchestrator.service';
import { PrismaModule } from '../prisma/prisma.module';
import { PolicyModule } from '../policy/policy.module';
import { AuditModule } from '../audit/audit.module';
import { PaymentTestController } from './payment-test.controller';

@Module({
  imports: [PrismaModule, PolicyModule, AuditModule],
  controllers: [PaymentTestController],
  providers: [
    {
      provide: 'PaymentProvider',
      useClass: MockPaymentProvider,
    },
    MockPaymentProvider,
    {
      provide: 'PaymentOrchestrator',
      useClass: PaymentOrchestratorService,
    },
    PaymentOrchestratorService,
  ],
  exports: [
    'PaymentProvider',
    MockPaymentProvider,
    'PaymentOrchestrator',
    PaymentOrchestratorService,
  ],
})
export class PaymentsModule {}

