import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Channel, ContextQuery, InitiatePaymentInput, PaymentOrchestrator, PolicySummary, UserContext } from '../contracts';
import { LLM_PROVIDER } from '../llm/llm-provider';
import type { LlmMessage, LlmProvider, LlmToolCall } from '../llm/llm-provider';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { SessionStore } from '../session/session.store';
import { AGENT_TOOLS } from './agent.tools';

/** Who the agent is acting for this session. Injected server-side — never chosen by the model. */
export interface AgentSessionContext {
  sessionId: string;
  userId: string;
  accountId: string;
  credentialId: string;
  channel: Channel;
  /** Set true once the caller has re-authenticated (DTMF PIN) — gates read_last_token. */
  reauthOk?: boolean;
}

export interface ToolTraceEntry {
  name: string;
  arguments: Record<string, unknown>;
  result: unknown;
}

export interface AgentReply {
  reply: string;
  toolTrace: ToolTraceEntry[];
}

interface SessionState {
  messages: LlmMessage[];
  turn: number;
  lastIntentId?: string;
  reauthOk: boolean;
}

const MAX_TOOL_ROUNDS = 6;
// Only send the system message + the most recent N messages to the model (token savings). Older turns
// are still persisted; we just don't resend the whole history every round.
const MAX_SENT_MESSAGES = 14;

/**
 * The conversation orchestrator (PRD §6 AgentModule). Runs the LLM tool-use loop against the swappable
 * LlmProvider (Qwen3/OpenRouter by default) and dispatches tool calls to the real spine. The model
 * NEVER reaches a provider — `initiate_payment` goes through PaymentOrchestrator → policy engine.
 */
