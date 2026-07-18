import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
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
import { DemoModule } from './demo/demo.module';
import { AuthModule } from './auth/auth.module';
import { AccountsModule } from './accounts/accounts.module';

// Single-origin prod serving (gap #18): serve the built SPA when it exists. In dev the frontend runs
// on Vite (proxying the API), so frontend/dist is absent and this is a no-op. Override with FRONTEND_DIST.
const FRONTEND_DIST = process.env.FRONTEND_DIST ?? join(process.cwd(), '..', 'frontend', 'dist');
const spaImports = existsSync(join(FRONTEND_DIST, 'index.html'))
  ? [ServeStaticModule.forRoot({ rootPath: FRONTEND_DIST })]
  : [];

@Module({
  imports: [
    ...spaImports,
    EventEmitterModule.forRoot(),
    AuthModule,
    PrismaModule,
    PolicyModule,
    PaymentsModule,
    AuditModule,
    AnomalyModule,
    AgentModule,
    ChannelsModule,
    CosignModule,
    VoiceModule,
    DemoModule,
    AccountsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}



