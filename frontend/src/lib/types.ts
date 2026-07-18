/**
 * Hand-mirrored from ecx-backend/src/contracts (per FRONTEND_IMPLEMENTATION_PLAN §Phase 0).
 * Money is ALWAYS integer kobo. Format to naira only at the edges.
 */

export type Kobo = number;
export type Channel = 'VOICE' | 'WHATSAPP' | 'WEB';
export type Verdict = 'ALLOW' | 'ESCALATE' | 'DENY';

export type PolicyReasonCode =
    | 'RECIPIENT_NOT_ALLOWLISTED'
    | 'BILLER_NOT_ALLOWLISTED'
    | 'MONTHLY_CAP_EXCEEDED'
    | 'PER_TX_CAP_EXCEEDED'
    | 'AMOUNT_ABOVE_COSIGN_THRESHOLD'
    | 'CHANNEL_SCOPE_EXCEEDED'
    | 'OUTSIDE_TIME_WINDOW'
    | 'CREDENTIAL_REVOKED'
    | 'RECIPIENT_LOCK_MISMATCH';

export interface PolicyReason {
    code: PolicyReasonCode;
    detail?: string;
}

export type IntentStatus =
    | 'PENDING' | 'ALLOWED' | 'ESCALATED' | 'DENIED' | 'EXECUTED' | 'FAILED' | 'VOIDED';

// ---- WS payloads (contracts/events.ts) --------------------------------------

export interface DemoDecisionPayload {
    scenario: string;
    intentId: string;
    verdict: string;
    status: string;
    reasons: string[];
    amount: Kobo;
    billerName?: string;
}

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

export interface CosignResolvedPayload {
    intentId: string;
    approve: boolean;
    byUserId: string;
}

// ---- REST shapes (as-built controllers) -------------------------------------

export interface AuthPrincipal {
    userId: string;
    accountId: string;
    role: string;
}

export interface OtpRequestResult { sent: true; devCode?: string }
export interface OtpVerifyResult { token: string; principal: AuthPrincipal }

/** Row shape from CosignService.listPending() */
export interface CosignPendingRow {
    intentId: string;
    trustedContactId: string;
    createdAt: string;
    accountId: string;
    amount: Kobo;
    billerLabel?: string;
    recipient?: string;
    reasons: string[];
}

export interface ScenarioInfo { name: string; description: string; expected: string }
export type ScenarioResult = DemoDecisionPayload & { expected: string };

// ---- formatting -------------------------------------------------------------

export function formatNaira(k: Kobo): string {
    return `₦${(k / 100).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}