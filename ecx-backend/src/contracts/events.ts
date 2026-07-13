/**
 * Seam 3 (BACKEND_WORKPLAN.md §3) — the event bus that decouples Cosign & Anomaly from the spine.
 * Backed by @nestjs/event-emitter (EventEmitter2). Emitters and consumers only depend on these names
 * and payloads, never on each other's classes.
 */
import { Kobo } from './primitives';
import { PolicyReason } from './policy';

export const IntentEvents = {
  /** A emits when policy verdict is ESCALATE. B (Cosign) consumes → creates CosignRequest + WS push. */
  Escalated: 'intent.escalated',
  /** A emits after provider success. A (Anomaly) + B (notify) consume. */
  Executed: 'intent.executed',
  /** A emits on cosign deny / TTL expiry. B (notify owner in plain speech) consumes. */
  Voided: 'intent.voided',
  /** A emits on every append to the audit log. A (Anomaly) consumes for baselines. */
  AuditAppended: 'audit.appended',
} as const;

export const CosignEvents = {
  /** B emits when the trusted contact resolves. A consumes → resumeIntent / voidIntent. */
  Resolved: 'cosign.resolved',
} as const;

export interface IntentEscalatedPayload {
  intentId: string;
  accountId: string;
  amount: Kobo;
  reasons: PolicyReason[];
}

export interface IntentExecutedPayload {
  intentId: string;
  accountId: string;
  amount: Kobo;
  billerId?: string;
  executedAt: string;
}

export interface IntentVoidedPayload {
  intentId: string;
  reason: string;
}

export interface AuditAppendedPayload {
  accountId: string;
  eventType: string;
  payload: Record<string, unknown>;
}

export interface CosignResolvedPayload {
  intentId: string;
  approve: boolean;
  byUserId: string;
}
