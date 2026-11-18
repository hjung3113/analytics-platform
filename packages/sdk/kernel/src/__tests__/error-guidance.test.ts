import { describe, expect, it } from 'vitest';
import { errorGuidance, errorGuidanceLabel, userFacingEntries } from '../i18n';

const BANNED = /Candidate|Deferred|\bOpen\b|\[from, to\)|초 정렬/;
/** Named exceptions. Empty: no user-facing dictionary entry may match the banned pattern. */
const ALLOWED_KEYS: readonly string[] = [];

describe('contract error copy (#304)', () => {
  it.each([
    ['time_domain_unverified: MEM-PHOTO-0103, MEM-PHOTO-0105', 'time_domain_unverified', 'timeDomainUnverifiedCause', 'timeDomainUnverifiedAction', false],
    ['time_domain_mismatch: TD-A, TD-B', 'time_domain_mismatch', 'timeDomainMismatchCause', 'timeDomainMismatchAction', false],
    ['customGroup blocked: gone-9 (not-found)', 'customGroup blocked', 'customGroupBlockedCause', 'customGroupBlockedAction', true],
    ['customGroup blocked: g1, g2 (endpoint cannot receive custom-group members; Selection must apply)', 'customGroup blocked', 'customGroupBlockedCause', 'customGroupBlockedAction', true],
    ['customGroup blocked: g1 (Scope MEM is loading)', 'customGroup blocked', 'customGroupBlockedCause', 'customGroupBlockedAction', true],
    ['customGroup expansion blocked: equipment facts could not load (offline)', 'customGroup expansion blocked', 'customGroupExpansionCause', 'customGroupExpansionAction', false],
    ['customGroup expansion blocked: saved groups could not load (offline)', 'customGroup expansion blocked', 'customGroupExpansionCause', 'customGroupExpansionAction', false],
  ] as const)('maps %s to cause and action', (message, code, cause, action, blocked) => {
    expect(errorGuidance(message)).toEqual({ code, cause, action, blocked });
  });

  it.each([
    'time_domain_future: x',
    'Upstream mart query failed',
    undefined,
  ])('maps unknown code %s to the general error', message => {
    expect(errorGuidance(message)).toEqual({ code: null, cause: 'stateErrorCause', action: 'stateErrorAction', blocked: false });
  });

  it.each([
    ['time_domain_unverified', 'sharedOutcomeCannotAggregate'],
    ['time_domain_mismatch', 'sharedOutcomeCannotAggregate'],
    ['customGroup blocked', 'sharedOutcomeBlocked'],
    ['customGroup expansion blocked', 'sharedOutcomeError'],
    [null, 'sharedOutcomeError'],
    ['toString', 'sharedOutcomeError'],
  ] as const)('maps guidance code %s to compact outcome label %s', (code, label) => {
    expect(errorGuidanceLabel(code)).toBe(label);
  });

  it('keeps contract vocabulary out of the user-facing dictionary', () => {
    const hits = userFacingEntries().filter(entry => (BANNED.test(entry.ko) || BANNED.test(entry.en)) && !ALLOWED_KEYS.includes(entry.key));
    expect(hits.map(entry => entry.key)).toEqual([]);
  });

  it('names no single input for a custom-group expansion failure: the saved-group list and the equipment facts both feed it (#2390)', () => {
    const cause = userFacingEntries().find(entry => entry.key === errorGuidance('customGroup expansion blocked: saved groups could not load (offline)').cause);
    expect(cause?.ko).not.toContain('설비 기본 정보');
    expect(cause?.en.toLowerCase()).not.toContain('equipment facts');
  });

  it('states the unverified time-domain cause in Korean and English', () => {
    const cause = userFacingEntries().find(entry => entry.key === 'timeDomainUnverifiedCause');
    const action = userFacingEntries().find(entry => entry.key === 'timeDomainUnverifiedAction');
    expect(cause?.ko).toContain('함께 집계할 수 없습니다');
    expect(cause?.en.toLowerCase()).toContain('cannot');
    expect(action?.ko).toContain('설비를 좁히거나 기간을 줄이세요');
    expect(action?.en.toLowerCase()).toContain('narrow');
  });

  it('names the recipient of the trace number (추적 번호, #1940) for the general error action, ko and en (UX-304-02)', () => {
    const action = userFacingEntries().find(entry => entry.key === 'stateErrorAction');
    expect(action?.ko).toContain('다시 시도하세요');
    expect(action?.ko).toContain('관리자에게');
    expect(action?.ko).toContain('추적 번호');
    expect(action?.en).toContain('system administrator');
    expect(action?.en).toContain('Trace ID');
  });
});
