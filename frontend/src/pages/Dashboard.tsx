import { useState } from 'react';
import { getPrincipal } from '../lib/authStore';
import { useSocketEvent, useSubscription } from '../lib/socket';
import { formatNaira, type IntentEscalatedPayload, type IntentExecutedPayload } from '../lib/types';

/**
 * P2 trusted-contact overview. The monthly-summary REST endpoint isn't built yet, so this leans on
 * what IS live: the per-account WS room. Session-scoped live totals — honest, and real-time.
 */
export function Dashboard() {
    const principal = getPrincipal();
    useSubscription({ accountId: principal?.accountId });

    const [executed, setExecuted] = useState<IntentExecutedPayload[]>([]);
    const [held, setHeld] = useState(0);

    useSocketEvent<IntentExecutedPayload>('intent.executed', (p) => setExecuted((xs) => [p, ...xs].slice(0, 50)));
    useSocketEvent<IntentEscalatedPayload>('intent.escalated', () => setHeld((n) => n + 1));

    const total = executed.reduce((sum, p) => sum + p.amount, 0);

    return (
        <section aria-labelledby="dash-heading">
            <h1 id="dash-heading" className="mb-2 text-3xl font-bold">Dashboard</h1>
            <p className="mb-6">Live view of this session. The full monthly picture arrives when the summary endpoint ships.</p>

            <div className="mb-6 grid gap-4 sm:grid-cols-3" aria-live="polite">
                <div className="rounded-lg border border-gray-300 p-4 dark:border-zinc-700">
                    <p className="text-sm">Paid (this session)</p>
                    <p className="text-2xl font-bold">{formatNaira(total)}</p>
                </div>
                <div className="rounded-lg border border-gray-300 p-4 dark:border-zinc-700">
                    <p className="text-sm">Payments executed</p>
                    <p className="text-2xl font-bold">{executed.length}</p>
                </div>
                <div className="rounded-lg border border-gray-300 p-4 dark:border-zinc-700">
                    <p className="text-sm">Held for approval</p>
                    <p className="text-2xl font-bold">{held}</p>
                </div>
            </div>

            <h2 className="mb-2 text-xl font-bold">Recent payments</h2>
            <ul className="flex flex-col gap-2">
                {executed.length === 0 && <li>No payments yet this session.</li>}
                {executed.map((p) => (
                    <li key={p.intentId} className="rounded border border-gray-300 p-3 dark:border-zinc-700">
                        {formatNaira(p.amount)} · {new Date(p.executedAt).toLocaleTimeString('en-NG')}
                    </li>
                ))}
            </ul>
        </section>
    );
}