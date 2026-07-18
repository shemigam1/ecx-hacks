import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

/** Route-level guard: validates a Bearer JWT and attaches the AuthPrincipal to the request. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const header: string | undefined = req.headers?.authorization;
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException('missing bearer token');
    try {
      req.principal = this.auth.verifyToken(header.slice(7));
    } catch {
      throw new UnauthorizedException('invalid or expired token');
    }
    return true;
  }
}
