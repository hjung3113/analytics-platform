// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createPageNavigation } from './pageNavigation';

describe('detail focus claim (#356)', () => {
  it('does not claim on first load when focus= is already present', () => {
    expect(createPageNavigation('/equipment?v=1&focus=EQ-1').claimsDetailFocus()).toBe(false);
    expect(createPageNavigation('/equipment?v=1&focus=').claimsDetailFocus()).toBe(false);
    expect(createPageNavigation('/equipment?v=1').claimsDetailFocus()).toBe(true);
  });

  it('lets a page or return arrival with focus= keep the title', () => {
    const navigation = createPageNavigation('/?v=1');
    navigation.advance('/equipment?v=1&focus=EQ-1', 'page');
    expect(navigation.claimsDetailFocus()).toBe(false);
    navigation.requestReturn('/equipment?v=1&focus=EQ-1');
    expect(navigation.claimsDetailFocus()).toBe(false);
  });

  it('claims when the same screen or history creates focus=, and not when a filter keeps it', () => {
    const navigation = createPageNavigation('/equipment?v=1');
    navigation.advance('/equipment?v=1&focus=EQ-1');
    expect(navigation.claimsDetailFocus()).toBe(true);
    navigation.advance('/equipment?v=1&focus=EQ-1&note=1');
    expect(navigation.claimsDetailFocus()).toBe(true);
    navigation.advance('/equipment?v=1');
    expect(navigation.claimsDetailFocus()).toBe(true);
    navigation.advance('/equipment?v=1&focus=EQ-1', 'page');
    expect(navigation.claimsDetailFocus()).toBe(false);
    navigation.advance('/equipment?v=1&focus=EQ-1&note=1');
    expect(navigation.claimsDetailFocus()).toBe(false);
    navigation.advance('/equipment?v=1&focus=EQ-1&drillRoom=A', 'drill');
    expect(navigation.claimsDetailFocus()).toBe(true);
  });

  it('keeps an arrival claim across a same-path materialize', () => {
    const navigation = createPageNavigation('/equipment?v=1');
    navigation.advance('/equipment?v=1&focus=EQ-1', 'page');
    navigation.materialize('/equipment?v=1&focus=EQ-1&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00');
    expect(navigation.claimsDetailFocus()).toBe(false);
    navigation.advance('/equipment?v=1&focus=EQ-1&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00&note=1');
    expect(navigation.claimsDetailFocus()).toBe(false);
  });

  it('does not let a mismatched return overwrite the claim', () => {
    const navigation = createPageNavigation('/detail?v=1');
    navigation.advance('/equipment?v=1', 'page');
    expect(navigation.claimsDetailFocus()).toBe(true);
    navigation.requestReturn('/elsewhere?v=1&focus=EQ-1');
    expect(navigation.claimsDetailFocus()).toBe(true);
    expect(navigation.consume('/equipment')).toBeNull();
  });

  // What the provider does on a cross-menu Back/Forward (popstate): pathname changed, so it advances
  // with a `page` request (06 §26) and the carried `focus=` must not claim the detail panel.
  it('treats a cross-menu history step as a page arrival, not a same-screen open', () => {
    const navigation = createPageNavigation('/equipment/EQ-1?v=1');
    navigation.advance('/equipment?v=1&focus=EQ-1', 'page');
    expect(navigation.claimsDetailFocus()).toBe(false);
    expect(navigation.consume('/equipment')).toBe('page');
  });

  it('keeps the same-screen history claim with no pending request', () => {
    const navigation = createPageNavigation('/equipment?v=1');
    navigation.advance('/equipment?v=1&focus=EQ-1');
    expect(navigation.claimsDetailFocus()).toBe(true);
    expect(navigation.consume('/equipment')).toBeNull();
  });
});
