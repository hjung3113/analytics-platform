// SHA-256 (hex) of a long random credential (API token value, session cookie value). The values are random lookup
// keys, so no slow hash is needed; only this digest is stored.
import { createHash } from 'node:crypto';

export function hashToken(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
