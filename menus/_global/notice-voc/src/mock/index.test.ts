import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Capability, ContextKey, MenuMeta } from '@ap/contracts';
import { createMockAdapter, getRole, setRole, setScenario, USERS, type RoleId } from '@ap/mock-server';
import { noticeVocMock } from './index';
import { myVocHistoryEndpoint, mySurveyHistoryEndpoint, type MySurveyPage, type MyVocPage } from '../endpoints';

const none: Record<ContextKey, Capability> = {
  time: 'unsupported', roomNames: 'unsupported', condition: 'unsupported', selection: 'unsupported',
  lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported',
};
/** Inline mirror of the voc manifest in '../index.ts' (permission, requiresScope, context). 바꾸면 같이 바꾼다. */
const vocMenu: MenuMeta = {
  id: 'voc', group: 'noticeVoc', label: { ko: 'VOC', en: 'VOC' }, description: { ko: '', en: '' }, path: '/voc',
  permission: 'voc:view', requiresScope: false, pageType: 'management', context: none,
  features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: ['cursor'],
};
const adapter = createMockAdapter({ endpoints: [...noticeVocMock], registry: { menus: [vocMenu] } });

async function myVoc(role: RoleId, cursor: string | null = null) {
  setRole(role);
  const res = await adapter.menuQuery({ endpoint: myVocHistoryEndpoint.id, context: {}, params: { cursor } });
  return { ...res, data: res.data as MyVocPage | null };
}
async function mySurvey(role: RoleId) {
  setRole(role);
  const res = await adapter.menuQuery({ endpoint: mySurveyHistoryEndpoint.id, context: {}, params: {} });
  return { ...res, data: res.data as MySurveyPage | null };
}

let previousRole: RoleId;
beforeEach(() => { previousRole = getRole(); });
afterEach(() => {
  setScenario('normal');
  setRole(previousRole);
});

describe('myVocHistory endpoint (issue #60 → #131: the session actor\'s filed VOCs)', () => {
  it('registers against the voc manifest', () => {
    expect(() => createMockAdapter({ endpoints: [...noticeVocMock], registry: { menus: [vocMenu] } })).not.toThrow();
  });

  it('returns the engineer\'s first window newest-first with the next cursor, trust null and no assessments', async () => {
    const res = await myVoc('engineer');
    expect(res.outcome).toBe('ok');
    expect(res.data?.items.map(i => i.id)).toEqual([
      'e1111111-1111-4111-8111-111111111111',
      'e2222222-2222-4222-8222-222222222222',
    ]);
    expect(res.data?.nextCursor).toBe('mock:engineer:2');
    expect(res.trust).toBeNull();
    expect(res.assessments).toEqual([]);
    expect(res.correlationId).toMatch(/^corr-/);
  });

  it('continues from that cursor with the last row and null nextCursor', async () => {
    const res = await myVoc('engineer', 'mock:engineer:2');
    expect(res.outcome).toBe('ok');
    expect(res.data?.items.map(i => i.displayId)).toEqual(['VOC-M-1003']);
    expect(res.data?.nextCursor).toBeNull();
  });

  it('serves each actor only their own rows: admin ids are disjoint from engineer ids, and viewer is a real empty', async () => {
    const admin = await myVoc('admin');
    const engineer = await myVoc('engineer');
    expect(admin.data?.items.map(i => i.id)).toEqual(['a4444444-4444-4444-8444-444444444444']);
    const adminIds = new Set(admin.data?.items.map(i => i.id));
    expect(engineer.data?.items.every(i => !adminIds.has(i.id))).toBe(true);
    const viewer = await myVoc('viewer');
    expect(viewer.outcome).toBe('empty');
  });

  it('rejects another actor\'s cursor as Invalid cursor without leaking their rows', async () => {
    const res = await myVoc('engineer', 'mock:admin:0');
    expect(res.outcome).toBe('error');
    expect(res.message).toBe('Invalid cursor');
    expect(JSON.stringify(res)).not.toContain('Admin-only ticket');
  });

  // The mock only ever issues offset 2 for the engineer (one full page before 3 rows). Anything else in
  // cursor shape was never issued: 0 would rewind to page 1, 1 is not a page boundary, 0002 is not
  // canonical decimal — all three must be outcome 'error', never a rewind or a shifted window.
  it.each(['mock:engineer:0', 'mock:engineer:1', 'mock:engineer:0002', ''])('rejects the never-issued cursor %j as Invalid cursor, not page 1', async (cursor) => {
    const res = await myVoc('engineer', cursor);
    expect(res.outcome).toBe('error');
    expect(res.message).toBe('Invalid cursor');
    expect(res.data).toBeNull();
  });

  it('forbids a viewer stripped of voc:view even under the error scenario (permission wins)', async () => {
    const permissions = USERS.viewer.permissions;
    USERS.viewer.permissions = permissions.filter(p => p !== 'voc:view');
    try {
      setScenario('error');
      const res = await myVoc('viewer');
      expect(res.outcome).toBe('forbidden');
      expect(res.message).toContain('voc:view');
      expect(res.message).not.toContain('mart');
    } finally {
      USERS.viewer.permissions = permissions;
    }
  });

  it('grades an in-flight request with the role it was sent as', async () => {
    setRole('engineer');
    const pending = adapter.menuQuery({ endpoint: myVocHistoryEndpoint.id, context: {}, params: { cursor: null } });
    setRole('viewer');
    const res = await pending;
    expect(res.outcome).toBe('ok');
    expect((res.data as MyVocPage).items.map(i => i.displayId)).toEqual(['VOC-M-1001', 'VOC-M-1002']);
  });

  it('ignores the mart scenarios (partial, too_large, empty): they do not apply to a non-mart source', async () => {
    for (const s of ['partial', 'too_large', 'empty'] as const) {
      setScenario(s);
      expect((await myVoc('engineer')).outcome).toBe('ok');
    }
  });

  it('projects a row to exactly the seven declared wire fields (no triage_state, no reporter_id)', async () => {
    const res = await myVoc('engineer');
    expect(Object.keys(res.data?.items[0]!).sort()).toEqual(
      ['displayId', 'id', 'managedSystemId', 'openedAt', 'status', 'title', 'updatedAt'],
    );
  });
});

describe('mySurveyHistory endpoint (no source exists yet)', () => {
  it('answers normal, empty, partial, too_large and unknown_status with the declared unknown envelope, never a confirmed zero', async () => {
    for (const s of ['normal', 'empty', 'partial', 'too_large', 'unknown_status'] as const) {
      setScenario(s);
      const res = await mySurvey('engineer');
      expect(res.outcome).toBe('ok');
      expect(res.data).toEqual({ items: [] });
      expect(res.assessments).toEqual([{ kind: 'respondent_history', state: 'unknown', reason: 'source_unavailable' }]);
      expect(res.assessments[0]).not.toHaveProperty('statusSource');
      expect(res.trust).toBeNull();
    }
  });

  it('keeps the error scenario fatal: error with no assessments', async () => {
    setScenario('error');
    const res = await mySurvey('engineer');
    expect(res.outcome).toBe('error');
    expect(res.assessments).toEqual([]);
    expect(res.data).toBeNull();
  });

  it('forbids a role without voc:view, ahead of the error scenario', async () => {
    const permissions = USERS.viewer.permissions;
    USERS.viewer.permissions = permissions.filter(p => p !== 'voc:view');
    try {
      setScenario('error');
      const res = await mySurvey('viewer');
      expect(res.outcome).toBe('forbidden');
      expect(res.message).toContain('voc:view');
    } finally {
      USERS.viewer.permissions = permissions;
    }
  });
});
