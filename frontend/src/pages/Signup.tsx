import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { setSession } from '../lib/authStore';
import { formatNaira, type AuthResult } from '../lib/types';

type Step = 1 | 2 | 3;
const STEPS = ['You', 'Limits', 'Trusted contact'];

/** Parse a naira string ("50,000" / "₦50000") to kobo. Returns NaN when not a positive number. */
function nairaToKobo(s: string): number {
    const n = Number(s.replace(/[₦,\s]/g, ''));
    return n > 0 ? Math.round(n * 100) : NaN;
}

/**
 * Owner self-serve onboarding wizard → POST /auth/register. The owner picks a numeric passcode (the
 * same code they'll use on the phone); the server provisions the account + AI-agent mandate and
 * returns a session, so we land straight on Home. No SMS/OTP.
 */
export function Signup() {
    const navigate = useNavigate();
    const [step, setStep] = useState<Step>(1);

    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [passcode, setPasscode] = useState('');
    const [confirm, setConfirm] = useState('');
    const [monthly, setMonthly] = useState('50,000');
    const [cosign, setCosign] = useState('5,000');
    const [tcName, setTcName] = useState('');
    const [tcPhone, setTcPhone] = useState('');

    const register = useMutation({
        mutationFn: () =>
            api.post<AuthResult>('/auth/register', {
                name: name.trim(),
                phone: phone.trim(),
                passcode: passcode.trim(),
                monthlyCapKobo: nairaToKobo(monthly),
                cosignThresholdKobo: nairaToKobo(cosign),
                ...(tcName.trim() && tcPhone.trim()
                    ? { trustedContactName: tcName.trim(), trustedContactPhone: tcPhone.trim() }
                    : {}),
            }),
        onSuccess: (res) => { setSession(res.token, res.principal); navigate('/', { replace: true }); },
    });

    const error = register.error as ApiError | null;
    const monthlyKobo = nairaToKobo(monthly);
    const cosignKobo = nairaToKobo(cosign);
    const limitsValid = monthlyKobo > 0 && cosignKobo >= 0 && cosignKobo <= monthlyKobo;

    const passcodeOk = /^\d{4,}$/.test(passcode);
    const passcodeMatches = passcode === confirm;
    const step1Ok = name.trim().length >= 2 && phone.trim().length >= 7 && passcodeOk && passcodeMatches;

    return (
        <section aria-labelledby="signup-heading" className="mx-auto max-w-lg">
            <h1 id="signup-heading" className="mb-1 text-3xl font-bold">Create your account</h1>
            <p className="mb-6 text-gray-700">
                Set up Steward for yourself — your details and a passcode, the limits your AI assistant must
                obey, and (optionally) a trusted contact who approves the bigger payments.
            </p>

            <ol className="mb-8 flex items-center gap-2" aria-label="Progress">
                {STEPS.map((label, i) => {
                    const n = (i + 1) as Step;
                    const state = n < step ? 'done' : n === step ? 'current' : 'todo';
                    return (
                        <li key={label} className="flex flex-1 items-center gap-2">
                            <span
                                aria-current={state === 'current' ? 'step' : undefined}
                                className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-bold ${
                                    state === 'todo' ? 'bg-gray-100 text-gray-400' : 'bg-brand-600 text-white'
                                }`}
                            >
                                {state === 'done' ? '✓' : n}
                            </span>
                            <span className={`text-sm ${state === 'current' ? 'font-semibold text-gray-900' : 'text-gray-500'}`}>{label}</span>
                            {i < STEPS.length - 1 && <span className="mx-1 hidden h-px flex-1 bg-gray-200 sm:block" />}
                        </li>
                    );
                })}
            </ol>

            {step === 1 && (
                <div className="flex flex-col gap-4">
                    <Field label="Your name" htmlFor="su-name">
                        <input id="su-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name"
                            placeholder="e.g. Ada Okoye" className={inputCls} />
                    </Field>
                    <Field label="Phone number" htmlFor="su-phone">
                        <input id="su-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel"
                            placeholder="+2348012345678" className={inputCls} />
                    </Field>
                    <Field label="Choose a passcode" htmlFor="su-pass" hint="At least 4 digits. You’ll use this to sign in here and on the phone.">
                        <input id="su-pass" type="password" inputMode="numeric" autoComplete="new-password" value={passcode}
                            onChange={(e) => setPasscode(e.target.value)} placeholder="4-digit passcode"
                            className={`${inputCls} tracking-widest placeholder:tracking-normal`} />
                    </Field>
                    <Field label="Confirm passcode" htmlFor="su-pass2">
                        <input id="su-pass2" type="password" inputMode="numeric" autoComplete="new-password" value={confirm}
                            onChange={(e) => setConfirm(e.target.value)}
                            className={`${inputCls} tracking-widest`} />
                    </Field>
                    {passcode && !passcodeOk && <p className="text-sm text-red-700">Your passcode must be at least 4 digits.</p>}
                    {passcode && passcodeOk && confirm && !passcodeMatches && <p className="text-sm text-red-700">The two passcodes don’t match.</p>}
                    <button type="button" onClick={() => setStep(2)} disabled={!step1Ok} className={primaryCls}>Continue</button>
                </div>
            )}

            {step === 2 && (
                <div className="flex flex-col gap-4">
                    <fieldset className="rounded-xl border border-gray-200 bg-white p-4">
                        <legend className="px-1 text-sm font-semibold text-gray-700">Your assistant’s limits</legend>
                        <div className="mt-2 flex flex-col gap-4">
                            <Field label="Most it can spend per month" htmlFor="su-monthly">
                                <MoneyInput id="su-monthly" value={monthly} onChange={setMonthly} />
                            </Field>
                            <Field label="Payments this size or larger need approval" htmlFor="su-cosign"
                                hint="A trusted contact must co-sign anything at or above this amount.">
                                <MoneyInput id="su-cosign" value={cosign} onChange={setCosign} />
                            </Field>
                            {!limitsValid && (monthly || cosign) && (
                                <p className="text-sm text-red-700">
                                    Enter a monthly limit, and keep the approval amount at or below it.
                                </p>
                            )}
                            {limitsValid && (
                                <p className="text-sm text-gray-600">
                                    Your assistant may spend up to <strong>{formatNaira(monthlyKobo)}</strong>/month, and anything
                                    from <strong>{formatNaira(cosignKobo)}</strong> up needs a trusted contact’s approval.
                                </p>
                            )}
                        </div>
                    </fieldset>

                    <div className="flex gap-3">
                        <button type="button" onClick={() => setStep(1)} className={secondaryCls}>Back</button>
                        <button type="button" onClick={() => setStep(3)} disabled={!limitsValid} className={primaryCls}>Continue</button>
                    </div>
                </div>
            )}

            {step === 3 && (
                <div className="flex flex-col gap-4">
                    <p className="text-gray-700">
                        Add someone you trust to approve the bigger payments — a daughter, son, or close friend.
                        You can skip this and add them later.
                    </p>
                    <Field label="Trusted contact’s name" htmlFor="su-tcname">
                        <input id="su-tcname" value={tcName} onChange={(e) => setTcName(e.target.value)}
                            placeholder="e.g. Chioma" className={inputCls} />
                    </Field>
                    <Field label="Their phone number" htmlFor="su-tcphone">
                        <input id="su-tcphone" type="tel" value={tcPhone} onChange={(e) => setTcPhone(e.target.value)}
                            placeholder="+2348037654321" className={inputCls} />
                    </Field>

                    <div className="flex flex-wrap gap-3">
                        <button type="button" onClick={() => setStep(2)} className={secondaryCls}>Back</button>
                        <button type="button" onClick={() => { setTcName(''); setTcPhone(''); register.mutate(); }}
                            disabled={register.isPending} className={secondaryCls}>Skip &amp; finish</button>
                        <button type="button" onClick={() => register.mutate()}
                            disabled={register.isPending || tcName.trim().length < 2 || tcPhone.trim().length < 7}
                            className={primaryCls}>
                            {register.isPending ? 'Creating…' : 'Create account'}
                        </button>
                    </div>
                </div>
            )}

            {error && (
                <p role="alert" className="mt-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-red-900">
                    {error.message}
                </p>
            )}

            <p className="mt-6 text-sm text-gray-600">
                Already have an account? <Link to="/login" className="font-medium text-brand-700 hover:underline">Sign in</Link>
            </p>
        </section>
    );
}

const inputCls = 'rounded-lg border border-gray-300 bg-white p-3 text-gray-900 placeholder:text-gray-400';
const primaryCls = 'rounded-lg bg-brand-600 px-5 py-3 font-bold text-white hover:bg-brand-700 disabled:opacity-50';
const secondaryCls = 'rounded-lg border border-gray-300 bg-white px-5 py-3 font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50';

function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-1.5">
            <label htmlFor={htmlFor} className="font-medium">{label}</label>
            {children}
            {hint && <p className="text-sm text-gray-500">{hint}</p>}
        </div>
    );
}

/** Naira money input with a ₦ prefix; stores the raw string, parsed to kobo on submit. */
function MoneyInput({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
    return (
        <div className="flex items-center rounded-lg border border-gray-300 bg-white pl-3">
            <span aria-hidden="true" className="text-gray-500">₦</span>
            <input id={id} inputMode="numeric" value={value} onChange={(e) => onChange(e.target.value)}
                className="w-full bg-transparent p-3 text-gray-900 outline-none" />
        </div>
    );
}
