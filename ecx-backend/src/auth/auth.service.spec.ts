import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';

function make(user: any = null) {
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue(user), findFirst: jest.fn().mockResolvedValue(user), update: jest.fn().mockResolvedValue({}) },
    account: { findFirst: jest.fn().mockResolvedValue({ id: 'acct1' }) },
  };
  const jwt = new JwtService({ secret: 'test-secret', signOptions: { expiresIn: '1h' } });
  const events = { emit: jest.fn() };
  return { svc: new AuthService(prisma as any, jwt, events as any), prisma, events };
}

describe('AuthService', () => {
  describe('PIN (DTMF)', () => {
    it('accepts the demo PIN when no hash is set', async () => {
      const { svc } = make(null);
      expect((await svc.verifyPin('u1', '0000')).ok).toBe(true);
    });

    it('locks after 3 wrong attempts and notifies the trusted contact', async () => {
      const { svc, events } = make(null);
      await svc.verifyPin('u1', 'xxxx');
      await svc.verifyPin('u1', 'xxxx');
      const third = await svc.verifyPin('u1', 'xxxx');
      expect(third.locked).toBe(true);
      expect(events.emit).toHaveBeenCalledWith('auth.pin_lockout', expect.objectContaining({ userId: 'u1' }));
    });

    it('verifies a real argon2 PIN hash', async () => {
      const { svc } = make({ id: 'u1', pinHash: await argon2.hash('1234') });
      expect((await svc.verifyPin('u1', '1234')).ok).toBe(true);
      expect((await svc.verifyPin('u1', '9999')).ok).toBe(false);
    });
  });

  describe('passcode login → JWT', () => {
    it('issues a verifiable JWT on the correct passcode and rejects a wrong one', async () => {
      const { svc } = make({ id: 'u1', phoneMsisdn: '+2348030000001', role: 'OWNER', pinHash: await argon2.hash('4821') });
      const { token, principal } = await svc.loginWithPasscode('+2348030000001', '4821');
      expect(principal.userId).toBe('u1');
      expect(svc.verifyToken(token).userId).toBe('u1');
      await expect(svc.loginWithPasscode('+2348030000001', '0000')).rejects.toThrow();
    });

    it('accepts the demo passcode for a seeded user with no real hash', async () => {
      const { svc } = make({ id: 'u2', phoneMsisdn: '+2348030000002', role: 'TRUSTED_CONTACT' });
      const { principal } = await svc.loginWithPasscode('+2348030000002', '0000');
      expect(principal.role).toBe('TRUSTED_CONTACT');
    });
  });
});
