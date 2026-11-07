import { describe, expect, it } from 'vitest';

import { isUnambiguousSegment, parseRequirementKey, requirementKey } from '../domain/requirement-key.js';

describe('requirement key (log-rules R-c, #1493)', () => {
  it('a module is its key, an event is moduleKey/eventKey, exactly as given', () => {
    expect(requirementKey('SPINDLE')).toBe('SPINDLE');
    expect(requirementKey('SPINDLE', 'START')).toBe('SPINDLE/START');
    expect(requirementKey(' Mixed Case ', ' ev ')).toBe(' Mixed Case / ev ');
  });

  it.each([
    ['SPINDLE', { kind: 'module', moduleKey: 'SPINDLE' }],
    ['SPINDLE/START', { kind: 'event', moduleKey: 'SPINDLE', eventKey: 'START' }],
  ])('parse %s', (key, parsed) => {
    expect(parseRequirementKey(key)).toEqual(parsed);
  });

  it.each(['', '/', 'A/', '/B', 'A/B/C'])('parse refuses %j', (key) => {
    expect(parseRequirementKey(key)).toBeNull();
  });

  it('round-trips both kinds', () => {
    expect(parseRequirementKey(requirementKey('M'))).toEqual({ kind: 'module', moduleKey: 'M' });
    expect(parseRequirementKey(requirementKey('M', 'E'))).toEqual({ kind: 'event', moduleKey: 'M', eventKey: 'E' });
  });

  it('a segment with "/" or an empty segment is ambiguous and requirementKey throws', () => {
    expect(isUnambiguousSegment('A/B')).toBe(false);
    expect(isUnambiguousSegment('')).toBe(false);
    expect(isUnambiguousSegment('A B')).toBe(true);
    expect(() => requirementKey('A/B')).toThrow();
    expect(() => requirementKey('A', 'B/C')).toThrow();
    expect(() => requirementKey('A', '')).toThrow();
  });
});
