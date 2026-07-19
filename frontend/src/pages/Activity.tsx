import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { getPrincipal } from '../lib/authStore';
import { explainReason } from '../lib/reasonText';

export interface AuditRow {
    id?: string;
    eventType: string;
    actorType?: string;
    createdAt: string;
    payload?: Record<string, unknown>;
}

/** P1 audit trail. Backend: GET /accounts/:id/audit (Dev A — pending). */
export function Activity() {
    const principal = getPrincipal();

    const audit = useQuery({
        queryKey: ['audit', principal?.accountId],
        queryFn: () => api.get<AuditRow[]>(`/accounts/${principal!.accountId}/audit`),
        enabled: !!principal?.accountId,
    });

    const notBuilt = audit.isError && (audit.error as ApiError).status === 404;

    return (
        <section aria-labelledby="activity-heading">
            <h1 id="activity-heading" className="mb-2 text-3xl font-bold">Activity</h1>
            <p className="mb-6">Everything that happened on this account, in plain language.</p>

            {audit.isPending && <p role="status">Loading…</p>}
            {notBuilt && (
                <p role="status" className="rounded bg-amber-100 p-4 text-amber-900">
                    The activity feed isn’t connected yet — the backend audit endpoint is still being built.
                    This page will fill in automatically once it ships.
                </p>
            )}
            {audit.isError && !notBuilt && (
                <p role="alert" className="rounded bg-red-100 p-3 text-red-900">
                    {(audit.error as ApiError).message}
                </p>
            )}

            <ol className="flex flex-col gap-2">
                {audit.data?.map((row, i) => (
                    <li key={row.id ?? i} className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
                        <p className="font-medium">{describe(row)}</p>
                        <p className="text-sm text-gray-600">
                            {new Date(row.createdAt).toLocaleString('en-NG')}
                            {row.actorType ? ` · by ${row.actorType.toLowerCase().replace('_', ' ')}` : ''}
                        </p>
                    </li>
                ))}
                {audit.data?.length === 0 && <li>No activity yet.</li>}
            </ol>
        </section>
    );
}

/** Plain-speech line per audit event type. Falls back to the raw type. */
export function describe(row: AuditRow): string {
    const reason = typeof row.payload?.reason === 'string' ? row.payload.reason : undefined;
    switch (row.eventType) {
        case 'intent.created': return 'A payment was requested.';
        case 'intent.allowed': return 'A payment was checked and allowed.';
        case 'intent.escalated': return 'A payment was held for a trusted contact to approve.';
        case 'intent.denied': return `A payment was blocked${reason ? ` — ${explainReason(reason)}` : ''}.`;
        case 'intent.executed': return 'A payment went through successfully.';
        case 'intent.voided': return 'A held payment was cancelled.';
        case 'cosign.resolved': return 'A trusted contact resolved a held payment.';
        case 'suspicious.flagged': return 'The agent flagged something suspicious.';
        default: return row.eventType;
    }
}