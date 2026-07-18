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
 * socket.io gateway (D6). Bridges the domain event bus to WS clients. Per-account rooms (gap #11):
 * a regular client `subscribe`s with its accountId and receives ONLY its account's payment events; the
 * `/demo/console` (judge screen) joins the `demo` room and receives everything.
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
  onSubscribe(@ConnectedSocket() client: Socket, @MessageBody() body: { accountId?: string; demo?: boolean }) {
    if (body?.accountId) client.join(`account:${body.accountId}`);
    if (body?.demo) client.join('demo'); // opt-in firehose for the judge console
    return { subscribed: true, accountId: body?.accountId, demo: !!body?.demo };
  }

  @SubscribeMessage('ping')
  onPing(@ConnectedSocket() client: Socket) {
    client.emit('pong', { ts: Date.now() });
  }

  // Payment events carry accountId → scoped to that account's room (+ the demo console).
  @OnEvent(IntentEvents.Escalated)
  onEscalated(p: IntentEscalatedPayload) {
    this.emitScoped(p.accountId, IntentEvents.Escalated, p);
  }

  @OnEvent(IntentEvents.Executed)
  onExecuted(p: IntentExecutedPayload) {
    this.emitScoped(p.accountId, IntentEvents.Executed, p);
  }

  // These payloads carry no accountId (just ids) → demo console only, no cross-account leak.
  @OnEvent(IntentEvents.Voided)
  onVoided(p: IntentVoidedPayload) {
    this.server.to('demo').emit(IntentEvents.Voided, p);
  }

  @OnEvent(CosignEvents.Resolved)
  onCosignResolved(p: CosignResolvedPayload) {
    this.server.to('demo').emit(CosignEvents.Resolved, p);
  }

  @OnEvent(DemoEvents.Decision)
  onDemoDecision(p: DemoDecisionPayload) {
    this.server.to('demo').emit(DemoEvents.Decision, p);
  }

  /** Emit to the owning account's room AND the demo console room. */
  private emitScoped(accountId: string, event: string, payload: unknown) {
    this.server.to(`account:${accountId}`).emit(event, payload);
    this.server.to('demo').emit(event, payload);
  }
}