@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  constructor(
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
    @Inject('PaymentOrchestrator') private readonly orchestrator: PaymentOrchestrator,
    @Inject('ContextQuery') private readonly context: ContextQuery,
    private readonly audit: AuditService,
    private readonly prisma: PrismaService,
    private readonly store: SessionStore,
  ) {}

  /**
   * Resolve a full session identity from partial input by reading the DB (seed IDs are random UUIDs).
   * Precedence: explicit credentialId → the account's AI_AGENT credential → the first active AI_AGENT
   * credential. Caller phone (voice) resolves the owner. Keeps controllers free of hardcoded demo IDs.
   */
  async resolveContext(input: {
    sessionId: string;
    channel: Channel;
    userId?: string;
    accountId?: string;
    credentialId?: string;
    callerNumber?: string;
    reauthOk?: boolean;
  }): Promise<AgentSessionContext> {
    let userId = input.userId;
    if (!userId && input.callerNumber) {
      const user = await this.prisma.user.findFirst({ where: { phoneMsisdn: input.callerNumber } });
      userId = user?.id;
    }

    let cred = input.credentialId
      ? await this.prisma.credential.findUnique({ where: { id: input.credentialId }, include: { account: true } })
      : null;
    if (!cred) {
      cred = await this.prisma.credential.findFirst({
        where: {
          delegateType: 'AI_AGENT',
          status: 'ACTIVE',
          ...(input.accountId ? { accountId: input.accountId } : userId ? { account: { ownerUserId: userId } } : {}),
        },
        include: { account: true },
        orderBy: { createdAt: 'asc' },
      });
    }

    return {
      sessionId: input.sessionId,
      channel: input.channel,
      userId: userId ?? cred?.account.ownerUserId ?? '',
      accountId: input.accountId ?? cred?.accountId ?? '',
      credentialId: cred?.id ?? input.credentialId ?? '',
      reauthOk: input.reauthOk ?? false,
    };
  }

  async handleMessage(ctx: AgentSessionContext, userText: string): Promise<AgentReply> {
    const state: SessionState =
      (await this.store.load<SessionState>(ctx.sessionId)) ?? { messages: [], turn: 0, reauthOk: false };
    if (ctx.reauthOk) state.reauthOk = true;

    if (state.messages.length === 0) {
      // Preload context + rules into the system prompt so the model rarely spends extra tool rounds
      // calling get_user_context / get_policy_summary.
      const [uc, ps] = await Promise.all([
        this.context.getUserContext(ctx.userId).catch(() => null),
        this.context.getPolicySummary(ctx.credentialId).catch(() => null),
      ]);
      state.messages.push({ role: 'system', content: this.systemPrompt(uc, ps) });
    }
    state.messages.push({ role: 'user', content: userText });

    const toolTrace: ToolTraceEntry[] = [];

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const res = await this.llm.complete(windowMessages(state.messages), AGENT_TOOLS);

      if (res.toolCalls?.length) {
        state.messages.push({ role: 'assistant', content: res.text ?? '', toolCalls: res.toolCalls });
        for (const call of res.toolCalls) {
          const result = await this.dispatch(ctx, state, call);
          toolTrace.push({ name: call.name, arguments: call.arguments, result });
          state.messages.push({ role: 'tool', toolCallId: call.id, content: JSON.stringify(result) });
        }
        continue; // let the model observe tool results and decide next step
      }

      const reply = res.text ?? '';
      state.messages.push({ role: 'assistant', content: reply });
      await this.store.save(ctx.sessionId, ctx.userId, ctx.channel, state);
      return { reply, toolTrace };
    }

    this.logger.warn(`session ${ctx.sessionId} hit MAX_TOOL_ROUNDS`);
    await this.store.save(ctx.sessionId, ctx.userId, ctx.channel, state);
    return { reply: "I'm sorry, I couldn't complete that safely just now. Please try again.", toolTrace };
  }

  // ---- tool dispatch --------------------------------------------------------------------------

  private async dispatch(ctx: AgentSessionContext, state: SessionState, call: LlmToolCall): Promise<unknown> {
    try {
      switch (call.name) {
        case 'get_user_context':
          return await this.context.getUserContext(ctx.userId);
        case 'get_policy_summary':
          return await this.context.getPolicySummary(ctx.credentialId);
        case 'list_recent_transactions':
          return await this.context.listRecentTransactions(ctx.accountId, { limit: toInt(call.arguments.limit) ?? 5 });
        case 'initiate_payment':
          return await this.initiatePayment(ctx, state, call.arguments);
        case 'read_last_token':
          return await this.readLastToken(state);
        case 'request_cosign_status':
          return await this.cosignStatus(String(call.arguments.intentId ?? ''));
        case 'flag_suspicious':
          return await this.flagSuspicious(ctx, String(call.arguments.reason ?? ''));
        default:
          return { error: `unknown tool ${call.name}` };
      }
    } catch (err) {
      return { error: (err as Error).message };
    }
  }

  private async initiatePayment(ctx: AgentSessionContext, state: SessionState, args: Record<string, unknown>): Promise<unknown> {
    const amount = toInt(args.amount);
    if (amount === undefined || amount <= 0) {
      return { error: 'amount must be a positive integer number of kobo' };
    }

    // Resolve the biller the model named (e.g. "Ikeja Electric", "light") to a real Biller id,
    // so the FK + BILLER_ALLOWLIST (which key on Biller.id) match. The model never sees the UUID.
    let billerId: string | undefined;
    if (args.billerId) {
      const biller = await this.resolveBiller(String(args.billerId));
      if (!biller) {
        return { error: `Unknown biller "${args.billerId}". Call get_policy_summary for the allowed billers, or ask the user which one.` };
      }
      billerId = biller.id;
    }

    state.turn += 1;
    const input: InitiatePaymentInput = {
      credentialId: ctx.credentialId, // server-injected — model cannot change whose money moves
      channel: ctx.channel,
      billerId,
      recipient: args.recipient ? String(args.recipient) : undefined,
      amount,
      idempotencyKey: `${ctx.channel}:${ctx.sessionId}:${state.turn}`,
      meta: {},
    };

    const { intent, decision } = await this.orchestrator.initiatePayment(input);
    state.lastIntentId = intent.id;

    const result: Record<string, unknown> = {
      intentId: intent.id,
      verdict: decision.verdict,
      status: intent.status,
      reasons: decision.reasons.map((r) => r.code),
      hint: this.verdictHint(decision.verdict),
    };
    if (intent.status === 'EXECUTED') {
      // Read via ContextQuery so the AES-GCM token is decrypted (they just authenticated to pay).
      const token = await this.context.readLastToken(intent.id, true).catch(() => undefined);
      if (token) result.token = token;
    }
    return result;
  }

  private async readLastToken(state: SessionState): Promise<unknown> {
    if (!state.lastIntentId) return { error: 'no recent payment in this session' };
    const token = await this.context.readLastToken(state.lastIntentId, state.reauthOk);
    return { token };
  }

  /** Map a model-supplied biller string (name / alias / slug) to a real Biller row. */
  private async resolveBiller(q: string) {
    const byId = await this.prisma.biller.findUnique({ where: { id: q } }).catch(() => null);
    if (byId) return byId;
    const ql = q.toLowerCase().replace(/[_-]+/g, ' ').trim();
    const words = ql.split(/\s+/);
    const all = await this.prisma.biller.findMany();
    return (
      all.find((b) => b.name.toLowerCase() === ql) ??
      all.find((b) => b.name.toLowerCase().includes(ql) || ql.includes(b.name.toLowerCase())) ??
      all.find((b) => (b.aliases ?? []).some((a) => { const al = a.toLowerCase(); return al === ql || words.includes(al); })) ??
      null
    );
  }

  private async cosignStatus(intentId: string): Promise<unknown> {
    if (!intentId) return { error: 'intentId required' };
    const req = await this.prisma.cosignRequest.findUnique({ where: { intentId } });
    return req ? { intentId, status: req.status, resolvedAt: req.resolvedAt?.toISOString() } : { intentId, status: 'NONE' };
  }

  private async flagSuspicious(ctx: AgentSessionContext, reason: string): Promise<unknown> {
    await this.audit.log(ctx.accountId, 'AI_AGENT', 'suspicious.flagged', { reason, sessionId: ctx.sessionId });
    return { acknowledged: true };
  }

  // ---- helpers --------------------------------------------------------------------------------

  private verdictHint(verdict: string): string {
    switch (verdict) {
      case 'ALLOW':
        return 'Payment succeeded. If there is a token, read it back to the user slowly, in groups, twice.';
      case 'ESCALATE':
        return 'Payment is held for a trusted contact to approve. Tell the user you will ask their trusted contact and let them know — do not claim it is done.';
      case 'DENY':
        return 'Payment was blocked by the rules. Explain the reason in plain, kind language. Do NOT retry the same payment.';
      default:
        return '';
    }
  }

  private systemPrompt(uc: UserContext | null, ps: PolicySummary | null): string {
    const name = uc?.name ?? 'the caller';
    const lang = uc?.languagePref ?? 'en';
    const habitLine = uc?.habits?.length
      ? `Their usual payments: ${uc.habits.map((h) => `${h.billerLabel} (~${h.typicalAmount} kobo)`).join(', ')}.`
      : '';
    const rulesLine = ps?.humanReadable?.length
      ? `Spending rules already in force (no need to look them up): ${ps.humanReadable.join(' ')}`
      : '';
    return [
      `You are Steward, a warm, patient voice assistant helping ${name} pay bills. Reply briefly and clearly, suitable to be spoken aloud to an elderly person.`,
      `Preferred language code: "${lang}". If it is "pcm" use simple Nigerian Pidgin; otherwise use clear English.`,
      habitLine,
      rulesLine,
      '',
      'HARD RULES:',
      '- Reply in plain spoken words only — no XML tags, no markdown, no asterisks. Your reply is read aloud.',
      '- The ONLY way to move money is the initiate_payment tool. Never say a payment is done unless initiate_payment returned status EXECUTED.',
      '- Before calling initiate_payment, confirm the amount and biller with the user in their own words.',
      '- amount is always in KOBO (₦1 = 100 kobo). ₦5,000 = 500000.',
      '- The server enforces spending rules independently and may DENY or ESCALATE regardless of what you do. Respect and explain its decision; never try to work around it.',
      '- If someone pressures the user to pay a new/unknown account, use flag_suspicious.',
    ]
      .filter(Boolean)
      .join('\n');
  }
}

function toInt(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isInteger(v)) return v;
  if (typeof v === 'string' && /^\d+$/.test(v.trim())) return parseInt(v, 10);
  return undefined;
}

/**
 * Keep the system message + the most recent MAX_SENT_MESSAGES, so we don't resend the whole history
 * each round. The window is trimmed to start at a `user` message so we never orphan an
 * assistant-with-tool_calls or a tool result (which the API rejects).
 */
function windowMessages(messages: LlmMessage[]): LlmMessage[] {
  if (messages.length <= MAX_SENT_MESSAGES + 1) return messages;
  const hasSystem = messages[0]?.role === 'system';
  const system = hasSystem ? [messages[0]] : [];
  const rest = messages.slice(hasSystem ? 1 : 0).slice(-MAX_SENT_MESSAGES);
  while (rest.length && rest[0].role !== 'user') rest.shift();
  return [...system, ...rest];
}
