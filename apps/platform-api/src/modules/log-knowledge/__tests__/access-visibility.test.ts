import { describe, expect, it } from 'vitest';

import {
  type AccessLevel,
  type AccessRuleFact,
  chainVisible,
  levelVisible,
  ruleIsActive,
} from '../domain/access-visibility.js';

const NOW = new Date('2026-11-08T12:00:00Z');
const allow: AccessRuleFact = { effect: 'allow', validUntil: null, revokedAt: null };
const deny: AccessRuleFact = { effect: 'deny', validUntil: null, revokedAt: null };
const internal: AccessLevel = { mode: 'internal', rules: [] };
const restricted: AccessLevel = { mode: 'restricted', rules: [] };
const withRules = (level: AccessLevel, ...rules: AccessRuleFact[]): AccessLevel => ({ ...level, rules });

describe('rule activity', () => {
  it('a rule counts until it is revoked or reaches validUntil', () => {
    expect(ruleIsActive(allow, NOW)).toBe(true);
    expect(ruleIsActive({ ...allow, revokedAt: new Date('2026-11-01T00:00:00Z') }, NOW)).toBe(false);
    expect(ruleIsActive({ ...allow, validUntil: new Date('2026-11-09T00:00:00Z') }, NOW)).toBe(true);
    expect(ruleIsActive({ ...allow, validUntil: new Date('2026-11-08T11:59:59Z') }, NOW)).toBe(false);
    // The expiry instant is the first moment the rule no longer counts.
    expect(ruleIsActive({ ...allow, validUntil: NOW }, NOW)).toBe(false);
  });
});

describe('one level', () => {
  it.each([
    ['internal, no rule', internal, true],
    ['restricted, no rule', restricted, false],
    ['restricted + allow', withRules(restricted, allow), true],
    ['internal + deny', withRules(internal, deny), false],
    ['restricted + allow + deny: deny wins', withRules(restricted, allow, deny), false],
    ['internal + allow + deny: deny wins', withRules(internal, allow, deny), false],
    ['restricted + revoked allow', withRules(restricted, { ...allow, revokedAt: new Date('2026-11-01T00:00:00Z') }), false],
    ['restricted + expired allow', withRules(restricted, { ...allow, validUntil: new Date('2026-11-01T00:00:00Z') }), false],
    ['internal + revoked deny', withRules(internal, { ...deny, revokedAt: new Date('2026-11-01T00:00:00Z') }), true],
    ['internal + expired deny', withRules(internal, { ...deny, validUntil: new Date('2026-11-01T00:00:00Z') }), true],
    ['restricted + expired deny + allow', withRules(restricted, { ...deny, validUntil: new Date('2026-11-01T00:00:00Z') }, allow), true],
  ])('%s → %s', (_name, level, expected) => {
    expect(levelVisible(level, NOW)).toBe(expected);
  });
});

describe('a chain (Model → SW → Item)', () => {
  const levels = { i: internal, r: restricted, ra: withRules(restricted, allow), d: withRules(internal, deny), rd: withRules(restricted, allow, deny) };
  const keys = Object.keys(levels) as (keyof typeof levels)[];
  // Every 3-level combination: visible iff every level is visible on its own (the rule has no other term).
  const combos = keys.flatMap((m) => keys.flatMap((s) => keys.map((i) => [m, s, i] as const)));
  it.each(combos)('model %s / SW %s / item %s', (m, s, i) => {
    const chain = [levels[m], levels[s], levels[i]];
    expect(chainVisible(chain, NOW)).toBe(chain.every((level) => levelVisible(level, NOW)));
  });

  it('a restricted parent hides an internal child; the child allow does not lift it', () => {
    expect(chainVisible([restricted, internal], NOW)).toBe(false);
    expect(chainVisible([restricted, withRules(internal, allow)], NOW)).toBe(false);
    expect(chainVisible([restricted, withRules(restricted, allow)], NOW)).toBe(false);
  });

  it('an allow on every restricted level shows the object; one missing hides it', () => {
    expect(chainVisible([withRules(restricted, allow), withRules(restricted, allow), withRules(restricted, allow)], NOW)).toBe(true);
    expect(chainVisible([withRules(restricted, allow), restricted, withRules(restricted, allow)], NOW)).toBe(false);
  });

  it('an internal chain is visible, a deny anywhere hides it, a model-level allow does not cancel a child deny', () => {
    expect(chainVisible([internal, internal, internal], NOW)).toBe(true);
    expect(chainVisible([internal, internal, withRules(internal, deny)], NOW)).toBe(false);
    expect(chainVisible([withRules(restricted, allow), withRules(internal, deny)], NOW)).toBe(false);
  });

  it('an empty chain is not an object', () => {
    expect(chainVisible([], NOW)).toBe(false);
  });
});
