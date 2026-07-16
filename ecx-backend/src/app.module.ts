import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { PolicyModule } from './policy/policy.module';
import { PaymentsModule } from './payments/payments.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { AgentModule } from './agent/agent.module';
import { ChannelsModule } from './channels/channels.module';
import { CosignModule } from './cosign/cosign.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(), // Seam 3 event bus (intent.*, cosign.*, audit.*)
    PrismaModule,
    PolicyModule,
    AuditModule,
    PaymentsModule,
    AuthModule,
    AgentModule,
    ChannelsModule,
    CosignModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
