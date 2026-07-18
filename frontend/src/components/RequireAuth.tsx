import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { isLoggedIn } from '../lib/authStore';

export function RequireAuth({ children }: { children: ReactNode }) {
    const location = useLocation();
    if (!isLoggedIn()) {
        return <Navigate to="/login" replace state={{ from: location.pathname }} />;
    }
    return children;
}