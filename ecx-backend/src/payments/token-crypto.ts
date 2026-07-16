import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * AES-256-GCM at-rest encryption for electricity tokens (Security Requirements §10).
 * Prototype key: SHA-256 of env `TOKEN_ENC_KEY` (falls back to a dev key). Production wraps a real KMS key.
 * Format: `iv.tag.ciphertext`, all base64.
 */
const KEY = createHash('sha256')
  .update(process.env.TOKEN_ENC_KEY ?? 'dev-only-insecure-token-key-change-me')
  .digest();

export function encryptToken(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join('.');
}

export function decryptToken(blob: string): string {
  const [ivB64, tagB64, encB64] = blob.split('.');
  const decipher = createDecipheriv('aes-256-gcm', KEY, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(encB64, 'base64')), decipher.final()]).toString('utf8');
}
