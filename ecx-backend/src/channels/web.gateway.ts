import { OnEvent } from '@nestjs/event-emitter';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { CosignEvents, DemoEvents, IntentEvents } from '../contracts';
import type {
  CosignResolvedPayload,
  DemoDecisionPayload,
  IntentEscalatedPayload,
  IntentExecutedPayload,
  IntentVoidedPayload,
} from '../contracts';

/**
 * socket.io gateway (D6). Bridges the domain event bus to WS clients so the trusted-contact `/cosign`
 * view and the `/demo/console` see intents/decisions/cosign live. Firehose for the prototype; clients
 * can `subscribe` to an account room for future per-account filtering.
 */
@WebSocketGateway({ cors: { origin: '*' } })
export class WebGateway implements OnGatewayConnection {
  @WebSocketServer() server!: Server;

  handleConnection(client: Socket) {
    // WS handshake auth (gap #7): client connects with io(url, { auth: { token } }) or ?k=.
    const key = process.env.INTERNAL_API_KEY ?? 'dev-steward-key';
    const provided = client.handshake.auth?.token ?? client.handshake.query?.k;
    if (provided !== key) {
      client.emit('unauthorized', { message: 'invalid or missing key' });
      client.disconnect(true);
      return;
    }
    client.emit('connected', { ok: true, id: client.id });
  }

  @SubscribeMessage('subscribe')
  onSubscribe(@ConnectedSocket() client: Socket, @MessageBody() body: { accountId?: string }) {
    if (body?.accountId) client.join(`account:${body.accountId}`);
    client.join('demo');
    return { subscribed: true };
  }

  @SubscribeMessage('ping')
  onPing(@ConnectedSocket() client: Socket) {
    client.emit('pong', { ts: Date.now() });
  }

  @OnEvent(IntentEvents.Escalated)
  onEscalated(p: IntentEscalatedPayload) {
    this.server.emit(IntentEvents.Escalated, p);
  }

  @OnEvent(IntentEvents.Executed)
  onExecuted(p: IntentExecutedPayload) {
    this.server.emit(IntentEvents.Executed, p);
  }

  @OnEvent(IntentEvents.Voided)
  onVoided(p: IntentVoidedPayload) {
    this.server.emit(IntentEvents.Voided, p);
  }

  @OnEvent(CosignEvents.Resolved)
  onCosignResolved(p: CosignResolvedPayload) {
    this.server.emit(CosignEvents.Resolved, p);
  }

  /** Demo scene driver: broadcast every scenario's verdict (incl. DENY) to the console. */
  @OnEvent(DemoEvents.Decision)
  onDemoDecision(p: DemoDecisionPayload) {
    this.server.emit(DemoEvents.Decision, p);
  }
}
