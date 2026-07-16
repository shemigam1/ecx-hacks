import { OnEvent } from '@nestjs/event-emitter';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { CosignEvents, IntentEvents } from '../contracts';
import type { IntentEscalatedPayload } from '../contracts';

/**
 * socket.io gateway (D6). Week 0: connection lifecycle + a `ping`→`pong` health check, and a bridge
 * that pushes `intent.escalated` to connected trusted contacts. Week 2: CosignModule drives the real
 * cosign push/ack; the demo console subscribes to the live event stream here.
 */
@WebSocketGateway({ cors: { origin: '*' } })
export class WebGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;

  handleConnection(client: Socket) {
    client.emit('connected', { ok: true, id: client.id });
  }

  handleDisconnect(_client: Socket) {}

  @SubscribeMessage('ping')
  handlePing(@MessageBody() body: unknown, @ConnectedSocket() client: Socket) {
    client.emit('pong', { ts: Date.now(), echo: body ?? null });
  }

  /** Bridge domain event → WS so the trusted-contact UI and demo console see escalations live. */
  @OnEvent(IntentEvents.Escalated)
  onEscalated(payload: IntentEscalatedPayload) {
    this.server.emit(IntentEvents.Escalated, payload);
  }

  /** Placeholder for cosign resolution broadcast (Week 2 wires CosignModule to emit this). */
  @OnEvent(CosignEvents.Resolved)
  onCosignResolved(payload: unknown) {
    this.server.emit(CosignEvents.Resolved, payload);
  }
}
