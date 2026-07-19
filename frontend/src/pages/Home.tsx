import { Navigate } from 'react-router-dom';
import { getPrincipal, isLoggedIn } from '../lib/authStore';
import { OwnerHome } from './OwnerHome';

/**
 * Role-aware landing. Owners get their account overview; trusted contacts go straight to the
 * approvals inbox (their whole job); everyone else is asked to sign in.
 */
export function Home() {
    if (!isLoggedIn()) return <Navigate to="/login" replace />;
    const role = getPrincipal()?.role;
    if (role === 'OWNER') return <OwnerHome />;
    if (role === 'TRUSTED_CONTACT') return <Navigate to="/approvals" replace />;
    // DELEGATE / unknown: no dedicated home yet — the approvals inbox is the safest default.
    return <Navigate to="/approvals" replace />;
}
