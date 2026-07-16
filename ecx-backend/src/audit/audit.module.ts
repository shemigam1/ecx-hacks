import { Module } from '@nestjs/common';
import { AuditService } from './audit.service';

/** Owned by Dev A. PrismaService is global; EventEmitter2 comes from EventEmitterModule.forRoot(). */
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
