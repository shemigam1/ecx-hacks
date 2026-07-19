import { useState } from 'react';
import { Link } from 'react-router-dom';
import { getSocket, useSocketEvent, useSubscription } from '../lib/socket';
import { explainReason } from '../lib/reasonText';
import { accentClass, ReasonLine, StatusChip, VerdictBadge } from '../components/VerdictBadge';
import {
    formatNaira,
    type CosignResolvedPayload,
    type DemoDecisionPayload,
    type IntentEscalatedPayload,
    type IntentExecutedPayload,
    type IntentVoidedPayload,
} from '../lib/types';

type ConsoleEvent =
    | { kind: 'decision'; at: string; p: DemoDecisionPayload }
    | { kind: 'escalated'; at: string; p: IntentEscalatedPayload }
    | { kind: 'executed'; at: string; p: IntentExecutedPayload }
    | { kind: 'voided'; at: string; p: IntentVoidedPayload }
    | { kind: 'cosign'; at: string; p: CosignResolvedPayload };

const MAX_EVENTS = 100;
let seq = 0;

function accentFor(e: ConsoleEvent) {
    if (e.kind === 'escalated') return accentClass('escalate');
    if (e.kind === 'voided') return accentClass('neutral');
    if (e.kind === 'executed') return accentClass('allow');
    if (e.kind === 'cosign') return accentClass(e.p.approve ? 'allow' : 'deny');
    const v = e.p.verdict;
    return accentClass(v === 'ALLOW' ? 'allow' : v === 'ESCALATE' ? 'escalate' : 'deny');
}

/** P0 judge screen: live newest-first stream of intent → verdict → reasons (WS `demo` room). */
export function DemoConsole() {
    const [events, setEvents] = useState<(ConsoleEvent & { key: number })[]>([]);
    const [live, setLive] = useState(() => getSocket().connected);
    useSubscription({ demo: true });

    useSocketEvent('connect', () => setLive(true));
    useSocketEvent('disconnect', () => setLive(false));

    const push = (e: ConsoleEvent) =>
        setEvents((prev) => [{ ...e, key: seq++ }, ...prev].slice(0, MAX_EVENTS));

    const now = () => new Date().toLocaleTimeString('en-NG', { hour12: false });

    useSocketEvent<DemoDecisionPayload>('demo.decision', (p) => push({ kind: 'decision', at: now(), p }));
    useSocketEvent<IntentEscalatedPayload>('intent.escalated', (p) => push({ kind: 'escalated', at: now(), p }));
    useSocketEvent<IntentExecutedPayload>('intent.executed', (p) => push({ kind: 'executed', at: now(), p }));
    useSocketEvent<IntentVoidedPayload>('intent.voided', (p) => push({ kind: 'voided', at: now(), p }));
    useSocketEvent<CosignResolvedPayload>('cosign.resolved', (p) => push({ kind: 'cosign', at: now(), p }));

    return (
        <section aria-labelledby="console-heading">
            <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
                <h1 id="console-heading" className="flex items-center gap-3 text-3xl font-bold">
                    Live policy console
                    <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-0.5 text-sm font-medium ${live ? 'border-green-600 text-green-700' : 'border-gray-300 text-gray-500'}`}
                    >
                        <span className={`h-2 w-2 rounded-full ${live ? 'bg-green-600' : 'bg-gray-400'}`} aria-hidden="true" />
                        {live ? 'Live' : 'Reconnecting…'}
                    </span>
                </h1>
                <button
                    type="button"
                    onClick={() => setEvents([])}
                    className="rounded-lg border border-gray-300 bg-white px-4 py-1.5 font-medium hover:bg-gray-50"
                >
                    Clear stream
                </button>
            </div>
            <p className="mb-6 max-w-3xl text-gray-700">
                Every payment attempt — even from a fully hijacked AI agent — passes the deterministic policy
                engine. Its verdict and machine-readable reasons stream here in real time.
            </p>

            <ol aria-live="polite" aria-label="Live payment events, newest first" className="flex flex-col gap-4">
                {events.length === 0 && (
                    <li className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-gray-600">
                        Waiting for events… fire a scene from the Simulator to light this up.
                    </li>
                )}
                {events.map((e) => (
                    <li key={e.key} className={`rounded-xl border border-gray-200 bg-white shadow-sm border-l-4 p-4 ${accentFor(e)}`}>
                        <div className="flex items-start justify-between gap-3">
                            <p className="text-sm text-gray-500">
                                {e.at}
                                {e.kind === 'decision' && <> · scenario {e.p.scenario} · intent <span className="font-mono">{e.p.intentId}</span></>}
                                {e.kind === 'escalated' && <> · intent <span className="font-mono">{e.p.intentId}</span> held</>}
                                {(e.kind === 'executed' || e.kind === 'voided' || e.kind === 'cosign') && (
                                    <> · intent <span className="font-mono">{e.p.intentId}</span></>
                                )}
                            </p>
                            {e.kind === 'decision' && <StatusChip status={e.p.status} />}
                            {e.kind === 'escalated' && (
                                <Link to="/approvals" className="font-bold text-brand-700 underline">Review in Approvals</Link>
                            )}
                        </div>

                        <div className="mt-1 flex flex-wrap items-center gap-3">
                            {e.kind === 'decision' && (
                                <>
                                    <VerdictBadge verdict={e.p.verdict} />
                                    <span className="text-xl font-bold">{formatNaira(e.p.amount)}</span>
                                    {e.p.billerName && <span className="text-lg text-gray-700">→ {e.p.billerName}</span>}
                                </>
                            )}
                            {e.kind === 'escalated' && (
                                <>
                                    <VerdictBadge verdict="ESCALATE" />
                                    <span className="text-xl font-bold">{formatNaira(e.p.amount)}</span>
                                    <span className="text-gray-700">held for trusted-contact approval</span>
                                </>
                            )}
                            {e.kind === 'executed' && (
                                <>
                                    <VerdictBadge verdict="ALLOW" />
                                    <span className="text-xl font-bold">{formatNaira(e.p.amount)}</span>
                                    <span className="text-gray-700">paid successfully</span>
                                </>
                            )}
                            {e.kind === 'voided' && (
                                <span className="text-lg text-gray-700">Payment cancelled — {e.p.reason}</span>
                            )}
                            {e.kind === 'cosign' && (
                                <span className="text-lg text-gray-700">
                                    Trusted contact <strong>{e.p.approve ? 'approved' : 'denied'}</strong> the held payment
                                </span>
                            )}
                        </div>

                        {e.kind === 'decision' &&
                            e.p.reasons.map((r) => <ReasonLine key={r} code={r} text={explainReason(r)} />)}
                        {e.kind === 'escalated' &&
                            e.p.reasons.map((r) => <ReasonLine key={r.code} code={r.code} text={explainReason(r.code)} />)}
                    </li>
                ))}
            </ol>
        </section>
    );
}