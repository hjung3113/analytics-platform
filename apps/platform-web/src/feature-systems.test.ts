import { afterEach, describe, expect, it, vi } from 'vitest';
import { featureSlot, FEATURE_MANAGED_SYSTEMS, managedSystemFor } from './feature-systems';
import { SPACES } from './menus';
import { spaceId } from '@ap/contracts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

afterEach(() => { vi.restoreAllMocks(); });

describe('FEATURE_MANAGED_SYSTEMS (ADR-0045)', () => {
  it('maps mars and bravo to distinct v4 uuids and leaves operations without a row', () => {
    expect(Object.keys(FEATURE_MANAGED_SYSTEMS).sort()).toEqual(['bravo', 'mars']);
    const values = Object.values(FEATURE_MANAGED_SYSTEMS);
    for (const value of values) expect(value).toMatch(UUID);
    expect(new Set(values).size).toBe(values.length);
    for (const space of Object.keys(FEATURE_MANAGED_SYSTEMS)) expect(SPACES.some(s => s.id === space)).toBe(true);
  });

  it('keys the map by the space ids SPACES declares: a key that names no declared space fails typecheck (ADR-0072)', () => {
    // @ts-expect-error 'nowhere' is not a space id in SPACES
    const unknown: typeof FEATURE_MANAGED_SYSTEMS = { nowhere: 'x' };
    void unknown;
  });

  it('gives every entry the icon the app supplies', () => {
    for (const entry of featureSlot().entriesFor(spaceId('mars'))!) expect(entry.icon).toBeDefined();
  });
});

describe('managedSystemFor', () => {
  it.each([
    ['a mapped space', 'mars', FEATURE_MANAGED_SYSTEMS.mars],
    ['a space without a row', 'operations', null],
    ['an unknown space', 'nowhere', null],
    ['no space', null, null],
  ])('returns the Managed System of %s', (_name, space, expected) => {
    expect(managedSystemFor(space)).toBe(expected);
  });

  it('returns null for a mapped value that is not a uuid', () => {
    vi.spyOn(FEATURE_MANAGED_SYSTEMS as Record<string, string>, 'mars', 'get').mockReturnValue('MEM');
    expect(managedSystemFor('mars')).toBeNull();
  });
});

describe('featureSlot', () => {
  it.each(['mars', 'bravo'] as const)('draws three entries for %s, in order, scoped to that space only: VOC, Task and 설문 all in the shell', space => {
    const entries = featureSlot().entriesFor(spaceId(space))!;
    const uuid = FEATURE_MANAGED_SYSTEMS[space]!;
    expect(entries.map(entry => entry.key)).toEqual(['voc', 'task', 'survey']);
    expect(entries.map(entry => entry.label)).toEqual([
      { ko: 'VOC', en: 'VOC' }, { ko: 'Task', en: 'Tasks' }, { ko: '설문', en: 'Surveys' },
    ]);
    expect(entries[0]).toMatchObject({ menuId: 'inbox', page: { managedSystem: uuid } });
    expect(entries[1]).toMatchObject({ menuId: 'task-list', page: { managedSystem: uuid } });
    expect(entries[2]).toMatchObject({ menuId: 'survey-management', page: { managedSystem: uuid } });
  });

  it('gates the whole block on features:access', () => {
    expect(featureSlot().permission).toBe('features:access');
  });

  it('gives a space without a mapping row no block', () => {
    expect(featureSlot().entriesFor(spaceId('operations'))).toBeNull();
  });

  it('gives a space no block when its mapped value is not a uuid', () => {
    vi.spyOn(FEATURE_MANAGED_SYSTEMS as Record<string, string>, 'mars', 'get').mockReturnValue('MEM');
    expect(featureSlot().entriesFor(spaceId('mars'))).toBeNull();
  });
});
