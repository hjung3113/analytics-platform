/**
 * Real-instant formatting — the mirror of url.ts formatDateTime. §6.3 wall-clock travels as naive
 * strings and is printed digit-for-digit; timestamps that mean a point in time (epoch ms, ISO-8601
 * with an explicit offset/Z) must go through here so the viewer's time zone is applied instead.
 * Reuses the global-Context codec's error type; adds no React, env, registry or cross-package imports.
 */
import { ContractError } from './url';
import type { Text } from './i18n';

const fail = (code: string, message: string): never => { throw new ContractError(code, message); };

const OFFSET = /(?:[zZ]|[+-]\d{2}:?\d{2})$/;

/** Format a real instant (epoch ms, or ISO-8601 with an explicit offset/Z) with Intl date+time 'short' in
 *  `timeZone` (default: the viewer's). A naive string — formatDateTime's wall-clock domain — is rejected,
 *  so silent UTC-digits-as-local rendering cannot happen. */
export function formatInstant(instant: number | string, lang: keyof Text, timeZone?: string): string {
  if (typeof instant === 'string' && !OFFSET.test(instant)) {
    return fail('invalid_time', `instant: '${instant}' has no offset or Z — naive wall-clock is formatDateTime's domain`);
  }
  const date = new Date(instant);
  if (Number.isNaN(date.getTime())) return fail('invalid_time', 'instant: not a parseable epoch-ms or offset ISO-8601 value');
  return date.toLocaleString(lang === 'ko' ? 'ko-KR' : 'en-US', { dateStyle: 'short', timeStyle: 'short', timeZone });
}
