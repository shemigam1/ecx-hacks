import { Module } from '@nestjs/common';
import { WebGateway } from './web.gateway';

/**
 * Owned by Dev B. Week 2: socket.io WebGateway (bridges the event bus to the frontend).
 * Week 3+: VoiceAdapter (Africa's Talking), WhatsAppAdapter.
 */
@Module({
  providers: [WebGateway],
  exports: [WebGateway],
})
export class ChannelsModule {}
