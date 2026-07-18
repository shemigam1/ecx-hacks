import type { AuthPrincipal } from './types';

const TOKEN_KEY = 'steward.jwt';
const PRINCIPAL_KEY = 'steward.principal';

export function getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
}

export function getPrincipal(): AuthPrincipal | null {
    const raw = localStorage.getItem(PRINCIPAL_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw) as AuthPrincipal; } catch { return null; }
}

export function setSession(token: string, principal: AuthPrincipal): void {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(PRINCIPAL_KEY, JSON.stringify(principal));
}

export function clearSession(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(PRINCIPAL_KEY);
}

export function isLoggedIn(): boolean {
    return getToken() !== null;
}