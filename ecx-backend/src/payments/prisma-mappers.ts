/** Map Prisma rows to the shared contract types the policy engine consumes. */
import { Channel, Credential, PaymentIntent, PolicyRule } from '../contracts';

export function toContractRule(row: { ruleType: string; params: unknown }): PolicyRule {
  // params jsonb is trusted to match the union shape for its ruleType (enforced at write time).
  return { ruleType: row.ruleType, params: row.params } as PolicyRule;
}

export function toContractCredential(row: {
  id: string;
  accountId: string;
  delegateType: string;
  delegateUserId: string | null;
  label: string;
  status: string;
  policyRules?: { ruleType: string; params: unknown }[];
}): Credential {
  return {
    id: row.id,
    accountId: row.accountId,
    delegateType: row.delegateType as Credential['delegateType'],
    delegateUserId: row.delegateUserId ?? undefined,
    label: row.label,
    status: row.status as Credential['status'],
    rules: (row.policyRules ?? []).map(toContractRule),
  };
}

export function toContractIntent(row: {
  id: string;
  credentialId: string;
  channel: string;
  billerId: string | null;
  recipient: string | null;
  amount: number;
  meta: unknown;
  status: string;
  idempotencyKey: string;
}): PaymentIntent {
  return {
    id: row.id,
    credentialId: row.credentialId,
    channel: row.channel as Channel,
    billerId: row.billerId ?? undefined,
    recipient: row.recipient ?? undefined,
    amount: row.amount,
    meta: (row.meta ?? {}) as Record<string, unknown>,
    status: row.status as PaymentIntent['status'],
    idempotencyKey: row.idempotencyKey,
  };
}
