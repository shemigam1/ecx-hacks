import { Module } from '@nestjs/common';
import { PolicyService } from './policy.service';

@Module({
  providers: [
    {
      provide: 'PolicyEngine', // Bind using the token or register the class directly.
      useClass: PolicyService,
    },
    PolicyService, // Also register PolicyService directly for concrete injection
  ],
  exports: ['PolicyEngine', PolicyService],
})
export class PolicyModule {}
