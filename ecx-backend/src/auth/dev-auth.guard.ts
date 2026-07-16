import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Channel, Principal, Role } from '../contracts';

/**
 * DEV-ONLY stub guard (Seam 4). Resolves a Principal from request headers so Dev A's REST endpoints
 * are protected in the same shape the real guard will use. Dev B replaces this with JWT/OTP + scoped
 * credential resolution in Week 1. NEVER enable this in production wiring.
 *
 *   x-user-id, x-account-id, x-role (OWNER|TRUSTED_CONTACT|DELEGATE), x-channel (VOICE|WHATSAPP|WEB),
 *   x-credential-id (optional)
 */
@Injectable()
export class DevAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const h = req.headers as Record<string, string | undefined>;

    const userId = h['x-user-id'];
    const accountId = h['x-account-id'];
    const role = h['x-role'] as Role | undefined;
    const channel = (h['x-channel'] as Channel | undefined) ?? 'WEB';

    if (!userId || !accountId || !role) {
      throw new UnauthorizedException('dev-auth: missing x-user-id / x-account-id / x-role headers');
    }

    const principal: Principal = { userId, accountId, role, channel, credentialId: h['x-credential-id'] };
    req.principal = principal;
    return true;
  }
}
