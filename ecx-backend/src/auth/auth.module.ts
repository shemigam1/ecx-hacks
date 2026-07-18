import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ApiKeyGuard } from './api-key.guard';

/**
 * Interim auth (gap #6). Registers the ApiKeyGuard globally. Reflector is provided by Nest core.
 * Replace/extend with the full AuthModule (gap #7): OTP/JWT sessions, delegate scopes, argon2 DTMF PIN.
 */
@Module({
  providers: [{ provide: APP_GUARD, useClass: ApiKeyGuard }],
})
export class AuthModule {}
