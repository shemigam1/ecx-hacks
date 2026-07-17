import { Body, Controller, Header, Inject, Post } from '@nestjs/common';
import { AgentService } from '../agent/agent.service';
import type { AgentReply, AgentSessionContext } from '../agent/agent.service';
import { PrismaService } from '../prisma/prisma.service';
import { STT_PROVIDER } from './stt-provider';
import type { SttProvider } from './stt-provider';
import { getDigits, hangup, record, response, say, speakDigits } from './at-response';

/** Fields Africa's Talking POSTs to voice webhooks (form-encoded). */
interface AtWebhookBody {
  sessionId?: string;
  isActive?: string;
  callerNumber?: string;
  destinationNumber?: string;
  direction?: string;
  dtmfDigits?: string;
  recordingUrl?: string;
  durationInSeconds?: string;
}

interface VoiceSession {
  ctx: AgentSessionContext;
  pinAttempts: number;
  verified: boolean;
  lastToken?: string;
}

const DEMO_PIN = process.env.VOICE_DEMO_PIN ?? '0000'; // TODO: AuthModule owns real argon2 DTMF PIN + lockout
const MAX_PIN_ATTEMPTS = 3;
const XML = 'application/xml';

/**
 * Africa's Talking voice adapter (Week 3, Dev B). Turn-based webhook state machine:
 * incoming → DTMF PIN → record intent → STT → AgentService → DTMF confirm → token read-back.
 * PIN & confirmation are DTMF (D1); STT is only for the spoken intent. TTS is AT's built-in `<Say>`
 * for the first cut (swap to `<Play>` + YarnGPT/Spitch for local-language later).
 */
@Controller('voice')
export class VoiceController {
  private readonly sessions = new Map<string, VoiceSession>();

  constructor(
    private readonly agent: AgentService,
    @Inject(STT_PROVIDER) private readonly stt: SttProvider,
    private readonly prisma: PrismaService,
  ) {}

  @Post('incoming')
  @Header('Content-Type', XML)
  async incoming(@Body() body: AtWebhookBody): Promise<string> {
    const sessionId = body.sessionId ?? `sess_${Date.now()}`;
    const ctx = await this.resolveContext(sessionId, body.callerNumber);
    this.sessions.set(sessionId, { ctx, pinAttempts: 0, verified: false });

    return response(
      getDigits({ path: '/voice/pin', finishOnKey: '#', timeout: 30 }, say('Welcome to Steward. Please enter your PIN, then press hash.')),
    );
  }

  @Post('pin')
  @Header('Content-Type', XML)
  async pin(@Body() body: AtWebhookBody): Promise<string> {
    const session = this.session(body.sessionId);
    if (!session) return response(say('Sorry, your session expired. Please call again.'), hangup());

    if ((body.dtmfDigits ?? '') === DEMO_PIN) {
      session.verified = true;
      session.ctx.reauthOk = true;
      return response(
        record({ path: '/voice/intent', maxLength: 15 }, say('Thank you. After the beep, tell me what you want to do. For example, buy me light.')),
      );
    }

    session.pinAttempts += 1;
    if (session.pinAttempts >= MAX_PIN_ATTEMPTS) {
      // TODO(AuthModule): notify trusted contact on lockout.
      return response(say('That PIN was not correct three times. For your safety, I am ending the call.'), hangup());
    }
    return response(
      getDigits({ path: '/voice/pin' }, say('That PIN was not correct. Please enter your PIN, then press hash.')),
    );
  }

  @Post('intent')
  @Header('Content-Type', XML)
  async intent(@Body() body: AtWebhookBody): Promise<string> {
    const session = this.session(body.sessionId);
    if (!session || !session.verified) return response(say('Sorry, please call again and enter your PIN.'), hangup());

    const transcript = body.recordingUrl ? await this.stt.transcribe(body.recordingUrl) : '';
    if (!transcript.trim()) {
      return response(record({ path: '/voice/intent', maxLength: 15 }, say('I did not catch that. Please say it again after the beep.')));
    }
    const reply = await this.agent.handleMessage(session.ctx, transcript);
    return this.respondToAgentReply(session, reply);
  }

