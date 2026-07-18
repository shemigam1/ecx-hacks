import { Logger, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AgentModule } from '../agent/agent.module';
import { AuthModule } from '../auth/auth.module';
import { SessionModule } from '../session/session.module';
import { VoiceController } from './voice.controller';
import { STT_PROVIDER } from './stt-provider';
import { FakeSttProvider } from './fake-stt.provider';
import { WhisperSttProvider } from './whisper-stt.provider';

/**
 * Owned by Dev B (Week 3). Africa's Talking voice adapter. STT is Whisper-compatible when STT_API_KEY
 * is set (gap #8), else the FakeSttProvider for offline/tests. TTS is AT's built-in `<Say>`.
 */
@Module({
  imports: [PrismaModule, AgentModule, AuthModule, SessionModule],
  controllers: [VoiceController],
  providers: [
    {
      provide: STT_PROVIDER,
      useFactory: () => {
        if (process.env.STT_API_KEY) return new WhisperSttProvider();
        new Logger('VoiceModule').warn('STT_API_KEY not set — using FakeSttProvider (canned transcripts).');
        return new FakeSttProvider();
      },
    },
  ],
})
export class VoiceModule {}
