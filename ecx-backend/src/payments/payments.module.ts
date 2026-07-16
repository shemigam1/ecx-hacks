import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { PolicyModule } from '../policy/policy.module';
import { IntentsController } from './intents.controller';
import { MockProvider } from './mock.provider';
import { PAYMENT_PROVIDER } from './payment-provider';
import { PaymentOrchestratorService } from './payment-orchestrator.service';

/**
 * Owned by Dev A. Wires the deterministic spine together and exposes it via `POST /api/intents`.
 * PAYMENT_PROVIDER is bound to MockProvider now; swap `useClass` for the real provider later (D8).
 */
@Module({
  imports: [PolicyModule, AuditModule, AuthModule],
  controllers: [IntentsController],
  providers: [PaymentOrchestratorService, { provide: PAYMENT_PROVIDER, useClass: MockProvider }],
  exports: [PaymentOrchestratorService],
})
export class PaymentsModule {}
