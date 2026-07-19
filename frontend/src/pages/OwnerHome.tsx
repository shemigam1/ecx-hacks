import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { getPrincipal } from '../lib/authStore';
import { useSocketEvent, useSubscription } from '../lib/socket';
import { formatNaira, type IntentEscalatedPayload, type IntentExecutedPayload } from '../lib/types';
import { describe, type AuditRow } from './Activity';

function greeting(): string {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
}

function firstName(full?: string): string {
    const n = (full ?? '').trim().split(/\s+/)[0];
    return n || 'there';
}

/**
 * The owner's landing page — a real "here's your account" overview, not the demo firehose.
 * Live tiles come from the per-account WS room (session-scoped, honest); recent activity is the
 * persisted audit trail. No new backend surface — everything here the owner can already read.
 */
export function OwnerHome() {
    const principal = getPrincipal();
    const qc = useQueryClient();
    useSubscription({ accountId: principal?.accountId });

    const recent = useQuery({
        queryKey: ['audit', principal?.accountId, 'home'],
        queryFn: () => api.get<AuditRow[]>(`/accounts/${principal!.accountId}/audit?limit=6`),
        enabled: !!principal?.accountId,
    });

    // Keep the recent-activity list live: the audit row is written just after the WS event, so refetch
    // on a short delay. The session tiles below update from the same events, instantly.
    const refreshActivity = () => setTimeout(() => qc.invalidateQueries({ queryKey: ['audit', principal?.accountId, 'home'] }), 600);

    const [executed, setExecuted] = useState<IntentExecutedPayload[]>([]);
    const [held, setHeld] = useState(0);
    useSocketEvent<IntentExecutedPayload>('intent.executed', (p) => { setExecuted((xs) => [p, ...xs].slice(0, 50)); refreshActivity(); });
    useSocketEvent<IntentEscalatedPayload>('intent.escalated', () => { setHeld((n) => n + 1); refreshActivity(); });

    const paidThisSession = executed.reduce((sum, p) => sum + p.amount, 0);

    return (
        <section aria-labelledby="home-heading">
            <header className="mb-8">
                <h1 id="home-heading" className="text-3xl font-bold">
                    {greeting()}, {firstName(principal?.name)}.
                </h1>
                <p className="mt-1 text-lg text-gray-600">Here’s what’s happening on your account.</p>
            </header>

            <div className="mb-8 grid gap-4 sm:grid-cols-3" aria-live="polite">
                <Tile label="Paid this session" value={formatNaira(paidThisSession)} />
                <Tile label="Payments made" value={String(executed.length)} />
                <Tile label="Held for approval" value={String(held)} accent={held > 0} />
            </div>

            <div className="mb-8 grid gap-4 sm:grid-cols-2">
                <QuickAction
                    to="/rules"
                    title="Your rules"
                    body="See exactly what each helper — person or AI — may do with your money, and revoke access instantly."
                />
                <QuickAction
                    to="/activity"
                    title="Activity"
                    body="A plain-language record of every payment: what went through, what was held, and what was blocked."
                />
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-xl font-bold">Recent activity</h2>
                    <Link to="/activity" className="text-sm font-medium text-brand-700 hover:underline">
                        View all →
                    </Link>
                </div>

                {recent.isPending && <p role="status" className="text-gray-500">Loading…</p>}
                {recent.isError && <p className="text-gray-500">Nothing to show yet.</p>}
                {recent.data?.length === 0 && (
                    <p className="text-gray-500">No activity yet. Payments will appear here as they happen.</p>
                )}

                <ol className="flex flex-col divide-y divide-gray-100">
                    {recent.data?.map((row, i) => (
                        <li key={row.id ?? i} className="flex items-baseline justify-between gap-4 py-2.5">
                            <span className="font-medium text-gray-900">{describe(row)}</span>
                            <span className="shrink-0 text-sm text-gray-500">
                                {new Date(row.createdAt).toLocaleString('en-NG', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    day: 'numeric',
                                    month: 'short',
                                })}
                            </span>
                        </li>
                    ))}
                </ol>
            </div>
        </section>
    );
}

function Tile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
    return (
        <div className={`rounded-2xl border p-5 shadow-sm ${accent ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-white'}`}>
            <p className="text-sm text-gray-600">{label}</p>
            <p className="mt-1 text-3xl font-bold tracking-tight">{value}</p>
        </div>
    );
}

function QuickAction({ to, title, body }: { to: string; title: string; body: string }) {
    return (
        <Link
            to={to}
            className="group rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-colors hover:border-brand-300 hover:bg-brand-50"
        >
            <p className="flex items-center gap-2 text-lg font-bold text-gray-900">
                {title}
                <span aria-hidden="true" className="text-brand-600 transition-transform group-hover:translate-x-0.5">→</span>
            </p>
            <p className="mt-1 text-gray-600">{body}</p>
        </Link>
    );
}
