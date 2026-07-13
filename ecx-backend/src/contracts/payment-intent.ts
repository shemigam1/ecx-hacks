/**
 * The PaymentIntent — the object the LLM produces via `initiate_payment` and the ONLY way money moves.
 * It must pass the policy engine before the provider is ever touched.
 */
import { Channel, Kobo } from './primitives';

export type IntentStatus =
  | 'PENDING' // created, not yet evaluated
  | 'ALLOWED' // policy passed, awaiting/undergoing execution
  | 'ESCALATED' // held pending cosign
  | 'DENIED' // blocked by policy
  | 'EXECUTED' // provider vended/paid successfully
  | 'FAILED' // provider error
  | 'VOIDED'; // cosign denied or TTL expired

export interface PaymentIntent {
  id: string;
  credentialId: string;
  channel: Channel;
  billerId?: string;
  recipient?: string; // account/meter number for transfers
  amount: Kobo;
  meta: Record<string, unknown>;
  status: IntentStatus;
  idempotencyKey: string; // D7: `${channel}:${sessionId}:${turnId}`
}

/** Input to PaymentOrchestrator.initiatePayment — everything needed to mint an intent. */
export interface InitiatePaymentInput {
  credentialId: string;
  channel: Channel;
  billerId?: string;
  recipient?: string;
  amount: Kobo;
  idempotencyKey: string;
  meta?: Record<string, unknown>;
}
