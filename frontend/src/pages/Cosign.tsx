import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { getPrincipal } from '../lib/authStore';
import { useSocketEvent, useSubscription } from '../lib/socket';
import { explainReason } from '../lib/reasonText';
import { ReasonLine } from '../components/VerdictBadge';
import {
    formatNaira,
    type CosignPendingRow,
    type CosignResolvedPayload,
    type IntentEscalatedPayload,
} from '../lib/types';

/**
 * P0 trusted-contact surface (F4). Pending via GET /cosign/pending; live adds on `intent.escalated`;
 * resolve via POST /cosign/:intentId/resolve (returns PROCESSING — final state arrives over WS).
 */
export function Cosign() {
    const qc = useQueryClient();
    const principal = getPrincipal();
    useSubscription({ accountId: principal?.accountId, demo: true });

    const pending = useQuery({
        queryKey: ['cosign', 'pending'],
        queryFn: () => api.get<CosignPendingRow[]>('/cosign/pending'),
    });

    const invalidate = () => qc.invalidateQueries({ queryKey: ['cosign', 'pending'] });
    useSocketEvent<IntentEscalatedPayload>('intent.escalated', invalidate);
    useSocketEvent<CosignResolvedPayload>('cosign.resolved', invalidate);

    const resolve = useMutation({
        mutationFn: ({ intentId, approve }: { intentId: string; approve: boolean }) =>
            api.post(`/cosign/${intentId}/resolve`, { approve, byUserId: principal?.userId ?? 'unknown' }),
        onSettled: invalidate,
    });

    return (
        <section aria-labelledby="cosign-heading">
            <h1 id="cosign-heading" className="mb-1 text-3xl font-bold">Approval requests</h1>
            <p className="mb-6 max-w-3xl text-gray-700">
                Payments the policy engine held for a trusted contact. Approving releases the payment; denying
                voids it. Either way, the owner is told in plain speech.
            </p>

            {pending.isPending && <p role="status">Loading…</p>}
            {pending.isError && (
                <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-red-900">
                    Couldn’t load pending approvals: {(pending.error as ApiError).message}
                </p>
            )}
            {resolve.isError && (
                <p role="alert" className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-red-900">
                    {(resolve.error as ApiError).message}
                </p>
            )}

            <ul aria-live="polite" aria-label="Pending approvals" className="flex flex-col gap-4">
                {pending.data?.length === 0 && (
                    <li className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-gray-600">
                        Nothing waiting. New requests appear here instantly.
                    </li>
                )}
                {pending.data?.map((row) => (
                    <li key={row.intentId} className="rounded-xl border border-gray-200 border-l-4 border-l-orange-500 p-4">
                        <p className="text-sm text-gray-500">
                            Requested {new Date(row.createdAt).toLocaleTimeString('en-NG', { hour12: false })} · intent{' '}
                            <span className="font-mono">{row.intentId}</span>
                        </p>
                        <p className="mt-1 flex flex-wrap items-center gap-3">
                            <span className="text-2xl font-bold">{formatNaira(row.amount)}</span>
                            {(row.billerLabel || row.recipient) && (
                                <span className="text-lg text-gray-700">→ {row.billerLabel ?? row.recipient}</span>
                            )}
                        </p>
                        {row.reasons.map((r) => <ReasonLine key={r} code={r} text={explainReason(r)} />)}
                        <div className="mt-4 flex gap-3">
                            <button
                                type="button"
                                onClick={() => resolve.mutate({ intentId: row.intentId, approve: true })}
                                disabled={resolve.isPending}
                                className="rounded-lg bg-green-700 px-5 py-2.5 font-bold text-white hover:bg-green-800 disabled:opacity-50"
                            >
                                Approve {formatNaira(row.amount)}
                            </button>
                            <button
                                type="button"
                                onClick={() => resolve.mutate({ intentId: row.intentId, approve: false })}
                                disabled={resolve.isPending}
                                className="rounded-lg border border-red-600 px-5 py-2.5 font-bold text-red-700 hover:bg-red-50 disabled:opacity-50"
                            >
                                Deny
                            </button>
                        </div>
                    </li>
                ))}
            </ul>
        </section>
    );
}