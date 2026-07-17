import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AgentModule } from '../agent/agent.module';
import { VoiceController } from './voice.controller';
import { STT_PROVIDER } from './stt-provider';
import { FakeSttProvider } from './fake-stt.provider';

/**
 * Owned by Dev B (Week 3). Africa's Talking voice adapter. STT is the FakeSttProvider for now —
 * swap in a Whisper-compatible adapter behind STT_PROVIDER. TTS is AT's built-in `<Say>`.
 */
@Module({
  imports: [PrismaModule, AgentModule],
  controllers: [VoiceController],
  providers: [{ provide: STT_PROVIDER, useClass: FakeSttProvider }],
})
export class VoiceModule {}
