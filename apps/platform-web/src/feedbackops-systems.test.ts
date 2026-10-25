import { afterEach, describe, expect, it, vi } from 'vitest';
import { feedbackOpsSlot, FEEDBACKOPS_MANAGED_SYSTEMS, managedSystemFor } from './feedbackops-systems';
import { SPACES } from './menus';
import type { FeedbackOpsEntry } from '@ap/kernel';
import { spaceId } from '@ap/contracts';

const F = 'https://feedbackops.example';
const hrefOf = (entry: FeedbackOpsEntry) => 'href' in entry ? entry.href : undefined;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

afterEach(() => { vi.restoreAllMocks(); });

describe('FEEDBACKOPS_MANAGED_SYSTEMS (ADR-0045)', () => {
  it('maps analytics and metrics to distinct v4 uuids and leaves operations without a row', () => {
    expect(Object.keys(FEEDBACKOPS_MANAGED_SYSTEMS).sort()).toEqual(['analytics', 'metrics']);
    const values = Object.values(FEEDBACKOPS_MANAGED_SYSTEMS);
    for (const value of values) expect(value).toMatch(UUID);
    expect(new Set(values).size).toBe(values.length);
    for (const space of Object.keys(FEEDBACKOPS_MANAGED_SYSTEMS)) expect(SPACES.some(s => s.id === space)).toBe(true);
  });

  it('keys the map by the space ids SPACES declares: a key that names no declared space fails typecheck (ADR-0072)', () => {
    // @ts-expect-error 'nowhere' is not a space id in SPACES
    const unknown: typeof FEEDBACKOPS_MANAGED_SYSTEMS = { nowhere: 'x' };
    void unknown;
  });

  it('gives every entry the icon the app supplies', () => {
    for (const entry of feedbackOpsSlot(F).entriesFor(spaceId('analytics'))!) expect(entry.icon).toBeDefined();
  });
});

describe('managedSystemFor', () => {
  it.each([
    ['a mapped space', 'analytics', FEEDBACKOPS_MANAGED_SYSTEMS.analytics],
    ['a space without a row', 'operations', null],
    ['an unknown space', 'nowhere', null],
    ['no space', null, null],
  ])('returns the Managed System of %s', (_name, space, expected) => {
    expect(managedSystemFor(space)).toBe(expected);
  });

  it('returns null for a mapped value that is not a uuid', () => {
    vi.spyOn(FEEDBACKOPS_MANAGED_SYSTEMS as Record<string, string>, 'analytics', 'get').mockReturnValue('MEM');
    expect(managedSystemFor('analytics')).toBeNull();
  });
});

describe('feedbackOpsSlot', () => {
  it.each(['analytics', 'metrics'] as const)('draws three entries for %s, in order, scoped to that space only: VOC and Task in the shell, only 설문 as a new-tab link', space => {
    const entries = feedbackOpsSlot(F).entriesFor(spaceId(space))!;
    const uuid = FEEDBACKOPS_MANAGED_SYSTEMS[space]!;
    expect(entries.map(entry => entry.key)).toEqual(['voc', 'task', 'survey']);
    expect(entries.map(entry => entry.label)).toEqual([
      { ko: 'VOC', en: 'VOC' }, { ko: 'Task', en: 'Tasks' }, { ko: '설문', en: 'Surveys' },
    ]);
    expect(entries[0]).toMatchObject({ menuId: 'fo-inbox', page: { managedSystem: uuid } });
    expect(entries[1]).toMatchObject({ menuId: 'fo-task-list', page: { managedSystem: uuid } });
    expect('href' in entries[0]! || 'href' in entries[1]!).toBe(false);
    expect(entries.slice(2).map(hrefOf)).toEqual([`${F}/surveys?managedSystem=${uuid}`]);
    for (const entry of entries.slice(2)) {
      expect(new URL(hrefOf(entry)!).searchParams.getAll('managedSystem')).toEqual([uuid]);
      expect(hrefOf(entry)).not.toContain('managedSystem=all');
    }
  });

  it('carries the page it was drawn on as platformReturn on the new-tab entry (FO ADR-0071)', () => {
    const back = 'https://platform.example/analytics/cycle-time?v=1&scopeId=MEM';
    const entries = feedbackOpsSlot(F).entriesFor(spaceId('analytics'), back)!;
    for (const entry of entries.slice(2)) expect(new URL(hrefOf(entry)!).searchParams.getAll('platformReturn')).toEqual([back]);
    expect(feedbackOpsSlot(F).overall!.href).toBe(`${F}/home`);
  });

  it('gates the whole block on feedbackops:access', () => {
    expect(feedbackOpsSlot(F).permission).toBe('feedbackops:access');
  });

  it('gives a space without a mapping row no block', () => {
    expect(feedbackOpsSlot(F).entriesFor(spaceId('operations'))).toBeNull();
  });

  it('gives a space no block when its mapped value is not a uuid', () => {
    vi.spyOn(FEEDBACKOPS_MANAGED_SYSTEMS as Record<string, string>, 'analytics', 'get').mockReturnValue('MEM');
    expect(feedbackOpsSlot(F).entriesFor(spaceId('analytics'))).toBeNull();
  });

  it.each([
    ['absent', null],
    ['non-https non-loopback', 'http://example.com'],
    ['with a path', 'https://feedbackops.example/app'],
  ])('keeps the three mapped entries, the new-tab one disabled (href null), and hides overall when the origin is %s', (_name, origin) => {
    const slot = feedbackOpsSlot(origin);
    // VOC and Task are in-shell and need no FeedbackOps address; 설문 is disabled.
    const entries = slot.entriesFor(spaceId('analytics'))!;
    expect(entries.map(hrefOf)).toEqual([undefined, undefined, null]);
    expect(entries[0]).toMatchObject({ menuId: 'fo-inbox' });
    expect(entries[1]).toMatchObject({ menuId: 'fo-task-list', page: { managedSystem: FEEDBACKOPS_MANAGED_SYSTEMS.analytics } });
    expect(slot.entriesFor(spaceId('operations'))).toBeNull();
    expect(slot.overall).toBeNull();
  });

  it('offers the overall link at /home behind feedbackops:access only when the origin is valid', () => {
    expect(feedbackOpsSlot(F).overall).toEqual({ href: `${F}/home`, permission: 'feedbackops:access' });
    expect(feedbackOpsSlot('http://localhost:5173').overall).toEqual({ href: 'http://localhost:5173/home', permission: 'feedbackops:access' });
  });
});
