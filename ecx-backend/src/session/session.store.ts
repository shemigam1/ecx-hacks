import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const TTL_MS = 30 * 60_000; // 30 min

/**
 * Durable conversation state (gap #10) — replaces the in-memory Maps in AgentService/VoiceController.
 * Uses the external sessionId (AT call id or web session id) as the `conversation_sessions.id`, so
 * state survives restarts and works across instances. Expired rows are treated as absent.
 * `userId` is required (FK) — callers pass the resolved owner/delegate id.
 */
@Injectable()
export class SessionStore {
  private readonly logger = new Logger(SessionStore.name);

  constructor(private readonly prisma: PrismaService) {}

  async load<T = unknown>(sessionId: string): Promise<T | null> {
    const row = await this.prisma.conversationSession.findUnique({ where: { id: sessionId } });
    if (!row || row.expiresAt.getTime() < Date.now()) return null;
    return row.state as T;
  }

  async save(sessionId: string, userId: string, channel: string, state: unknown): Promise<void> {
    const expiresAt = new Date(Date.now() + TTL_MS);
    try {
      await this.prisma.conversationSession.upsert({
        where: { id: sessionId },
        update: { state: state as object, expiresAt },
        create: { id: sessionId, userId, channel: channel as never, state: state as object, expiresAt },
      });
    } catch (err) {
      // Don't let a persistence hiccup 500 a live call; the turn still completes in memory.
      this.logger.warn(`session save failed for ${sessionId}: ${(err as Error).message}`);
    }
  }

  async delete(sessionId: string): Promise<void> {
    await this.prisma.conversationSession.deleteMany({ where: { id: sessionId } });
  }
}