  @Post('confirm')
  @Header('Content-Type', XML)
  async confirm(@Body() body: AtWebhookBody): Promise<string> {
    const session = this.session(body.sessionId);
    if (!session || !session.verified) return response(say('Sorry, please call again.'), hangup());

    const text = body.dtmfDigits === '1' ? 'Yes, confirm it.' : 'No, cancel that.';
    const reply = await this.agent.handleMessage(session.ctx, text);
    return this.respondToAgentReply(session, reply);
  }

  @Post('repeat')
  @Header('Content-Type', XML)
  async repeat(@Body() body: AtWebhookBody): Promise<string> {
    const session = this.session(body.sessionId);
    if (body.dtmfDigits === '1' && session?.lastToken) {
      return this.tokenReadBack(session, 'Here is your token again.', session.lastToken);
    }
    return response(say('Thank you for using Steward. Goodbye.'), hangup());
  }

  // ---- routing --------------------------------------------------------------------------------

  private respondToAgentReply(session: VoiceSession, reply: AgentReply): string {
    const outcome = paymentOutcome(reply);

    if (outcome?.status === 'EXECUTED' && outcome.token) {
      session.lastToken = outcome.token;
      return this.tokenReadBack(session, reply.reply, outcome.token);
    }
    if (outcome?.verdict === 'ESCALATE') {
      return response(
        say(reply.reply || 'That payment needs your trusted contact to approve it. I will ask them and call you back. Goodbye.'),
        hangup(),
      );
    }
    if (outcome?.verdict === 'DENY') {
      return response(record({ path: '/voice/intent', maxLength: 15 }, say(`${reply.reply} You can try something else after the beep.`)));
    }
    // No payment executed yet — the agent is asking to confirm.
    return response(
      getDigits({ path: '/voice/confirm', numDigits: 1 }, say(`${reply.reply} Press 1 to confirm, or 2 to cancel.`)),
    );
  }

  private tokenReadBack(_session: VoiceSession, spokenReply: string, token: string): string {
    const spoken = speakDigits(token);
    return response(
      say(spokenReply),
      say(`Your electricity token is. ${spoken}.`),
      say(`Once more. ${spoken}.`),
      getDigits({ path: '/voice/repeat', numDigits: 1 }, say('Press 1 to hear the token again, or hang up. Thank you.')),
    );
  }

  // ---- helpers --------------------------------------------------------------------------------

  private session(sessionId?: string): VoiceSession | undefined {
    return sessionId ? this.sessions.get(sessionId) : undefined;
  }

  private async resolveContext(sessionId: string, callerNumber?: string): Promise<AgentSessionContext> {
    const user = callerNumber ? await this.prisma.user.findFirst({ where: { phoneMsisdn: callerNumber } }) : null;
    const account = user ? await this.prisma.account.findFirst({ where: { ownerUserId: user.id } }) : null;
    const cred = account
      ? await this.prisma.credential.findFirst({ where: { accountId: account.id, delegateType: 'AI_AGENT', status: 'ACTIVE' } })
      : null;
    return {
      sessionId,
      userId: user?.id ?? 'user_owner',
      accountId: account?.id ?? 'acct_demo',
      credentialId: cred?.id ?? 'cred_demo',
      channel: 'VOICE',
      reauthOk: false,
    };
  }
}

/** Extract the most recent initiate_payment outcome from the agent's tool trace. */
function paymentOutcome(reply: AgentReply): { verdict?: string; status?: string; token?: string } | null {
  const entry = [...reply.toolTrace].reverse().find((t) => t.name === 'initiate_payment');
  if (!entry) return null;
  const r = entry.result as { verdict?: string; status?: string; token?: string };
  return { verdict: r.verdict, status: r.status, token: r.token };
}
