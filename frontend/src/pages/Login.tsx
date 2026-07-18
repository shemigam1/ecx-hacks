import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { setSession } from '../lib/authStore';
import type { OtpRequestResult, OtpVerifyResult } from '../lib/types';

/** Phone OTP → JWT (POST /auth/otp/request → /auth/otp/verify). devCode is shown in dev. */
export function Login() {
    const navigate = useNavigate();
    const location = useLocation();
    const from = (location.state as { from?: string } | null)?.from ?? '/cosign';

    const [phone, setPhone] = useState('');
    const [code, setCode] = useState('');
    const [devCode, setDevCode] = useState<string | null>(null);
    const [step, setStep] = useState<'phone' | 'code'>('phone');

    const request = useMutation({
        mutationFn: () => api.post<OtpRequestResult>('/auth/otp/request', { phone }),
        onSuccess: (res) => {
            setDevCode(res.devCode ?? null);
            setStep('code');
        },
    });

    const verify = useMutation({
        mutationFn: () => api.post<OtpVerifyResult>('/auth/otp/verify', { phone, code }),
        onSuccess: (res) => {
            setSession(res.token, res.principal);
            navigate(from, { replace: true });
        },
    });

    const error = (request.error ?? verify.error) as ApiError | null;

    return (
        <section aria-labelledby="login-heading" className="mx-auto max-w-md">
            <h1 id="login-heading" className="mb-1 text-3xl font-bold">Sign in</h1>
            <p className="mb-6 text-gray-700">
                Enter your phone number and we’ll send you a one-time code. No password needed.
            </p>

            {step === 'phone' && (
                <div className="flex flex-col gap-3">
                    <label htmlFor="phone" className="font-medium">Phone number</label>
                    <input
                        id="phone"
                        type="tel"
                        autoComplete="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+2348012345678"
                        className="rounded-lg border border-gray-300 bg-white p-3 text-gray-900 placeholder:text-gray-400"
                    />
                    <button
                        type="button"
                        onClick={() => request.mutate()}
                        disabled={request.isPending || phone.trim().length < 7}
                        className="rounded-lg bg-blue-600 p-3 font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                        {request.isPending ? 'Sending…' : 'Send code'}
                    </button>
                </div>
            )}

            {step === 'code' && (
                <div className="flex flex-col gap-3">
                    {devCode && (
                        <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900" role="status">
                            Dev mode: your code is <strong>{devCode}</strong>
                        </p>
                    )}
                    <label htmlFor="code" className="font-medium">Enter the 6-digit code sent to {phone}</label>
                    <input
                        id="code"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        className="rounded-lg border border-gray-300 bg-white p-3 tracking-widest text-gray-900"
                    />
                    <button
                        type="button"
                        onClick={() => verify.mutate()}
                        disabled={verify.isPending || code.trim().length < 4}
                        className="rounded-lg bg-blue-600 p-3 font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                        {verify.isPending ? 'Checking…' : 'Sign in'}
                    </button>
                    <button type="button" onClick={() => setStep('phone')} className="text-left text-blue-700 underline">
                        Use a different number
                    </button>
                </div>
            )}

            {error && (
                <p role="alert" className="mt-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-red-900">
                    {error.message}
                </p>
            )}
        </section>
    );
}