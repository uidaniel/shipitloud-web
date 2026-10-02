// OAuth tokens are encrypted at rest with AES-256-GCM. Key: TOKEN_ENCRYPTION_KEY (32 bytes, hex or base64).
// Format: v1.<iv b64>.<tag b64>.<ciphertext b64>
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

function key(raw = process.env.TOKEN_ENCRYPTION_KEY): Buffer {
  if (!raw) throw new Error('TOKEN_ENCRYPTION_KEY is not set');
  const buf = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (buf.length !== 32) throw new Error('TOKEN_ENCRYPTION_KEY must be 32 bytes');
  return buf;
}

export function encryptToken(plain: string, rawKey?: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(rawKey), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), ct.toString('base64')].join('.');
}

export function decryptToken(sealed: string, rawKey?: string): string {
  const [v, iv, tag, ct] = sealed.split('.');
  if (v !== 'v1' || !iv || !tag || !ct) throw new Error('Unrecognized token format');
  const decipher = createDecipheriv('aes-256-gcm', key(rawKey), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ct, 'base64')), decipher.final()]).toString('utf8');
}
