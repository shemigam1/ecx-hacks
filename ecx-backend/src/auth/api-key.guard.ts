import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './public.decorator';

/**
 * Interim shared-secret guard (gap #6, branch fix/auth-leaks). Applied globally (APP_GUARD) so it also
 * covers Dev A's `/payments` test controller without editing spine code. Accepts the key via the
 * `x-api-key` header (web/frontend) OR a `?k=` query param (Africa's Talking voice webhooks, which
 * can't send our header — the key is baked into the callback URLs).
 *
 * This is NOT real auth — it just stops the endpoints being wide open. The full AuthModule (JWT/OTP,
 * argon2 PIN, per-user scopes) is gap #7 and supersedes this.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);
  private readonly key = process.env.INTERNAL_API_KEY ?? 'dev-steward-key';

  constructor(private readonly reflector: Reflector) {
    if (!process.env.INTERNAL_API_KEY) {
      this.logger.warn('INTERNAL_API_KEY not set — using insecure default "dev-steward-key". Set it before any real deployment.');
    }
  }

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest();
    const provided: unknown = req.headers?.['x-api-key'] ?? req.query?.k;
    if (provided !== this.key) {
      throw new UnauthorizedException('missing or invalid API key');
    }
    return true;
  }
}
