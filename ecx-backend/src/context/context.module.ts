import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ContextQueryService } from './context-query.service';

/**
 * Read models for the agent's tools (Seam 2). PrismaService is global. Minimal Dev-B version; may be
 * expanded/owned by Dev A later (habits, richer summaries).
 */
@Module({
  imports: [PrismaModule],
  providers: [ContextQueryService],
  exports: [ContextQueryService],
})
export class ContextModule {}
