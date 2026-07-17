import { Body, Controller, Post } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Channel } from '../contracts';
import { AgentService, AgentSessionContext } from './agent.service';

interface AgentMessageDto {
  sessionId?: string;
  userId?: string;
  accountId?: string;
  credentialId?: string;
  channel?: Channel;
  reauthOk?: boolean;
  text: string;
}

/**
 * Text-first agent entrypoint (Week 2). `POST /agent/message`.
 * Identity fields default to the demo seed; wire to the auth Principal when AuthModule lands.
 */
@Controller('agent')
export class AgentController {
  constructor(private readonly agent: AgentService) {}

  @Post('message')
  async message(@Body() body: AgentMessageDto) {
    const ctx: AgentSessionContext = {
      sessionId: body.sessionId ?? randomUUID(),
      userId: body.userId ?? 'user_owner',
      accountId: body.accountId ?? 'acct_demo',
      credentialId: body.credentialId ?? 'cred_demo',
      channel: body.channel ?? 'WEB',
      reauthOk: body.reauthOk ?? false,
    };
    const out = await this.agent.handleMessage(ctx, body.text ?? '');
    return { sessionId: ctx.sessionId, ...out };
  }
}
