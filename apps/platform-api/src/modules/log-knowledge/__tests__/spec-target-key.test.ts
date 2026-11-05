import { describe, expect, it } from 'vitest';

import { type SpecTargetRef, buildTargetKey, parseTargetKey } from '../domain/spec-target-key.js';

describe('spec target key grammar (#1196 c)', () => {
  it.each<[string, SpecTargetRef, string]>([
    ['module', { kind: 'module', module: 'spindle' }, 'spindle'],
    ['event', { kind: 'event', module: 'spindle', event: 'start' }, 'spindle/start'],
    ['field', { kind: 'field', module: 'spindle', event: 'start', field: 'speed' }, 'spindle/start#speed'],
    [
      'relation',
      { kind: 'relation', sourceModule: 'a', sourceEvent: 'b', predicate: 'precedes', targetModule: 'c', targetEvent: 'd' },
      'a/b#precedes#c/d',
    ],
  ])('%s builds and parses back', (_n, ref, key) => {
    expect(buildTargetKey(ref)).toBe(key);
    expect(parseTargetKey(ref.kind, key)).toEqual(ref);
  });

  it.each<[string, SpecTargetRef]>([
    ['module with separators', { kind: 'module', module: 'a/b#c%d' }],
    ['event with separators', { kind: 'event', module: 'a/b', event: '#c%25' }],
    ['field with separators', { kind: 'field', module: 'm#1', event: 'e/2', field: 'f%#/g' }],
    [
      'relation with separators',
      { kind: 'relation', sourceModule: 'a/#', sourceEvent: '%', predicate: 'p#q/r', targetModule: '%2F', targetEvent: 'x' },
    ],
  ])('round-trips %s', (_n, ref) => {
    expect(parseTargetKey(ref.kind, buildTargetKey(ref))).toEqual(ref);
  });

  it('two different refs never share a key (a slash inside a module is not an event separator)', () => {
    expect(buildTargetKey({ kind: 'event', module: 'a/b', event: 'c' })).not.toBe(buildTargetKey({ kind: 'event', module: 'a', event: 'b/c' }));
  });

  it.each([
    ['module', 'a/b'],
    ['module', 'a#b'],
    ['module', ''],
    ['event', 'a'],
    ['event', 'a/b/c'],
    ['event', 'a/b#c'],
    ['field', 'a/b'],
    ['field', 'a/b#'],
    ['relation', 'a/b#p'],
    ['relation', 'a/b#p#c'],
  ] as const)('%s rejects a key of the wrong shape: %s', (kind, key) => {
    expect(parseTargetKey(kind, key)).toBeNull();
  });
});
