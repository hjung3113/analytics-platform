import { describe, expect, it } from 'vitest';
import { NO_FEATURES, RETURN_TO_KEY, carriesReturnTo, compareAuditEvents, contextCapabilities, isRecord, withoutReturnTo, type AuditEvent, type Capability, type ContextKey } from '@ap/contracts';

// #673: shared @ap/contracts helpers — the manifest defaults every menu index and the gen-menu scaffold share (06 §5), `isRecord`, and the `returnTo` rule (#851).
const ALL_UNSUPPORTED: Record<ContextKey, Capability> = {
  time: 'unsupported', roomNames: 'unsupported', line: 'unsupported', prcGroup: 'unsupported', condition: 'unsupported', selection: 'unsupported',
  lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported',
};

describe('contextCapabilities', () => {
  it('marks every Context key unsupported by default, Line/PRC included (#552)', () => {
    expect(contextCapabilities()).toEqual(ALL_UNSUPPORTED);
    expect(Object.keys(contextCapabilities())).toEqual(Object.keys(ALL_UNSUPPORTED));
  });

  it('overrides only the declared keys and keeps the key order', () => {
    const context = contextCapabilities({ metric: 'apply', time: 'reference', lot: 'unsupported' });
    expect(context).toEqual({ ...ALL_UNSUPPORTED, metric: 'apply', time: 'reference' });
    expect(Object.keys(context)).toEqual(Object.keys(ALL_UNSUPPORTED));
  });

  it('returns a new object per call', () => {
    const a = contextCapabilities();
    const b = contextCapabilities();
    expect(a).not.toBe(b);
    a.time = 'apply';
    expect(b.time).toBe('unsupported');
    expect(contextCapabilities().time).toBe('unsupported');
  });
});

describe('NO_FEATURES', () => {
  it('turns every feature flag off and leaves board absent', () => {
    expect(NO_FEATURES).toEqual({ export: false, savedView: false, annotate: false, compare: false });
    expect('board' in NO_FEATURES).toBe(false);
  });

  it('spreads into a manifest features record that turns one flag on', () => {
    expect({ ...NO_FEATURES, export: true, board: true }).toEqual({ export: true, savedView: false, annotate: false, compare: false, board: true });
  });
});

describe('isRecord', () => {
  it('accepts non-null, non-array objects', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ a: 1 })).toBe(true);
    expect(isRecord(Object.create(null))).toBe(true);
    expect(isRecord(new Date(0))).toBe(true); // no prototype check
  });

  it.each([null, undefined, [], [1], 'x', 1, true, () => {}])('rejects %s', value => {
    expect(isRecord(value)).toBe(false);
  });
});

describe('returnTo is navigation state (#851, ADR-0081 UX-10)', () => {
  it('names the page key once', () => {
    expect(RETURN_TO_KEY).toBe('returnTo');
  });

  it('withoutReturnTo drops every returnTo pair and keeps the rest in order', () => {
    const pairs: [string, string][] = [['tab', 'a'], ['returnTo', '/x'], ['focus', 'f'], ['returnTo', '/y']];
    expect(withoutReturnTo(pairs)).toEqual([['tab', 'a'], ['focus', 'f']]);
    expect(pairs).toHaveLength(4);
  });

  it('carriesReturnTo is true only for a space that carries returnTo', () => {
    expect(carriesReturnTo({ carriedPageKeys: ['managedSystem', 'returnTo'] })).toBe(true);
    expect(carriesReturnTo({ carriedPageKeys: ['managedSystem'] })).toBe(false);
    expect(carriesReturnTo({})).toBe(false);
    expect(carriesReturnTo(null)).toBe(false);
    expect(carriesReturnTo(undefined)).toBe(false);
  });
});

describe('compareAuditEvents', () => {
  const event = (id: string, at: string): AuditEvent => ({ id, at, actor: 'u', action: 'update', source: 'user', target: { type: 'equipment', id: 'e1', scopeId: null } });

  it('puts the later instant first and breaks an equal instant by id ascending, across Z and +09:00 (ADR-0085)', () => {
    // 11:00+09:00 equals 02:00Z, so 'b' ties with 'a' (id ascending) and sits after 'c' (03:00Z); a string compare would put it first.
    const events = [event('b', '2026-09-26T11:00:00+09:00'), event('c', '2026-09-26T03:00:00Z'), event('a', '2026-09-26T02:00:00.000Z'), event('d', '2026-09-26T01:30:00Z')];
    expect([...events].sort(compareAuditEvents).map(e => e.id)).toEqual(['c', 'a', 'b', 'd']);
  });
});
