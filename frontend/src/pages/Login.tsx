import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { setSession } from '../lib/authStore';
import type { AuthResult } from '../lib/types';

/** Phone + numeric passcode → JWT (POST /auth/login). The passcode is the same PIN used on the phone. */
export function Login() {
    const navigate = useNavigate();
    const location = useLocation();
    const from = (location.state as { from?: string } | null)?.from ?? '/';

    const [phone, setPhone] = useState('');
    const [passcode, setPasscode] = useState('');

    const login = useMutation({
        mutationFn: () => api.post<AuthResult>('/auth/login', { phone: phone.trim(), passcode: passcode.trim() }),
        onSuccess: (res) => {
            setSession(res.token, res.principal);
            navigate(from, { replace: true });
        },
    });

    const error = login.error as ApiError | null;
    const canSubmit = phone.trim().length >= 7 && passcode.trim().length >= 4;

    return (
        <section aria-labelledby="login-heading" className="mx-auto max-w-md">
            <h1 id="login-heading" className="mb-1 text-3xl font-bold">Sign in</h1>
            <p className="mb-6 text-gray-700">
                Enter your phone number and your passcode — the same one you use on the phone.
            </p>

            <form
                className="flex flex-col gap-3"
                onSubmit={(e) => { e.preventDefault(); if (canSubmit) login.mutate(); }}
            >
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

                <label htmlFor="passcode" className="mt-1 font-medium">Passcode</label>
                <input
                    id="passcode"
                    type="password"
                    inputMode="numeric"
                    autoComplete="current-password"
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value)}
                    placeholder="Your 4-digit passcode"
                    className="rounded-lg border border-gray-300 bg-white p-3 tracking-widest text-gray-900 placeholder:tracking-normal placeholder:text-gray-400"
                />

                <button
                    type="submit"
                    disabled={login.isPending || !canSubmit}
                    className="mt-1 rounded-lg bg-brand-600 p-3 font-bold text-white hover:bg-brand-700 disabled:opacity-50"
                >
                    {login.isPending ? 'Signing in…' : 'Sign in'}
                </button>
            </form>

            {error && (
                <p role="alert" className="mt-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-red-900">
                    {error.message}
                </p>
            )}

            <p className="mt-6 text-sm text-gray-600">
                New to Steward? <Link to="/signup" className="font-medium text-brand-700 hover:underline">Create an account</Link>
            </p>
        </section>
    );
}
