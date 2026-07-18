import { UnauthorizedException } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard';

function context(opts: { headers?: Record<string, unknown>; query?: Record<string, unknown> }) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers: opts.headers ?? {}, query: opts.query ?? {} }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as any;
}

describe('ApiKeyGuard', () => {
  const KEY = 'dev-steward-key'; // default when INTERNAL_API_KEY unset

  function guard(isPublic: boolean) {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(isPublic) } as any;
    return new ApiKeyGuard(reflector);
  }

  it('allows @Public() routes without a key', () => {
    expect(guard(true).canActivate(context({}))).toBe(true);
  });

  it('rejects a request with no key', () => {
    expect(() => guard(false).canActivate(context({}))).toThrow(UnauthorizedException);
  });

  it('rejects a wrong key', () => {
    expect(() => guard(false).canActivate(context({ headers: { 'x-api-key': 'nope' } }))).toThrow(UnauthorizedException);
  });

  it('accepts the key via x-api-key header', () => {
    expect(guard(false).canActivate(context({ headers: { 'x-api-key': KEY } }))).toBe(true);
  });

  it('accepts the key via ?k= query (voice webhooks)', () => {
    expect(guard(false).canActivate(context({ query: { k: KEY } }))).toBe(true);
  });
});
