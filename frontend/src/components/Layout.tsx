import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { clearSession, getPrincipal, isLoggedIn } from '../lib/authStore';

const LARGE_TYPE_KEY = 'steward.largeType';

export function Layout() {
    const navigate = useNavigate();
    const [largeType, setLargeType] = useState(() => localStorage.getItem(LARGE_TYPE_KEY) === '1');
    const principal = getPrincipal();

    useEffect(() => {
        document.documentElement.classList.toggle('large-type', largeType);
        localStorage.setItem(LARGE_TYPE_KEY, largeType ? '1' : '0');
    }, [largeType]);

    const link = ({ isActive }: { isActive: boolean }) =>
        `rounded-lg px-4 py-1.5 font-medium ${isActive ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'}`;

    return (
        <div className="min-h-svh bg-white text-gray-900">
            <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-blue-600 focus:px-4 focus:py-2 focus:text-white">Skip to main content</a>

            <header className="border-b border-gray-200">
                <nav aria-label="Main" className="mx-auto flex max-w-6xl flex-wrap items-center gap-1.5 px-6 py-3">
                    <span className="mr-6 text-xl font-bold">Steward</span>
                    <NavLink to="/demo/console" className={link}>Console</NavLink>
                    <NavLink to="/demo/simulator" className={link}>Simulator</NavLink>
                    <NavLink to="/cosign" className={link}>Cosign</NavLink>

                    <div className="ml-auto flex items-center gap-3">
                        <button
                            type="button"
                            onClick={() => setLargeType((v) => !v)}
                            aria-pressed={largeType}
                            className="rounded-lg px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100"
                        >
                            Large text {largeType ? 'on' : 'off'}
                        </button>
                        {isLoggedIn() ? (
                            <>
                                <span className="text-gray-600">
                                    Signed in{principal ? ` · ${principal.role.toLowerCase().replace(/_/g, ' ')}` : ''}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => {
                                        clearSession();
                                        navigate('/login');
                                    }}
                                    className="rounded-lg border border-gray-300 px-4 py-1.5 font-medium hover:bg-gray-50"
                                >
                                    Sign out
                                </button>
                            </>
                        ) : (
                            <NavLink to="/login" className="rounded-lg px-4 py-1.5 font-medium text-gray-700 hover:bg-gray-100">
                                Sign in
                            </NavLink>
                        )}
                    </div>
                </nav>
            </header>

            <main id="main" className="mx-auto max-w-6xl px-6 py-6">
                <Outlet />
            </main>
        </div>
    );
}