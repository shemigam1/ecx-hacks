import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';

export interface AuthPrincipal {
  userId: string;
  accountId: string;
  role: string;
}

const LOCK_MS = 15 * 60_000;
const OTP_TTL_MS = 5 * 60_000;
const MAX_PIN_ATTEMPTS = 3;

/**
 * AuthModule core (gap #7). Phone channel: argon2 DTMF PIN + 3-strike lockout + trusted-contact
 * notify. Web: phone OTP → JWT session. Supersedes the interim shared-secret guard for user identity.
 * OTP delivery + trusted-contact notify are mocked (logged/evented) — wire real SMS later.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly otps = new Map<string, { code: string; expiresAt: number }>();
  private readonly locks = new Map<string, { attempts: number; lockedUntil?: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly events: EventEmitter2,
  ) {}

  /** Set/rotate a user's DTMF PIN (argon2). */
  async setPin(userId: string, pin: string): Promise<void> {
    if (!/^\d{4,}$/.test(pin)) throw new UnauthorizedException('PIN must be at least 4 digits');
    await this.prisma.user.update({ where: { id: userId }, data: { pinHash: await argon2.hash(pin) } });
  }

  /** Verify a DTMF PIN with lockout. Falls back to a demo PIN when no hash is set (so seeded users work). */
  async verifyPin(userId: string, pin: string): Promise<{ ok: boolean; locked: boolean }> {
    const lock = this.locks.get(userId) ?? { attempts: 0 };
    if (lock.lockedUntil && Date.now() < lock.lockedUntil) return { ok: false, locked: true };

    const user = userId ? await this.prisma.user.findUnique({ where: { id: userId } }) : null;
    const ok = user?.pinHash
      ? await argon2.verify(user.pinHash, pin).catch(() => false)
      : pin === (process.env.VOICE_DEMO_PIN ?? '0000');

    if (ok) {
      this.locks.delete(userId);
      return { ok: true, locked: false };
    }

    lock.attempts += 1;
    if (lock.attempts >= MAX_PIN_ATTEMPTS) {
      lock.lockedUntil = Date.now() + LOCK_MS;
      this.locks.set(userId, lock);
      this.onLockout(userId, user?.phoneMsisdn ?? undefined);
      return { ok: false, locked: true };
    }
    this.locks.set(userId, lock);
    return { ok: false, locked: false };
  }

  /** Owner/trusted-contact web login: request an OTP (mock delivery — returns the code in non-prod). */
  requestOtp(phone: string): { sent: true; devCode?: string } {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    this.otps.set(phone, { code, expiresAt: Date.now() + OTP_TTL_MS });
    this.logger.log(`OTP for ${phone}: ${code} (mock delivery — wire real SMS later)`);
    return process.env.NODE_ENV === 'production' ? { sent: true } : { sent: true, devCode: code };
  }

  async verifyOtp(phone: string, code: string): Promise<{ token: string; principal: AuthPrincipal }> {
    const rec = this.otps.get(phone);
    if (!rec || rec.expiresAt < Date.now() || rec.code !== code) throw new UnauthorizedException('invalid or expired code');
    this.otps.delete(phone);
    const user = await this.prisma.user.findFirst({ where: { phoneMsisdn: phone } });
    if (!user) throw new UnauthorizedException('no account for that phone');
    const account = await this.prisma.account.findFirst({ where: { ownerUserId: user.id } });
    return this.issue(user.id, account?.id ?? '', user.role);
  }

  issue(userId: string, accountId: string, role: string): { token: string; principal: AuthPrincipal } {
    const principal: AuthPrincipal = { userId, accountId, role };
    return { token: this.jwt.sign({ sub: userId, accountId, role }), principal };
  }

  verifyToken(token: string): AuthPrincipal {
    const p = this.jwt.verify<{ sub: string; accountId: string; role: string }>(token);
    return { userId: p.sub, accountId: p.accountId, role: p.role };
  }

  private onLockout(userId: string, phone?: string) {
    this.logger.warn(`Phone channel locked for user ${userId} after ${MAX_PIN_ATTEMPTS} bad PINs`);
    this.events.emit('auth.pin_lockout', { userId, phone }); // TODO: real trusted-contact SMS
  }
}
