import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { CosignService } from './cosign.service';
import { CosignController } from './cosign.controller';

/** Owned by Dev B (F4). AuthModule provides JwtAuthGuard; PrismaModule provides PrismaService. */
@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [CosignController],
  providers: [CosignService],
  exports: [CosignService],
})
export class CosignModule {}
