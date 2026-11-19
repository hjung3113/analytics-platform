import { describe, expect, it } from 'vitest';
import { resolveOutcomeRecovery } from '../outcomeRecovery';

const period = { from: '2026-09-19T09:00:00', to: '2026-09-26T09:00:00' };
const context = { ...period, scopeId: 'MEM', selection: null, equipmentVerified: true, canSelect: true, canChangePeriod: true };
const affected = { affectedEquipmentIds: ['A'], authorizedEquipmentIds: ['A', 'B'] };

describe('recovery from the reply (#2535)', () => {
  it('excludes only affected IDs from the authorized submitted selection', () => {
    expect(resolveOutcomeRecovery({ outcome: 'error', recovery: affected }, context)).toEqual({ kind: 'exclude', affected: ['A'], selection: ['B'] });
  });

  it.each([
    { affectedEquipmentIds: ['A'] },
    { ...affected, authorizedEquipmentIds: ['A'] },
    { ...affected, affectedEquipmentIds: ['X'] },
  ])('opens conditions when no verified nonempty remainder exists (%j)', recovery => {
    expect(resolveOutcomeRecovery({ outcome: 'error', recovery }, context)).toEqual({ kind: 'conditions' });
  });

  it('opens conditions for a known aggregation failure with no usable recovery metadata', () => {
    expect(resolveOutcomeRecovery({ outcome: 'error', message: 'time_domain_mismatch: A, B' }, context)).toEqual({ kind: 'conditions' });
  });

  it.each(['error', 'timeout'] as const)('opens conditions for a known aggregation refusal with a retry flag (%s)', outcome => {
    expect(resolveOutcomeRecovery({
      outcome, message: 'time_domain_mismatch', recovery: { retryable: true },
    }, context)).toEqual({ kind: 'conditions' });
  });

  it('keeps verified shortening available for a timeout carrying an aggregation refusal', () => {
    expect(resolveOutcomeRecovery({
      outcome: 'timeout', message: 'time_domain_unverified', recovery: { retryable: true, maxHours: 8 },
    }, context)).toEqual({
      kind: 'shorten', from: '2026-09-26T01:00:00', to: period.to, hours: 8, maxHours: 8,
    });
  });

  it('opens conditions for a timeout with a period cap that cannot shorten the submitted period', () => {
    expect(resolveOutcomeRecovery({
      outcome: 'timeout', recovery: { retryable: true, maxHours: 168 },
    }, context)).toEqual({ kind: 'conditions' });
  });

  it('allows retry for a transient timeout', () => {
    expect(resolveOutcomeRecovery({
      outcome: 'timeout', message: 'client_timeout', recovery: { retryable: true },
    }, context)).toEqual({ kind: 'retry' });
  });

  it('keeps a verified shorter range available with exclusion', () => {
    expect(resolveOutcomeRecovery({ outcome: 'error', recovery: { ...affected, maxHours: 8 } }, context)).toEqual({
      kind: 'exclude', affected: ['A'], selection: ['B'],
      shorter: { from: '2026-09-26T01:00:00', to: period.to, hours: 8, maxHours: 8 },
    });
  });

  it.each([
    { ...context, equipmentVerified: false },
    { ...context, canSelect: false },
    { ...context, selection: ['A', 'B'] },
  ])('keeps shortening available when exclusion is unavailable (%j)', unavailable => {
    expect(resolveOutcomeRecovery({ outcome: 'error', recovery: {
      affectedEquipmentIds: ['A'], authorizedEquipmentIds: ['A', 'B', 'X'], maxHours: 12,
    } }, unavailable)).toEqual({
      kind: 'shorten', from: '2026-09-25T21:00:00', to: period.to, hours: 12, maxHours: 12,
    });
  });

  it('does not expand an explicit equipment selection', () => {
    expect(resolveOutcomeRecovery({ outcome: 'error', recovery: affected }, { ...context, selection: ['A', 'C'] })).toEqual({ kind: 'conditions' });
  });

  it.each(['MEM', 'OTHER'])('binds a denied room only for the current site (%s)', site => {
    const deniedScope = { kind: 'site_room' as const, site, room: 'PHOTO' };
    expect(resolveOutcomeRecovery({ outcome: 'forbidden', recovery: { deniedScope } }, context)).toEqual(
      site === 'MEM' ? { kind: 'request', target: deniedScope } : { kind: 'conditions' },
    );
  });

  it('leaves the end of the submitted period in place', () => {
    expect(resolveOutcomeRecovery({ outcome: 'too_large', recovery: { maxHours: 96 } }, context)).toEqual({
      kind: 'shorten', from: '2026-09-25T09:00:00', to: period.to, hours: 24, maxHours: 96,
    });
  });

  it.each([undefined, 0, 168, 200, Infinity])('opens conditions when a shorter period cannot be established (%s)', maxHours => {
    expect(resolveOutcomeRecovery({ outcome: 'too_large', recovery: maxHours === undefined ? undefined : { maxHours } }, context)).toEqual({ kind: 'conditions' });
  });
});
