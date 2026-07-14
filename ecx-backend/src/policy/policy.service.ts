import { Injectable } from '@nestjs/common';
import {
  PolicyEngine,
  PaymentIntent,
  Credential,
  PolicyEvalContext,
  PolicyDecision,
  PolicyReason,
  PolicyReasonCode,
  Verdict,
} from '../contracts';

@Injectable()
export class PolicyService implements PolicyEngine {
  evaluate(
    intent: PaymentIntent,
    credential: Credential,
    ctx: PolicyEvalContext,
  ): PolicyDecision {
    const reasons: PolicyReason[] = [];

    // 1. Check if credential is revoked
    if (credential.status === 'REVOKED') {
      reasons.push({ code: 'CREDENTIAL_REVOKED' });
    }

    // 2. Evaluate each rule in the credential
    for (const rule of credential.rules) {
      switch (rule.ruleType) {
        case 'SPEND_CAP_MONTHLY': {
          const limit = rule.params.limit;
          if (ctx.monthlySpentSoFar + intent.amount > limit) {
            reasons.push({
              code: 'MONTHLY_CAP_EXCEEDED',
              detail: `Monthly limit of ${limit} exceeded. Spent: ${ctx.monthlySpentSoFar}, Request: ${intent.amount}`,
            });
          }
          break;
        }

        case 'SPEND_CAP_PER_TX': {
          const limit = rule.params.limit;
          if (intent.amount > limit) {
            reasons.push({
              code: 'PER_TX_CAP_EXCEEDED',
              detail: `Transaction limit of ${limit} exceeded. Request: ${intent.amount}`,
            });
          }
          break;
        }

        case 'BILLER_ALLOWLIST': {
          const billerIds = rule.params.billerIds;
          if (intent.billerId && !billerIds.includes(intent.billerId)) {
            reasons.push({
              code: 'BILLER_NOT_ALLOWLISTED',
              detail: `Biller ${intent.billerId} is not in the allowlist`,
            });
          }
          break;
        }

        case 'RECIPIENT_LOCK': {
          const recipients = rule.params.recipients;
          if (intent.recipient && !recipients.includes(intent.recipient)) {
            reasons.push({
              code: 'RECIPIENT_LOCK_MISMATCH',
              detail: `Recipient ${intent.recipient} does not match locked recipients`,
            });
            reasons.push({
              code: 'RECIPIENT_NOT_ALLOWLISTED',
              detail: `Recipient ${intent.recipient} is not allowlisted`,
            });
          }
          break;
        }

        case 'COSIGN_THRESHOLD': {
          const threshold = rule.params.threshold;
          if (intent.amount > threshold) {
            reasons.push({
              code: 'AMOUNT_ABOVE_COSIGN_THRESHOLD',
              detail: `Transaction amount ${intent.amount} is above the cosign threshold of ${threshold}`,
            });
          }
          break;
        }

        case 'CHANNEL_SCOPE': {
          const channels = rule.params.channels;
          if (!channels.includes(intent.channel)) {
            reasons.push({
              code: 'CHANNEL_SCOPE_EXCEEDED',
              detail: `Channel ${intent.channel} is not allowed for this credential`,
            });
          }
          break;
        }

        case 'TIME_WINDOW': {
          const { startHour, endHour, tz } = rule.params;
          try {
            const formatter = new Intl.DateTimeFormat('en-US', {
              timeZone: tz,
              hour: 'numeric',
              hourCycle: 'h23',
            });
            const currentHour = parseInt(formatter.format(ctx.now), 10);

            let isWithinWindow = false;
            if (startHour === endHour) {
              isWithinWindow = true;
            } else if (startHour < endHour) {
              isWithinWindow = currentHour >= startHour && currentHour < endHour;
            } else {
              // Wraps around midnight (e.g., 22:00 to 06:00)
              isWithinWindow = currentHour >= startHour || currentHour < endHour;
            }

            if (!isWithinWindow) {
              reasons.push({
                code: 'OUTSIDE_TIME_WINDOW',
                detail: `Outside allowed time window: ${startHour}:00 to ${endHour}:00 (Timezone: ${tz}). Current hour: ${currentHour}`,
              });
            }
          } catch (e) {
            // In case of invalid timezone or formatting issues, default to blocking for safety
            reasons.push({
              code: 'OUTSIDE_TIME_WINDOW',
              detail: `Time evaluation error: ${e.message}`,
            });
          }
          break;
        }
      }
    }

    // Determine the verdict based on precedence: DENY > ESCALATE > ALLOW
    let verdict: Verdict = 'ALLOW';

    const hasDeny = reasons.some((reason) => this.isDenyCode(reason.code));
    const hasEscalate = reasons.some(
      (reason) => reason.code === 'AMOUNT_ABOVE_COSIGN_THRESHOLD',
    );

    if (hasDeny) {
      verdict = 'DENY';
    } else if (hasEscalate) {
      verdict = 'ESCALATE';
    }

    return {
      verdict,
      reasons,
      evaluatedAt: ctx.now.toISOString(),
    };
  }

  private isDenyCode(code: PolicyReasonCode): boolean {
    return (
      code === 'CREDENTIAL_REVOKED' ||
      code === 'MONTHLY_CAP_EXCEEDED' ||
      code === 'PER_TX_CAP_EXCEEDED' ||
      code === 'BILLER_NOT_ALLOWLISTED' ||
      code === 'RECIPIENT_LOCK_MISMATCH' ||
      code === 'RECIPIENT_NOT_ALLOWLISTED' ||
      code === 'CHANNEL_SCOPE_EXCEEDED' ||
      code === 'OUTSIDE_TIME_WINDOW'
    );
  }
}
