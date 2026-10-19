import { describe, expect, it } from 'vitest';
import { errorGuidance, userFacingEntries } from './i18n';

const BANNED = /Candidate|Deferred|\bOpen\b|\[from, to\)|초 정렬/;
/** Named exceptions. Empty: no user-facing dictionary entry may match the banned pattern. */
const ALLOWED_KEYS: readonly string[] = [];

describe('contract error copy (#304)', () => {
  it.each([
    ['time_domain_unverified: MEM-PHOTO-0103, MEM-PHOTO-0105', 'time_domain_unverified', 'timeDomainUnverifiedCause', 'timeDomainUnverifiedAction'],
    ['time_domain_mismatch: TD-A, TD-B', 'time_domain_mismatch', 'timeDomainMismatchCause', 'timeDomainMismatchAction'],
  ] as const)('maps %s to cause and action', (message, code, cause, action) => {
    expect(errorGuidance(message)).toEqual({ code, cause, action });
  });

  it.each([
    'time_domain_future: x',
    'Upstream mart query failed',
    undefined,
  ])('maps unknown code %s to the general error', message => {
    expect(errorGuidance(message)).toEqual({ code: null, cause: 'stateErrorCause', action: 'stateErrorAction' });
  });

  it('keeps contract vocabulary out of the user-facing dictionary', () => {
    const hits = userFacingEntries().filter(entry => (BANNED.test(entry.ko) || BANNED.test(entry.en)) && !ALLOWED_KEYS.includes(entry.key));
    expect(hits.map(entry => entry.key)).toEqual([]);
  });

  it('states the unverified time-domain cause in Korean and English', () => {
    const cause = userFacingEntries().find(entry => entry.key === 'timeDomainUnverifiedCause');
    const action = userFacingEntries().find(entry => entry.key === 'timeDomainUnverifiedAction');
    expect(cause?.ko).toContain('함께 집계할 수 없습니다');
    expect(cause?.en.toLowerCase()).toContain('cannot');
    expect(action?.ko).toContain('설비를 좁히거나 기간을 줄이세요');
    expect(action?.en.toLowerCase()).toContain('narrow');
  });

  it('names the recipient of the Correlation ID for the general error action, ko and en (UX-304-02)', () => {
    const action = userFacingEntries().find(entry => entry.key === 'stateErrorAction');
    expect(action?.ko).toContain('다시 시도하세요');
    expect(action?.ko).toContain('시스템 담당자에게');
    expect(action?.ko).toContain('Correlation ID');
    expect(action?.en).toContain('system administrator');
    expect(action?.en).toContain('Correlation ID');
  });
});
