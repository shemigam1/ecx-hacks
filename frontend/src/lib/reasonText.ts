import type { PolicyReasonCode } from './types';

/**
 * PolicyReasonCode → plain speech (WORKPLAN §4). The UI formats, it doesn't decide —
 * these sentences match the agent's phrasing, not re-derived rules.
 */
export const reasonToText: Record<PolicyReasonCode, string> = {
    RECIPIENT_NOT_ALLOWLISTED: 'This recipient is not on the approved list.',
    BILLER_NOT_ALLOWLISTED: 'This biller is not on the approved list.',
    MONTHLY_CAP_EXCEEDED: 'This would go over the monthly spending limit.',
    PER_TX_CAP_EXCEEDED: 'This amount is above the per-payment limit.',
    AMOUNT_ABOVE_COSIGN_THRESHOLD: 'This amount needs a trusted contact to approve it first.',
    CHANNEL_SCOPE_EXCEEDED: 'The agent is not allowed to pay from this channel.',
    OUTSIDE_TIME_WINDOW: 'Payments are only allowed during the daytime window.',
    CREDENTIAL_REVOKED: 'This agent’s access has been revoked.',
    RECIPIENT_LOCK_MISMATCH: 'Payments are locked to specific recipients, and this isn’t one of them.',
};

export function explainReason(code: string): string {
    return reasonToText[code as PolicyReasonCode] ?? code;
}