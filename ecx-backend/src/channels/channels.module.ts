import { Module } from '@nestjs/common';
import { WebGateway } from './web.gateway';

/**
 * Owned by Dev B. Week 0: socket.io WebGateway (health + escalation bridge).
 * Week 1+: VoiceAdapter (Africa's Talking), WhatsAppAdapter (or mock), REST WebAdapter.
 * Each adapter normalizes its input into a ConversationEvent for the AgentModule.
 */
@Module({
  providers: [WebGateway],
  exports: [WebGateway],
})
export class ChannelsModule {}
