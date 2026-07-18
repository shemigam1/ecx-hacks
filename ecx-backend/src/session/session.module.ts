import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SessionStore } from './session.store';

/** Durable conversation-session store (gap #10). Shared by AgentModule and VoiceModule. */
@Module({
  imports: [PrismaModule],
  providers: [SessionStore],
  exports: [SessionStore],
})
export class SessionModule {}
