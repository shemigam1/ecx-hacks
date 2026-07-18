import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthPrincipal } from './auth.service';

/** Injects the JWT-derived principal set by JwtAuthGuard: `handler(@CurrentPrincipal() p: AuthPrincipal)`. */
export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthPrincipal => ctx.switchToHttp().getRequest().principal,
);
