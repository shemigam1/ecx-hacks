import { API_KEY } from './env';
import { getToken } from './authStore';

export class ApiError extends Error {
    readonly status: number;

    constructor(status: number, message: string) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
    }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
        'x-api-key': API_KEY,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers as Record<string, string> | undefined),
    };
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(path, { ...init, headers });

    if (!res.ok) {
        let message = res.statusText;
        try {
            const body = (await res.json()) as { message?: string | string[] };
            if (body.message) message = Array.isArray(body.message) ? body.message.join('; ') : body.message;
        } catch {
            /* non-JSON error body */
        }
        throw new ApiError(res.status, message);
    }
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
}

export const api = {
    get: <T>(path: string) => request<T>(path),
    post: <T>(path: string, body?: unknown) =>
        request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
};