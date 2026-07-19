import { ConflictException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';

export interface AuthPrincipal {
  userId: string;
  accountId: string;
  role: string;
  /** Display name for a personal UI greeting. Optional/defaulted so older tokens + other callers still work. */
  name?: string;
}

const LOCK_MS = 15 * 60_000;
const MAX_PIN_ATTEMPTS = 3;

/**
 * AuthModule core (gap #7). One numeric passcode per user (argon2 `pinHash`) authenticates both the
 * voice DTMF flow and web login (phone + passcode → JWT), with a 3-strike lockout + trusted-contact
 * notify. No SMS/OTP dependency. Supersedes the interim shared-secret guard for user identity.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
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
    // A real argon2 hash → verify it. No hash (or a legacy/placeholder non-argon2 value) → accept the
    // demo passcode, so seeded accounts and older rows still work on both web and voice.
    const hasHash = user?.pinHash?.startsWith('$argon2');
    const ok = hasHash
      ? await argon2.verify(user!.pinHash!, pin).catch(() => false)
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

  /**
   * Owner/trusted-contact web login: phone + numeric passcode → JWT. The passcode is the same argon2
   * `pinHash` used by the voice DTMF flow (one code across channels), so this reuses `verifyPin`'s
   * argon2/demo-fallback + 3-strike lockout. No SMS/OTP delivery needed.
   */
  async loginWithPasscode(phone: string, passcode: string): Promise<{ token: string; principal: AuthPrincipal }> {
    const user = await this.prisma.user.findFirst({ where: { phoneMsisdn: phone } });
    if (!user) throw new UnauthorizedException('no account for that phone');

    const { ok, locked } = await this.verifyPin(user.id, passcode);
    if (locked) throw new UnauthorizedException('too many attempts — please wait a few minutes and try again');
    if (!ok) throw new UnauthorizedException('incorrect passcode');

    const account = await this.prisma.account.findFirst({ where: { ownerUserId: user.id } });
    return this.issue(user.id, account?.id ?? '', user.role, user.name);
  }

  /**
   * Owner self-serve onboarding. The owner picks a numeric passcode (stored as an argon2 `pinHash`,
   * the same credential the voice channel uses); we then provision the whole account graph — owner
   * User + Account + an AI-agent Credential with a starter mandate (spend caps, biller allowlist,
   * cosign threshold, channel scope, daytime window) — mirroring the seed's rule shapes so the
   * deterministic policy engine understands them verbatim. Auto-logs the owner in on success.
   *
   * All rows are written via the shared Prisma client; no policy-engine/spine code is touched. NB:
   * trusted-contact→account routing is still global in the orchestrator (prototype), so an added
   * contact can sign in and approve, but scoping per-account is a separate spine change.
   */
  async register(input: {
    name: string;
    phone: string;
    passcode: string;
    monthlyCapKobo: number;
    cosignThresholdKobo: number;
    perTxCapKobo?: number;
    trustedContactName?: string;
    trustedContactPhone?: string;
  }): Promise<{ token: string; principal: AuthPrincipal }> {
    if (!/^\d{4,}$/.test(input.passcode)) {
      throw new ConflictException('your passcode must be at least 4 digits');
    }
    if (await this.prisma.user.findFirst({ where: { phoneMsisdn: input.phone } })) {
      throw new ConflictException('an account already exists for that phone — sign in instead');
    }
    if (input.trustedContactPhone && input.trustedContactPhone === input.phone) {
      throw new ConflictException('your trusted contact must use a different phone number');
    }
    if (input.cosignThresholdKobo > input.monthlyCapKobo) {
      throw new ConflictException('the cosign threshold cannot be higher than the monthly limit');
    }

    const perTx = input.perTxCapKobo ?? input.cosignThresholdKobo ?? input.monthlyCapKobo;
    const billers = await this.prisma.biller.findMany({ select: { id: true } });
    const pinHash = await argon2.hash(input.passcode);

    const { userId, accountId, name } = await this.prisma.$transaction(async (tx) => {
      const owner = await tx.user.create({
        data: { name: input.name.trim(), phoneMsisdn: input.phone, role: 'OWNER', languagePref: 'en', pinHash },
      });
      const account = await tx.account.create({ data: { ownerUserId: owner.id } });

      const cred = await tx.credential.create({
        data: {
          accountId: account.id,
          delegateType: 'AI_AGENT',
          label: `${input.name.trim().split(/\s+/)[0]}'s AI Assistant`,
          status: 'ACTIVE',
        },
      });

      const rules = [
        { ruleType: 'SPEND_CAP_MONTHLY' as const, params: { limit: input.monthlyCapKobo } },
        { ruleType: 'SPEND_CAP_PER_TX' as const, params: { limit: perTx } },
        { ruleType: 'COSIGN_THRESHOLD' as const, params: { threshold: input.cosignThresholdKobo } },
        { ruleType: 'CHANNEL_SCOPE' as const, params: { channels: ['VOICE', 'WHATSAPP', 'WEB'] } },
        { ruleType: 'TIME_WINDOW' as const, params: { startHour: 6, endHour: 22, tz: 'Africa/Lagos' } },
        ...(billers.length ? [{ ruleType: 'BILLER_ALLOWLIST' as const, params: { billerIds: billers.map((b) => b.id) } }] : []),
      ];
      await tx.policyRule.createMany({ data: rules.map((r) => ({ credentialId: cred.id, ...r })) });

      // Optional trusted contact — reuse an existing user with that phone, else create one.
      if (input.trustedContactName && input.trustedContactPhone) {
        const existing = await tx.user.findFirst({ where: { phoneMsisdn: input.trustedContactPhone } });
        if (!existing) {
          await tx.user.create({
            data: { name: input.trustedContactName.trim(), phoneMsisdn: input.trustedContactPhone, role: 'TRUSTED_CONTACT', languagePref: 'en' },
          });
        }
      }

      return { userId: owner.id, accountId: account.id, name: owner.name };
    });

    this.logger.log(`Registered new owner ${name} (${input.phone}) with account ${accountId}`);
    return this.issue(userId, accountId, 'OWNER', name);
  }

  issue(userId: string, accountId: string, role: string, name = ''): { token: string; principal: AuthPrincipal } {
    const principal: AuthPrincipal = { userId, accountId, role, name };
    return { token: this.jwt.sign({ sub: userId, accountId, role, name }), principal };
  }

  verifyToken(token: string): AuthPrincipal {
    const p = this.jwt.verify<{ sub: string; accountId: string; role: string; name?: string }>(token);
    return { userId: p.sub, accountId: p.accountId, role: p.role, name: p.name ?? '' };
  }

  private onLockout(userId: string, phone?: string) {
    this.logger.warn(`Phone channel locked for user ${userId} after ${MAX_PIN_ATTEMPTS} bad PINs`);
    this.events.emit('auth.pin_lockout', { userId, phone }); // TODO: real trusted-contact SMS
  }
}
