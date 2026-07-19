import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { clearSession, getPrincipal, isLoggedIn } from '../lib/authStore';

const LARGE_TYPE_KEY = 'steward.largeType';

/** Primary nav depends on who's signed in — owners manage an account, trusted contacts approve. */
function navFor(role: string | undefined): { to: string; label: string }[] {
    if (role === 'OWNER') {
        return [
            { to: '/', label: 'Home' },
            { to: '/activity', label: 'Activity' },
            { to: '/rules', label: 'Rules' },
        ];
    }
    if (role === 'TRUSTED_CONTACT' || role === 'DELEGATE') {
        return [{ to: '/approvals', label: 'Approvals' }];
    }
    return [];
}

export function Layout() {
    const navigate = useNavigate();
    const location = useLocation();
    const [largeType, setLargeType] = useState(() => localStorage.getItem(LARGE_TYPE_KEY) === '1');
    const principal = getPrincipal();
    const loggedIn = isLoggedIn();

    useEffect(() => {
        document.documentElement.classList.toggle('large-type', largeType);
        localStorage.setItem(LARGE_TYPE_KEY, largeType ? '1' : '0');
    }, [largeType]);

    const link = ({ isActive }: { isActive: boolean }) =>
        `rounded-lg px-3.5 py-1.5 font-medium transition-colors ${
            isActive ? 'bg-brand-600 text-white shadow-sm' : 'text-gray-700 hover:bg-brand-50 hover:text-brand-800'
        }`;

    const items = navFor(principal?.role);
    const roleLabel = principal?.role ? principal.role.toLowerCase().replace(/_/g, ' ') : '';

    return (
        <div className="flex min-h-svh flex-col">
            <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-brand-600 focus:px-4 focus:py-2 focus:text-white">Skip to main content</a>

            <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/90 backdrop-blur">
                <nav aria-label="Main" className="mx-auto flex max-w-6xl flex-wrap items-center gap-1.5 px-6 py-3">
                    <NavLink to="/" className="mr-5 flex items-center gap-2.5" aria-label="Steward home">
                        <span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-base font-black text-white">S</span>
                        <span className="text-xl font-bold tracking-tight">Steward</span>
                    </NavLink>

                    {items.map((it) => (
                        <NavLink key={it.to} to={it.to} end={it.to === '/'} className={link}>
                            {it.label}
                        </NavLink>
                    ))}

                    <DemoMenu key={location.pathname} />

                    <div className="ml-auto flex items-center gap-3">
                        <button
                            type="button"
                            onClick={() => setLargeType((v) => !v)}
                            aria-pressed={largeType}
                            className="rounded-lg px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100"
                        >
                            Large text {largeType ? 'on' : 'off'}
                        </button>
                        {loggedIn ? (
                            <>
                                <span className="hidden text-sm text-gray-600 sm:inline">
                                    {principal?.name ? principal.name : 'Signed in'}
                                    {roleLabel && <span className="text-gray-400"> · {roleLabel}</span>}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => {
                                        clearSession();
                                        navigate('/login');
                                    }}
                                    className="rounded-lg border border-gray-300 bg-white px-4 py-1.5 font-medium hover:bg-gray-50"
                                >
                                    Sign out
                                </button>
                            </>
                        ) : (
                            <NavLink
                                to="/login"
                                className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-1.5 font-medium text-brand-800 hover:bg-brand-100"
                            >
                                Sign in
                            </NavLink>
                        )}
                    </div>
                </nav>
            </header>

            <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
                <Outlet />
            </main>

            <footer className="border-t border-gray-200 bg-white">
                <p className="mx-auto max-w-6xl px-6 py-4 text-sm text-gray-500">
                    Steward — scoped, revocable, auditable delegation. Every payment passes a deterministic
                    policy engine; the AI never touches money directly.
                </p>
            </footer>
        </div>
    );
}

/**
 * Demo/dev tools, kept out of the primary flow but reachable for the showcase. Native <details> so
 * it's keyboard-accessible for free; closes on outside-click and on route change (keyed by pathname).
 */
function DemoMenu() {
    const ref = useRef<HTMLDetailsElement>(null);

    useEffect(() => {
        const onDown = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) ref.current.open = false;
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, []);

    const close = () => { if (ref.current) ref.current.open = false; };
    const item = ({ isActive }: { isActive: boolean }) =>
        `block rounded-md px-3 py-2 text-sm ${isActive ? 'bg-brand-50 font-medium text-brand-800' : 'text-gray-700 hover:bg-gray-100'}`;

    return (
        <details ref={ref} className="relative">
            <summary className="flex cursor-pointer list-none items-center gap-1 rounded-lg px-3.5 py-1.5 font-medium text-gray-500 hover:bg-gray-100 [&::-webkit-details-marker]:hidden">
                Demo
                <span aria-hidden="true" className="text-xs">▾</span>
            </summary>
            <div className="absolute left-0 z-50 mt-1 w-52 rounded-xl border border-gray-200 bg-white p-1.5 shadow-lg">
                <p className="px-3 pb-1 pt-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">Showcase tools</p>
                <NavLink to="/demo/console" onClick={close} className={item}>Live policy console</NavLink>
                <NavLink to="/demo/simulator" onClick={close} className={item}>Scenario simulator</NavLink>
            </div>
        </details>
    );
}
