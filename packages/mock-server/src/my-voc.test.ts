import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getRole, setRole, setScenario } from './server';
import { mySurveyHistory, myVocHistory } from './my-voc';
import { USERS, type RoleId } from './world';

let previousRole: RoleId;
beforeEach(() => { previousRole = getRole(); });
afterEach(() => {
  setScenario('normal');
  setRole(previousRole);
});

describe('myVocHistory (issue #60: the session actor\'s filed VOCs)', () => {
  it('returns the engineer\'s first window newest-first with the next cursor, trust null and no assessments', async () => {
    const res = await myVocHistory({}, undefined, { role: 'engineer', latency: 0 });
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
    const res = await myVocHistory({ cursor: 'mock:engineer:2' }, undefined, { role: 'engineer', latency: 0 });
    expect(res.outcome).toBe('ok');
    expect(res.data?.items.map(i => i.displayId)).toEqual(['VOC-M-1003']);
    expect(res.data?.nextCursor).toBeNull();
  });

  it('serves each actor only their own rows: admin ids are disjoint from engineer ids, and viewer is a real empty', async () => {
    const admin = await myVocHistory({}, undefined, { role: 'admin', latency: 0 });
    const engineer = await myVocHistory({}, undefined, { role: 'engineer', latency: 0 });
    expect(admin.data?.items.map(i => i.id)).toEqual(['a4444444-4444-4444-8444-444444444444']);
    const adminIds = new Set(admin.data?.items.map(i => i.id));
    expect(engineer.data?.items.every(i => !adminIds.has(i.id))).toBe(true);
    const viewer = await myVocHistory({}, undefined, { role: 'viewer', latency: 0 });
    expect(viewer.outcome).toBe('empty');
    expect(viewer.data).toBeNull();
  });

  it('rejects another actor\'s cursor as Invalid cursor without leaking their rows', async () => {
    const res = await myVocHistory({ cursor: 'mock:admin:0' }, undefined, { role: 'engineer', latency: 0 });
    expect(res.outcome).toBe('error');
    expect(res.message).toBe('Invalid cursor');
    expect(JSON.stringify(res)).not.toContain('Admin-only ticket');
  });

  // The mock only ever issues offset 2 for the engineer (one full page before 3 rows). Anything else in
  // cursor shape was never issued: 0 would rewind to page 1, 1 is not a page boundary, 0002 is not
  // canonical decimal — all three must be outcome 'error', never a rewind or a shifted window.
  it.each(['mock:engineer:0', 'mock:engineer:1', 'mock:engineer:0002'])('rejects the never-issued cursor %s as Invalid cursor, not page 1', async (cursor) => {
    const res = await myVocHistory({ cursor }, undefined, { role: 'engineer', latency: 0 });
    expect(res.outcome).toBe('error');
    expect(res.message).toBe('Invalid cursor');
    expect(res.data).toBeNull();
  });

  it('treats an empty-string cursor as Invalid cursor, not page 1', async () => {
    const res = await myVocHistory({ cursor: '' }, undefined, { role: 'engineer', latency: 0 });
    expect(res.outcome).toBe('error');
    expect(res.message).toBe('Invalid cursor');
  });

  it('forbids a viewer stripped of voc:view even under the error scenario (permission wins)', async () => {
    const permissions = USERS.viewer.permissions;
    USERS.viewer.permissions = permissions.filter(p => p !== 'voc:view');
    try {
      setScenario('error');
      const res = await myVocHistory({}, undefined, { role: 'viewer', latency: 0 });
      expect(res.outcome).toBe('forbidden');
      expect(res.message).toContain('voc:view');
      expect(res.message).not.toContain('mart');
    } finally {
      USERS.viewer.permissions = permissions;
    }
  });

  it('grades an in-flight request with the role it was sent as', async () => {
    setRole('engineer');
    const pending = myVocHistory({}, undefined, { latency: 60 });
    setRole('viewer');
    const res = await pending;
    expect(res.outcome).toBe('ok');
    expect(res.data?.items.map(i => i.displayId)).toEqual(['VOC-M-1001', 'VOC-M-1002']);
  });

  it('ignores the partial and too_large scenarios: they do not apply to this endpoint', async () => {
    setScenario('partial');
    expect((await myVocHistory({}, undefined, { role: 'engineer', latency: 0 })).outcome).toBe('ok');
    setScenario('too_large');
    expect((await myVocHistory({}, undefined, { role: 'engineer', latency: 0 })).outcome).toBe('ok');
  });

  it('projects a row to exactly the seven declared wire fields (no triage_state, no reporter_id)', async () => {
    const res = await myVocHistory({}, undefined, { role: 'engineer', latency: 0 });
    expect(Object.keys(res.data?.items[0]!).sort()).toEqual(
      ['displayId', 'id', 'managedSystemId', 'openedAt', 'status', 'title', 'updatedAt'],
    );
  });
});

describe('mySurveyHistory (issue #60: no source exists yet)', () => {
  it('answers empty, partial and too_large with the declared unknown envelope, never a confirmed zero', async () => {
    for (const s of ['empty', 'partial', 'too_large'] as const) {
      setScenario(s);
      const res = await mySurveyHistory(undefined, { role: 'engineer', latency: 0 });
      expect(res.outcome).toBe('ok');
      expect(res.data).toEqual({ items: [] });
      expect(res.assessments).toEqual([{ kind: 'respondent_history', state: 'unknown', reason: 'source_unavailable' }]);
      expect(res.assessments[0]).not.toHaveProperty('statusSource');
      expect(res.trust).toBeNull();
      expect(res.correlationId).toMatch(/^corr-/);
    }
  });

  it('keeps the error scenario fatal: error with no assessments', async () => {
    setScenario('error');
    const res = await mySurveyHistory(undefined, { role: 'engineer', latency: 0 });
    expect(res.outcome).toBe('error');
    expect(res.assessments).toEqual([]);
    expect(res.data).toBeNull();
  });

  it('forbids a role without voc:view, ahead of the error scenario', async () => {
    const permissions = USERS.viewer.permissions;
    USERS.viewer.permissions = permissions.filter(p => p !== 'voc:view');
    try {
      setScenario('error');
      const res = await mySurveyHistory(undefined, { role: 'viewer', latency: 0 });
      expect(res.outcome).toBe('forbidden');
      expect(res.message).toContain('voc:view');
    } finally {
      USERS.viewer.permissions = permissions;
    }
  });
});
