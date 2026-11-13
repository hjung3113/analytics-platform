import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { spaceId } from '@ap/contracts';
import { featureSlot, managedSystemFor, useComposeDefaultStatus } from './feature-systems';
import { spaceSystems } from './space-systems';
import { SPACES, registry } from './menus';
import { createAssembly, type Assembly } from '#platform-assembly';

/** The mock assembly's answer (ADR-0009: tests reach `src/dev/**` only through the assembly). */
const MOCK_SPACE_SYSTEMS = await ((await createAssembly({ registry })) as Assembly).spaceSystems!();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MARS = MOCK_SPACE_SYSTEMS.links.find((link) => link.spaceId === 'mars')!.managedSystemId;
const BRAVO = MOCK_SPACE_SYSTEMS.links.find((link) => link.spaceId === 'bravo')!.managedSystemId;
const PLATFORM = MOCK_SPACE_SYSTEMS.platformManagedSystemId!;
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** The page-wide store in a known state: ready with `data`, or pending when `data` is null. */
async function load(data: typeof MOCK_SPACE_SYSTEMS | null, identity = 'session') {
  spaceSystems.reset();
  if (data === null) { spaceSystems.start([identity], () => new Promise(() => undefined)); return; }
  spaceSystems.start([identity], async () => data);
  await flush();
}
afterEach(() => { spaceSystems.reset(); });

describe('mock space systems', () => {
  it('maps every feedbackTracking space to distinct v4 uuids, declared, plus a 「플랫폼」 id', () => {
    const tracked = SPACES.filter((space) => 'feedbackTracking' in space && space.feedbackTracking).map((space) => String(space.id)).sort();
    expect(MOCK_SPACE_SYSTEMS.links.map((link) => link.spaceId).sort(), 'one src/dev/mock-space-systems.ts row per feedbackTracking space (#1905)').toEqual(tracked);
    const ids = [...MOCK_SPACE_SYSTEMS.links.map((link) => link.managedSystemId), PLATFORM];
    for (const id of ids) expect(id).toMatch(UUID);
    expect(new Set(ids).size).toBe(ids.length);
    expect(MOCK_SPACE_SYSTEMS.links.every((link) => link.declared)).toBe(true);
  });
});

describe('managedSystemFor', () => {
  it('is null for everything until the store is ready (not ready → null)', async () => {
    await load(null);
    expect(managedSystemFor('mars')).toBeNull();
    expect(managedSystemFor(null)).toBeNull();
  });

  it.each([
    ['a declared space', 'mars', MARS],
    ['another declared space', 'bravo', BRAVO],
    ['a space without a link', 'operations', null],
    ['an unknown space', 'nowhere', null],
    ['no space (home, 소통, 내 활동, the shell): 「플랫폼」', null, PLATFORM],
  ])('returns the Managed System of %s', async (_name, space, expected) => {
    await load(MOCK_SPACE_SYSTEMS);
    expect(managedSystemFor(space)).toBe(expected);
  });

  it('gives a disconnected (declared=false) space no system', async () => {
    await load({ ...MOCK_SPACE_SYSTEMS, links: [{ spaceId: 'mars', managedSystemId: MARS, declared: false }] });
    expect(managedSystemFor('mars')).toBeNull();
    expect(managedSystemFor(null)).toBe(PLATFORM);
  });

  it('has no default without a 「플랫폼」 system on the server', async () => {
    await load({ ...MOCK_SPACE_SYSTEMS, platformManagedSystemId: null });
    expect(managedSystemFor(null)).toBeNull();
  });

  it('forgets the old session at once on a session change', async () => {
    await load(MOCK_SPACE_SYSTEMS, 'one');
    spaceSystems.start(['two'], () => new Promise(() => undefined));
    expect(managedSystemFor('mars')).toBeNull();
    expect(managedSystemFor(null)).toBeNull();
  });
});

describe('featureSlot', () => {
  it('draws nothing until the store is ready', async () => {
    await load(null);
    expect(featureSlot().entriesFor(spaceId('mars'))).toBeNull();
  });

  it.each(['mars', 'bravo'] as const)('draws three entries for %s, in order, scoped to that space only: VOC, Task and 설문 all in the shell', async (space) => {
    await load(MOCK_SPACE_SYSTEMS);
    const entries = featureSlot().entriesFor(spaceId(space))!;
    const uuid = space === 'mars' ? MARS : BRAVO;
    expect(entries.map((entry) => entry.key)).toEqual(['voc', 'task', 'survey']);
    expect(entries.map((entry) => entry.label)).toEqual([
      { ko: 'VOC', en: 'VOC' }, { ko: 'Task', en: 'Tasks' }, { ko: '설문', en: 'Surveys' },
    ]);
    expect(entries[0]).toMatchObject({ menuId: 'inbox', page: { managedSystem: uuid } });
    expect(entries[1]).toMatchObject({ menuId: 'task-list', page: { managedSystem: uuid } });
    expect(entries[2]).toMatchObject({ menuId: 'survey-management', page: { managedSystem: uuid } });
    for (const entry of entries) expect(entry.icon).toBeDefined();
  });

  it('gates the whole block on features:access', () => {
    expect(featureSlot().permission).toBe('features:access');
  });

  it('gives a space without a link no block, and 「플랫폼」 draws no block in any space', async () => {
    await load(MOCK_SPACE_SYSTEMS);
    expect(featureSlot().entriesFor(spaceId('operations'))).toBeNull();
  });

  it('gives a disconnected space no block', async () => {
    await load({ ...MOCK_SPACE_SYSTEMS, links: [{ spaceId: 'mars', managedSystemId: MARS, declared: false }] });
    expect(featureSlot().entriesFor(spaceId('mars'))).toBeNull();
  });
});

describe('useComposeDefaultStatus (the rail VOC 등록 form blocks its submit until ready)', () => {
  it('follows the store: pending → ready, and a failed load → failed', async () => {
    await load(null);
    const { result } = renderHook(() => useComposeDefaultStatus());
    expect(result.current).toBe('pending');
    await act(async () => { await load(MOCK_SPACE_SYSTEMS); });
    expect(result.current).toBe('ready');
    await act(async () => { spaceSystems.reset(); spaceSystems.start(['broken'], () => Promise.reject(new Error('down'))); await flush(); });
    expect(result.current).toBe('failed');
  });

  it('retries a failed load when the form next opens (the hook mounts with the form)', async () => {
    const source = vi.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValue(MOCK_SPACE_SYSTEMS);
    spaceSystems.reset();
    spaceSystems.start(['retry'], source);
    await flush();
    expect(spaceSystems.getSnapshot().status).toBe('failed');
    const { result } = renderHook(() => useComposeDefaultStatus());
    await act(async () => { await flush(); });
    expect(source).toHaveBeenCalledTimes(2);
    expect(result.current).toBe('ready');
    expect(managedSystemFor(null)).toBe(PLATFORM);
  });

  it('does not reload a store that is already ready', async () => {
    const source = vi.fn(async () => MOCK_SPACE_SYSTEMS);
    spaceSystems.reset();
    spaceSystems.start(['ready'], source);
    await flush();
    renderHook(() => useComposeDefaultStatus());
    await act(async () => { await flush(); });
    expect(source).toHaveBeenCalledTimes(1);
  });
});
