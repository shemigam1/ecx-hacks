import { Module } from '@nestjs/common';
import { AnomalyService } from './anomaly.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [AnomalyService],
  exports: [AnomalyService],
})
export class AnomalyModule {}
