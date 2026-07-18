import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DemoEvents } from '../contracts';
import type { Channel, DemoDecisionPayload, InitiatePaymentInput, PaymentOrchestrator } from '../contracts';
import { PrismaService } from '../prisma/prisma.service';

interface ScenarioSpec {
  description: string;
  expected: string; // the intended verdict when policy conditions are met
  billerName?: string;
  recipient?: string;
  amount: number; // kobo
  channel?: string;
}

/**
 * Canned demo scenarios fired at the REAL orchestrator/policy (never bypassing it), so the console
 * lights up deterministically without depending on live-model reliability. Verdicts reflect the seeded
 * agent policy: per-tx ≤ ₦10,000, cosign > ₦5,000, billers [Ikeja/DSTV/MTN], channels [VOICE,WHATSAPP],
 * time window 6am–10pm WAT. NB: ALLOW/ESCALATE also require being inside the time window (see gap #3).
 */
const SCENARIOS: Record<string, ScenarioSpec> = {
  F1_allow: { description: 'F1: buy ₦5,000 Ikeja Electric (within mandate)', expected: 'ALLOW', billerName: 'Ikeja Electric', recipient: '45700123456', amount: 500_000, channel: 'VOICE' },
  F4_escalate: { description: 'F4: ₦7,000 payment — above cosign threshold, needs approval', expected: 'ESCALATE', billerName: 'Ikeja Electric', recipient: '45700123456', amount: 700_000, channel: 'VOICE' },
  F3_injection: { description: 'F3: hijacked agent tries ₦200,000 transfer to a new account', expected: 'DENY', recipient: '0123456789', amount: 20_000_000, channel: 'VOICE' },
  channel_scope: { description: 'DENY: agent used on a channel outside its scope (WEB)', expected: 'DENY', billerName: 'Ikeja Electric', recipient: '45700123456', amount: 500_000, channel: 'WEB' },
};

@Injectable()
export class DemoService {
  constructor(
    @Inject('PaymentOrchestrator') private readonly orchestrator: PaymentOrchestrator,
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  list() {
    return Object.entries(SCENARIOS).map(([name, s]) => ({ name, description: s.description, expected: s.expected }));
  }

  async run(name: string, overrides: Partial<ScenarioSpec> = {}) {
    const base = SCENARIOS[name];
    if (!base) throw new BadRequestException(`unknown scenario "${name}". Try one of: ${Object.keys(SCENARIOS).join(', ')}`);
    const spec = { ...base, ...stripUndefined(overrides) };

    const cred = await this.prisma.credential.findFirst({
      where: { delegateType: 'AI_AGENT', status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
    });
    if (!cred) throw new NotFoundException('no active AI_AGENT credential — run the seed first');

    let billerId: string | undefined;
    let billerName: string | undefined;
    if (spec.billerName) {
      const biller = await this.prisma.biller.findFirst({ where: { name: { equals: spec.billerName, mode: 'insensitive' } } });
      if (!biller) throw new BadRequestException(`biller "${spec.billerName}" not seeded`);
      billerId = biller.id;
      billerName = biller.name;
    }

    const input: InitiatePaymentInput = {
      credentialId: cred.id,
      channel: (spec.channel ?? 'VOICE') as Channel,
      billerId,
      recipient: spec.recipient,
      amount: spec.amount,
      idempotencyKey: `DEMO:${name}:${Date.now()}`,
      meta: { scenario: name },
    };

    const { intent, decision } = await this.orchestrator.initiatePayment(input);
    const reasons = decision.reasons.map((r) => r.code);

    const payload: DemoDecisionPayload = {
      scenario: name,
      intentId: intent.id,
      verdict: decision.verdict,
      status: intent.status,
      reasons,
      amount: spec.amount,
      billerName,
    };
    // Broadcast every scene (incl. DENY) so the console live-stream shows it. WebGateway bridges to WS.
    this.events.emit(DemoEvents.Decision, payload);

    return { ...payload, expected: base.expected };
  }
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}
