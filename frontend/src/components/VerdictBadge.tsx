import type { Verdict } from '../lib/types';

/** Outlined, tinted verdict pill matching the mockups. */
const badge: Record<Verdict, string> = {
    ALLOW: 'border-green-600 bg-green-50 text-green-700',
    ESCALATE: 'border-amber-500 bg-amber-50 text-amber-700',
    DENY: 'border-red-600 bg-red-50 text-red-700',
};

export function VerdictBadge({ verdict }: { verdict: string }) {
    const v = (['ALLOW', 'ESCALATE', 'DENY'].includes(verdict) ? verdict : 'DENY') as Verdict;
    return (
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-0.5 text-sm font-bold ${badge[v]}`}>
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
            {v}
        </span>
    );
}

/** Gray mono status chip (ESCALATED / DENIED / EXECUTED …), right-aligned in cards. */
export function StatusChip({ status }: { status: string }) {
    return (
        <span className="rounded bg-gray-100 px-2 py-0.5 font-mono text-sm text-gray-800">{status}</span>
    );
}

/** Reason line: mono code chip + plain-speech sentence. */
export function ReasonLine({ code, text }: { code: string; text: string }) {
    return (
        <p className="mt-1.5 flex flex-wrap items-baseline gap-2">
            <span className="rounded bg-gray-100 px-2 py-0.5 font-mono text-sm font-medium text-gray-800">
                {code}
            </span>
            <span className="text-gray-700">{text}</span>
        </p>
    );
}

/** Left accent strip color per verdict-ish kind. */
export function accentClass(kind: 'allow' | 'escalate' | 'deny' | 'neutral'): string {
    switch (kind) {
        case 'allow': return 'border-l-green-600';
        case 'escalate': return 'border-l-orange-500';
        case 'deny': return 'border-l-red-600';
        default: return 'border-l-gray-300';
    }
}