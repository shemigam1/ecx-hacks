import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { formatNaira, type Channel, type Kobo } from '../lib/types';

/** Mirror of contracts PolicyRule (discriminated union). */
type PolicyRule =
    | { ruleType: 'SPEND_CAP_MONTHLY'; params: { limit: Kobo } }
    | { ruleType: 'SPEND_CAP_PER_TX'; params: { limit: Kobo } }
    | { ruleType: 'BILLER_ALLOWLIST'; params: { billerIds: string[] } }
    | { ruleType: 'RECIPIENT_LOCK'; params: { recipients: string[] } }
    | { ruleType: 'COSIGN_THRESHOLD'; params: { threshold: Kobo } }
    | { ruleType: 'CHANNEL_SCOPE'; params: { channels: Channel[] } }
    | { ruleType: 'TIME_WINDOW'; params: { startHour: number; endHour: number; tz: string } };

interface PolicySummary {
    credentialId: string;
    label?: string;
    status?: 'ACTIVE' | 'REVOKED';
    rules: PolicyRule[];
}

/** P1 rules view + one-tap revoke. Backend: GET /credentials/:id/policy + POST /credentials/:id/revoke (Dev A — pending). */
export function Policy() {
    const qc = useQueryClient();
    const [credentialId, setCredentialId] = useState('');
    const [loadedId, setLoadedId] = useState('');

    const policy = useQuery({
        queryKey: ['policy', loadedId],
        queryFn: () => api.get<PolicySummary>(`/credentials/${loadedId}/policy`),
        enabled: loadedId.length > 0,
    });

    const revoke = useMutation({
        mutationFn: () => api.post(`/credentials/${loadedId}/revoke`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['policy', loadedId] }),
    });

    const notBuilt = policy.isError && (policy.error as ApiError).status === 404;

    return (
        <section aria-labelledby="policy-heading">
            <h1 id="policy-heading" className="mb-2 text-3xl font-bold">Rules</h1>
            <p className="mb-6">What each helper (human or AI) is allowed to do with your money.</p>

            <div className="mb-6 flex flex-wrap items-end gap-3">
                <div className="flex flex-col">
                    <label htmlFor="cred" className="font-medium">Credential ID</label>
                    <input
                        id="cred"
                        value={credentialId}
                        onChange={(e) => setCredentialId(e.target.value)}
                        className="rounded border border-gray-400 p-3 dark:border-zinc-600 dark:bg-zinc-800"
                        placeholder="from the seed / dashboard"
                    />
                </div>
                <button
                    type="button"
                    onClick={() => setLoadedId(credentialId.trim())}
                    disabled={!credentialId.trim()}
                    className="rounded bg-purple-900 px-5 py-3 font-bold text-white disabled:opacity-50"
                >
                    Load rules
                </button>
            </div>

            {policy.isPending && loadedId && <p role="status">Loading…</p>}
            {notBuilt && (
                <p role="status" className="rounded bg-amber-100 p-4 text-amber-900">
                    The rules view isn’t connected yet — the backend policy endpoint is still being built.
                </p>
            )}
            {policy.isError && !notBuilt && (
                <p role="alert" className="rounded bg-red-100 p-3 text-red-900">
                    {(policy.error as ApiError).message}
                </p>
            )}

            {policy.data && (
                <div className="rounded-lg border border-gray-300 p-4 dark:border-zinc-700">
                    <h2 className="text-xl font-bold">
                        {policy.data.label ?? policy.data.credentialId}
                        {policy.data.status === 'REVOKED' && (
                            <span className="ml-3 rounded-full bg-red-800 px-3 py-1 text-sm text-white">REVOKED</span>
                        )}
                    </h2>
                    <ul className="mt-3 list-disc pl-6">
                        {policy.data.rules.map((r, i) => <li key={i}>{ruleToText(r)}</li>)}
                    </ul>
                    {policy.data.status !== 'REVOKED' && (
                        <button
                            type="button"
                            onClick={() => revoke.mutate()}
                            disabled={revoke.isPending}
                            className="mt-4 rounded bg-red-800 px-6 py-3 text-lg font-bold text-white disabled:opacity-50"
                        >
                            Revoke access now
                        </button>
                    )}
                </div>
            )}
        </section>
    );
}

/** Plain-language rendering of rules. Display-only — the engine decides, we describe. */
function ruleToText(r: PolicyRule): string {
    switch (r.ruleType) {
        case 'SPEND_CAP_MONTHLY': return `Can spend at most ${formatNaira(r.params.limit)} per month.`;
        case 'SPEND_CAP_PER_TX': return `Can spend at most ${formatNaira(r.params.limit)} in a single payment.`;
        case 'BILLER_ALLOWLIST': return `Can only pay these billers: ${r.params.billerIds.join(', ')}.`;
        case 'RECIPIENT_LOCK': return `Can only send to these recipients: ${r.params.recipients.join(', ')}.`;
        case 'COSIGN_THRESHOLD': return `Payments above ${formatNaira(r.params.threshold)} need a trusted contact’s approval.`;
        case 'CHANNEL_SCOPE': return `Can only act via: ${r.params.channels.join(', ')}.`;
        case 'TIME_WINDOW': return `Can only pay between ${r.params.startHour}:00 and ${r.params.endHour}:00 (${r.params.tz}).`;
    }
}