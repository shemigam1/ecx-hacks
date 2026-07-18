import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../prisma/prisma.module';
import { ApiKeyGuard } from './api-key.guard';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt.guard';
import { AuthController } from './auth.controller';

/**
 * Interim shared-secret gate (ApiKeyGuard, gap #6) + full user auth (gap #7): argon2 DTMF PIN with
 * lockout, phone-OTP → JWT sessions, JwtAuthGuard. The ApiKeyGuard stays as the baseline (also gates
 * voice webhooks via ?k=); JWT layers per-user identity on top.
 */
@Module({
  imports: [
    PrismaModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'dev-steward-jwt-secret',
      signOptions: { expiresIn: '4h' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, { provide: APP_GUARD, useClass: ApiKeyGuard }],
  exports: [AuthService, JwtAuthGuard],
})
export class AuthModule {}
