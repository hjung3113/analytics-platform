import { describe, expect, it } from 'vitest';
import { NO_FEATURES, contextCapabilities, isRecord, type Capability, type ContextKey } from '@ap/contracts';

// #673: shared @ap/contracts helpers — the manifest defaults every menu index and the gen-menu scaffold share (06 §5), and `isRecord`.
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
