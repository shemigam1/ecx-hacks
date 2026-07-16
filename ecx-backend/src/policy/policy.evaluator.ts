/**
 * The deterministic policy evaluator — THE PRODUCT BOUNDARY.
 * Pure, synchronous, zero AI, zero I/O. Everything it needs beyond the intent/credential is handed
 * in via PolicyEvalContext. Unit-tested to death in policy.evaluator.spec.ts.
 *
 * Verdict precedence: DENY > ESCALATE > ALLOW. Any deny-level reason forces DENY even if an
 * escalate-level reason is also present.
 */
import {
  Credential,
  PaymentIntent,
  PolicyDecision,
  PolicyEvalContext,
  PolicyReason,
  PolicyReasonCode,
  Verdict,
} from '../contracts';

/** The only reason code that escalates rather than denies. Everything else is a hard block. */
const ESCALATE_CODES: ReadonlySet<PolicyReasonCode> = new Set(['AMOUNT_ABOVE_COSIGN_THRESHOLD']);

export function evaluate(intent: PaymentIntent, credential: Credential, ctx: PolicyEvalContext): PolicyDecision {
  const reasons: PolicyReason[] = [];

  // Revocation is always checked first and at evaluation time — never cached.
  if (credential.status === 'REVOKED') {
    reasons.push({ code: 'CREDENTIAL_REVOKED' });
  }

  for (const rule of credential.rules) {
    switch (rule.ruleType) {
      case 'SPEND_CAP_PER_TX':
        if (intent.amount > rule.params.limit) {
          reasons.push({ code: 'PER_TX_CAP_EXCEEDED', detail: `${intent.amount} > ${rule.params.limit}` });
        }
        break;

      case 'SPEND_CAP_MONTHLY':
        if (ctx.monthlySpentSoFar + intent.amount > rule.params.limit) {
          reasons.push({
            code: 'MONTHLY_CAP_EXCEEDED',
            detail: `${ctx.monthlySpentSoFar}+${intent.amount} > ${rule.params.limit}`,
          });
        }
        break;

      case 'BILLER_ALLOWLIST':
        // Only applies to biller payments; transfers (no billerId) are governed by RECIPIENT_LOCK.
        if (intent.billerId !== undefined && !rule.params.billerIds.includes(intent.billerId)) {
          reasons.push({ code: 'BILLER_NOT_ALLOWLISTED', detail: intent.billerId });
        }
        break;

      case 'RECIPIENT_LOCK':
        if (intent.recipient !== undefined && !rule.params.recipients.includes(intent.recipient)) {
          reasons.push({ code: 'RECIPIENT_LOCK_MISMATCH', detail: intent.recipient });
        }
        break;

      case 'CHANNEL_SCOPE':
        if (!rule.params.channels.includes(intent.channel)) {
          reasons.push({ code: 'CHANNEL_SCOPE_EXCEEDED', detail: intent.channel });
        }
        break;

      case 'TIME_WINDOW': {
        const hour = hourInTz(ctx.now, rule.params.tz);
        if (!withinWindow(hour, rule.params.startHour, rule.params.endHour)) {
          reasons.push({
            code: 'OUTSIDE_TIME_WINDOW',
            detail: `hour ${hour} outside [${rule.params.startHour},${rule.params.endHour})`,
          });
        }
        break;
      }

      case 'COSIGN_THRESHOLD':
        // Strictly above the threshold escalates; exactly at the threshold is allowed.
        if (intent.amount > rule.params.threshold) {
          reasons.push({ code: 'AMOUNT_ABOVE_COSIGN_THRESHOLD', detail: `${intent.amount} > ${rule.params.threshold}` });
        }
        break;
    }
  }

  return { verdict: verdictFrom(reasons), reasons, evaluatedAt: ctx.now.toISOString() };
}

function verdictFrom(reasons: PolicyReason[]): Verdict {
  if (reasons.some((r) => !ESCALATE_CODES.has(r.code))) return 'DENY';
  if (reasons.some((r) => ESCALATE_CODES.has(r.code))) return 'ESCALATE';
  return 'ALLOW';
}

/** Hour (0–23) of `now` in the given IANA timezone. Falls back to UTC hour on an invalid tz. */
function hourInTz(now: Date, tz: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).formatToParts(now);
    const h = parts.find((p) => p.type === 'hour')?.value;
    if (h !== undefined) return parseInt(h, 10) % 24;
  } catch {
    /* invalid timezone — fall through to UTC */
  }
  return now.getUTCHours();
}

/** [start, end) with support for overnight windows (start > end wraps past midnight). */
function withinWindow(hour: number, start: number, end: number): boolean {
  if (start === end) return true; // full day
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end; // overnight wrap, e.g. [22, 6)
}
