import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { AccountsController } from './accounts.controller';
import { CredentialsController } from './credentials.controller';

/** Web read models: account audit trail + credential policy view/revoke (for the Activity & Policy pages). */
@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [AccountsController, CredentialsController],
})
export class AccountsModule {}
