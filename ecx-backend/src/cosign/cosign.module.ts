import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CosignService } from './cosign.service';
import { CosignController } from './cosign.controller';

/** Owned by Dev B (F4). EventEmitter2 is global; PrismaModule provides PrismaService. */
@Module({
  imports: [PrismaModule],
  controllers: [CosignController],
  providers: [CosignService],
  exports: [CosignService],
})
export class CosignModule {}
