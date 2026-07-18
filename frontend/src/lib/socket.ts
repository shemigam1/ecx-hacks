import { io, Socket } from 'socket.io-client';
import { useEffect, useRef } from 'react';
import { API_KEY } from './env';

let socket: Socket | null = null;

/** Singleton socket. Relative URL → Vite proxies /socket.io in dev; same-origin in prod. */
export function getSocket(): Socket {
    if (!socket) {
        socket = io('/', { auth: { token: API_KEY } });
    }
    return socket;
}

/**
 * Subscribe this client to WS rooms. Re-emits on every (re)connect so a dropped
 * connection during the demo re-joins its rooms automatically.
 */
export function useSubscription(opts: { accountId?: string; demo?: boolean }) {
    const { accountId, demo } = opts;
    useEffect(() => {
        const s = getSocket();
        const join = () => s.emit('subscribe', { accountId, demo });
        if (s.connected) join();
        s.on('connect', join);
        return () => {
            s.off('connect', join);
        };
    }, [accountId, demo]);
}

/** Attach a handler to a WS event. Ref-wrapped so callers don't need useCallback. */
export function useSocketEvent<T>(event: string, handler: (payload: T) => void) {
    const ref = useRef(handler);
    ref.current = handler;
    useEffect(() => {
        const s = getSocket();
        const fn = (p: T) => ref.current(p);
        s.on(event, fn);
        return () => {
            s.off(event, fn);
        };
    }, [event]);
}