import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { ReasonLine, StatusChip, VerdictBadge } from '../components/VerdictBadge';
import { explainReason } from '../lib/reasonText';
import { formatNaira, type ScenarioInfo, type ScenarioResult } from '../lib/types';

/** P1 judge control panel: GET /demo/scenarios → cards → POST /demo/scenario {name}. */
export function DemoSimulator() {
    const [last, setLast] = useState<ScenarioResult | null>(null);

    const scenarios = useQuery({
        queryKey: ['demo', 'scenarios'],
        queryFn: () => api.get<ScenarioInfo[]>('/demo/scenarios'),
    });

    const run = useMutation({
        mutationFn: (name: string) => api.post<ScenarioResult>('/demo/scenario', { name }),
        onSuccess: setLast,
    });

    return (
        <section aria-labelledby="sim-heading">
            <h1 id="sim-heading" className="mb-1 text-3xl font-bold">Scenario simulator</h1>
            <p className="mb-4 max-w-3xl text-gray-700">
                Fire a canned scene through the <strong>real</strong> deterministic policy engine (no LLM
                involved), then watch the <Link to="/demo/console" className="font-bold text-brand-700 underline">Console</Link>{' '}
                react — open it in a second window for the split-screen judge view.
            </p>

            <p className="mb-6 max-w-3xl rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900">
                Note: outside the mandate’s time window (6am–10pm WAT), even the ALLOW/ESCALATE scenes return
                DENY with <span className="font-mono text-sm">OUTSIDE_TIME_WINDOW</span> — the policy engine
                doesn’t care that it’s a demo.
            </p>

            {scenarios.isPending && <p role="status">Loading scenarios…</p>}
            {scenarios.isError && (
                <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-red-900">
                    Couldn’t load scenarios: {(scenarios.error as ApiError).message}. Is the backend running on :3000?
                </p>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
                {scenarios.data?.map((s) => (
                    <div key={s.name} className="rounded-xl border border-gray-200 bg-white shadow-sm p-4">
                        <p className="flex flex-wrap items-center gap-2">
                            <span className="font-mono font-bold">{s.name}</span>
                            <span className="text-sm text-gray-500">expected:</span>
                            <VerdictBadge verdict={s.expected} />
                        </p>
                        <p className="mt-2 text-gray-800">{s.description}</p>
                        <button
                            type="button"
                            onClick={() => run.mutate(s.name)}
                            disabled={run.isPending}
                            className="mt-3 font-bold text-brand-700 underline disabled:opacity-50"
                        >
                            Fire this scene
                        </button>
                    </div>
                ))}
            </div>

            <div aria-live="polite" className="mt-6">
                {run.isPending && <p role="status">Running scenario…</p>}
                {run.isError && (
                    <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-red-900">
                        {(run.error as ApiError).message}
                    </p>
                )}
                {last && (
                    <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4">
                        <h2 className="mb-2 text-xl font-bold">
                            Result: <span className="font-mono">{last.scenario}</span>
                        </h2>
                        <p className="flex flex-wrap items-center gap-3">
                            <VerdictBadge verdict={last.verdict} />
                            <span className="text-xl font-bold">{formatNaira(last.amount)}</span>
                            {last.billerName && <span className="text-lg text-gray-700">→ {last.billerName}</span>}
                            <StatusChip status={last.status} />
                        </p>
                        {last.reasons.map((r) => <ReasonLine key={r} code={r} text={explainReason(r)} />)}
                    </div>
                )}
            </div>
        </section>
    );
}