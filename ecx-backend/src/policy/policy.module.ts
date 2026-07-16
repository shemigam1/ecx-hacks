import { Module } from '@nestjs/common';
import { PolicyService } from './policy.service';

/** Owned by Dev A. The deterministic core; consumed by the PaymentOrchestrator (Week 1). */
@Module({
  providers: [PolicyService],
  exports: [PolicyService],
})
export class PolicyModule {}
