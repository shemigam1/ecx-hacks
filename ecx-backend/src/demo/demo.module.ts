import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PaymentsModule } from '../payments/payments.module';
import { DemoController } from './demo.controller';
import { DemoService } from './demo.service';

/**
 * Owned by Dev B. Fires canned demo scenes at the spine's PaymentOrchestrator ('PaymentOrchestrator'
 * token from PaymentsModule). EventEmitter2 is global; WebGateway bridges `demo.decision` to WS.
 */
@Module({
  imports: [PrismaModule, PaymentsModule],
  controllers: [DemoController],
  providers: [DemoService],
})
export class DemoModule {}
