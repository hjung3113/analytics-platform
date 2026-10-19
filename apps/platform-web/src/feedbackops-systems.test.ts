import { afterEach, describe, expect, it, vi } from 'vitest';
import { feedbackOpsSlot, FEEDBACKOPS_MANAGED_SYSTEMS } from './feedbackops-systems';
import { SPACES } from './menus';

const F = 'https://feedbackops.example';
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
});

describe('feedbackOpsSlot', () => {
  it.each(['analytics', 'metrics'] as const)('draws four entries for %s, in order, scoped to that space only', space => {
    const entries = feedbackOpsSlot(F).entriesFor(space)!;
    const uuid = FEEDBACKOPS_MANAGED_SYSTEMS[space]!;
    expect(entries.map(entry => entry.id)).toEqual(['voc-create', 'voc', 'task', 'survey']);
    expect(entries.map(entry => entry.label)).toEqual([
      { ko: 'VOC 등록', en: 'Submit VOC' }, { ko: 'VOC', en: 'VOC' }, { ko: 'Task', en: 'Tasks' }, { ko: '설문', en: 'Surveys' },
    ]);
    expect(entries.map(entry => entry.href)).toEqual([
      `${F}/vocs?action=create&managedSystem=${uuid}`,
      `${F}/vocs?view=inbox&managedSystem=${uuid}`,
      `${F}/tasks?managedSystem=${uuid}`,
      `${F}/surveys?managedSystem=${uuid}`,
    ]);
    for (const entry of entries) {
      expect(new URL(entry.href!).searchParams.getAll('managedSystem')).toEqual([uuid]);
      expect(entry.href).not.toContain('managedSystem=all');
    }
  });

  it('carries the page it was drawn on as platformReturn on all four entries (FO ADR-0071)', () => {
    const back = 'https://platform.example/analytics/cycle-time?v=1&scopeId=MEM';
    const entries = feedbackOpsSlot(F).entriesFor('analytics', back)!;
    for (const entry of entries) expect(new URL(entry.href!).searchParams.getAll('platformReturn')).toEqual([back]);
    expect(feedbackOpsSlot(F).overall!.href).toBe(`${F}/home`);
  });

  it('gives a space without a mapping row no block', () => {
    expect(feedbackOpsSlot(F).entriesFor('operations')).toBeNull();
  });

  it('gives a space no block when its mapped value is not a uuid', () => {
    vi.spyOn(FEEDBACKOPS_MANAGED_SYSTEMS as Record<string, string>, 'analytics', 'get').mockReturnValue('MEM');
    expect(feedbackOpsSlot(F).entriesFor('analytics')).toBeNull();
  });

  it.each([
    ['absent', null],
    ['non-https non-loopback', 'http://example.com'],
    ['with a path', 'https://feedbackops.example/app'],
  ])('keeps the four mapped entries but disabled (href null) and hides overall when the origin is %s', (_name, origin) => {
    const slot = feedbackOpsSlot(origin);
    expect(slot.entriesFor('analytics')!.map(entry => entry.href)).toEqual([null, null, null, null]);
    expect(slot.entriesFor('operations')).toBeNull();
    expect(slot.overall).toBeNull();
  });

  it('offers the overall link at /home behind feedbackops:access only when the origin is valid', () => {
    expect(feedbackOpsSlot(F).overall).toEqual({ href: `${F}/home`, permission: 'feedbackops:access' });
    expect(feedbackOpsSlot('http://localhost:5173').overall).toEqual({ href: 'http://localhost:5173/home', permission: 'feedbackops:access' });
  });
});
