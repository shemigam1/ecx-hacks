import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Principal } from '../contracts';

/** Injects the authenticated Principal set by the auth guard: `handler(@CurrentPrincipal() p: Principal)`. */
export const CurrentPrincipal = createParamDecorator((_data: unknown, ctx: ExecutionContext): Principal => {
  return ctx.switchToHttp().getRequest().principal;
});
