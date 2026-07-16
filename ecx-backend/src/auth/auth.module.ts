import { Module } from '@nestjs/common';
import { DevAuthGuard } from './dev-auth.guard';

/**
 * Owned by Dev B. Week 0: dev-stub guard only (Seam 4).
 * Week 1: owner phone+OTP / email-pass JWT, delegate scoped tokens, DTMF PIN verify + lockout.
 */
@Module({
  providers: [DevAuthGuard],
  exports: [DevAuthGuard],
})
export class AuthModule {}
