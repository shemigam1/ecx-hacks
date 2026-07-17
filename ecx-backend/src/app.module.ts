import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PolicyModule } from './policy/policy.module';
import { PrismaModule } from './prisma/prisma.module';
import { PaymentsModule } from './payments/payments.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AuditModule } from './audit/audit.module';
import { AnomalyModule } from './anomaly/anomaly.module';
import { AgentModule } from './agent/agent.module';
import { ChannelsModule } from './channels/channels.module';
import { CosignModule } from './cosign/cosign.module';
import { VoiceModule } from './voice/voice.module';

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    PrismaModule,
    PolicyModule,
    PaymentsModule,
    AuditModule,
    AnomalyModule,
    AgentModule,
    ChannelsModule,
    CosignModule,
    VoiceModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}



