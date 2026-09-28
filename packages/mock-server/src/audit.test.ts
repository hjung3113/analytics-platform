import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ApiResponse, AuditEvent, AuditSortField, AuditTrailPage, AuditTrailQuery } from '@ap/contracts';
import { instantEpochMs } from '@ap/contracts';
import { auditTrail, entityAudit } from './audit';
import { getRole, setRole, setScenario } from './server';
import { AUDIT_EVENTS } from './audit-fixtures';
import { EQUIPMENT, USERS, type RoleId } from './world';

const page = (res: ApiResponse<AuditTrailPage>) => res.data as AuditTrailPage;
const events = (res: ApiResponse<{ events: readonly AuditEvent[] }>) => res.data?.events ?? [];
const ids = (items: readonly AuditEvent[]) => items.map(e => e.id);
const body = (res: ApiResponse<unknown>) => JSON.stringify(res);

let previousRole: RoleId;
beforeEach(() => { previousRole = getRole(); });
afterEach(() => {
  setScenario('normal');
  setRole(previousRole);
});

describe('auditTrail (issue #50: the console audit log)', () => {
  it('pages the newest-first log for admin with trust null, no assessments and a corr- id', async () => {
    const res = await auditTrail({ pageSize: 2 }, undefined, { role: 'admin', latency: 0 });
    expect(res.outcome).toBe('ok');
    expect(ids(page(res).items)).toEqual(['metric:cycle_time:update', 'metric:cycle_time:create']);
    expect(page(res).total).toBeGreaterThan(2);
    expect(res.trust).toBeNull();
    expect(res.assessments).toEqual([]);
    expect(res.correlationId).toMatch(/^corr-/);
  });

  it('keeps every equipment at a canonical Z instant strictly before the first metric event', async () => {
    const equipment: AuditEvent[] = [];
    for (let p = 1; ; p++) {
      const res = await auditTrail({ type: 'equipment', page: p, pageSize: 100 }, undefined, { role: 'admin', latency: 0 });
      expect(res.outcome).toBe('ok');
      equipment.push(...page(res).items);
      if (page(res).items.length < 100) break;
    }
    expect(equipment.length).toBe(AUDIT_EVENTS.filter(e => e.target.type === 'equipment').length);
    for (const event of equipment) {
      expect(event.at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(instantEpochMs(event.at)).toBeLessThan(instantEpochMs('2026-09-20T02:00:00.000Z'));
    }
  });

  it('answers type metric with exactly the three metric rows, and type equipment with none of them', async () => {
    const metric = await auditTrail({ type: 'metric' }, undefined, { role: 'admin', latency: 0 });
    expect(page(metric).total).toBe(3);
    expect(ids(page(metric).items)).toEqual(['metric:cycle_time:update', 'metric:cycle_time:create', 'metric:wafer_move_count:retire']);
    const equipment = await auditTrail({ type: 'equipment' }, undefined, { role: 'admin', latency: 0 });
    for (const id of ['metric:cycle_time:update', 'metric:cycle_time:create', 'metric:wafer_move_count:retire']) {
      expect(ids(page(equipment).items)).not.toContain(id);
    }
  });

  it('makes the global targetId filter and entityAudit return the same metric ids in the same order', async () => {
    const global = await auditTrail({ type: 'metric', targetId: 'cycle_time' }, undefined, { role: 'admin', latency: 0 });
    const detail = await entityAudit({ type: 'metric', id: 'cycle_time', scopeId: null }, undefined, { role: 'admin', latency: 0 });
    expect(detail.outcome).toBe('ok');
    expect(ids(page(global).items)).toEqual(ids(events(detail)));
  });

  it('makes entityAudit for EQUIPMENT[0] equal the global filter, with the row site on every event', async () => {
    const row = EQUIPMENT[0];
    const global = await auditTrail({ type: 'equipment', targetId: row.equipmentId }, undefined, { role: 'admin', latency: 0 });
    const detail = await entityAudit({ type: 'equipment', id: row.equipmentId, scopeId: row.site }, undefined, { role: 'admin', latency: 0 });
    expect(detail.outcome).toBe('ok');
    expect(ids(page(global).items)).toEqual(ids(events(detail)));
    for (const event of events(detail)) expect(event.target.scopeId).toBe(row.site);
  });

  it('gives a retired row a retire event and a live row none', async () => {
    const retired = EQUIPMENT.find(e => e.validTo !== null)!;
    const live = EQUIPMENT.find(e => e.validTo === null)!;
    const retiredEvents = events(await entityAudit({ type: 'equipment', id: retired.equipmentId, scopeId: retired.site }, undefined, { role: 'admin', latency: 0 }));
    const liveEvents = events(await entityAudit({ type: 'equipment', id: live.equipmentId, scopeId: live.site }, undefined, { role: 'admin', latency: 0 }));
    expect(retiredEvents.some(e => e.action === 'retire')).toBe(true);
    expect(liveEvents.some(e => e.action === 'retire')).toBe(false);
  });

  it('applies the window half-open: fromAt includes the create, toAt excludes the update', async () => {
    const res = await auditTrail({ fromAt: '2026-09-20T02:00:00.000Z', toAt: '2026-09-26T02:00:00.000Z' }, undefined, { role: 'admin', latency: 0 });
    expect(res.outcome).toBe('ok');
    expect(ids(page(res).items)).toEqual(['metric:cycle_time:create']);
  });

  it.each([
    ['one-sided fromAt', { fromAt: '2026-09-20T02:00:00.000Z' }],
    ['one-sided toAt', { toAt: '2026-09-26T02:00:00.000Z' }],
    ['naive fromAt', { fromAt: '2026-09-20T02:00:00', toAt: '2026-09-26T02:00:00.000Z' }],
    ['fromAt at or after toAt', { fromAt: '2026-09-26T02:00:00.000Z', toAt: '2026-09-20T02:00:00.000Z' }],
    ['unknown type', { type: 'nope' }],
    ['targetId without type', { targetId: 'cycle_time' }],
    ['empty actor', { actor: '' }],
    ['page 0', { page: 0 }],
    ['pageSize 101', { pageSize: 101 }],
    ['sort outside the union', { sort: { field: 'changes' as AuditSortField, desc: true } }],
    ['unknown key', { scopeId: 'ICH' } as unknown as AuditTrailQuery],
  ])('rejects %s as Invalid audit filter, without echoing a reason', async (_name, query) => {
    const res = await auditTrail(query, undefined, { role: 'admin', latency: 0 });
    expect(res.outcome).toBe('error');
    expect(res.message).toBe('Invalid audit filter');
    expect(body(res)).not.toContain('게시 확정');
  });

  it('answers a page past the end with ok, an empty page and the true total', async () => {
    const total = page(await auditTrail({}, undefined, { role: 'admin', latency: 0 })).total;
    const res = await auditTrail({ page: 1000 }, undefined, { role: 'admin', latency: 0 });
    expect(res.outcome).toBe('ok');
    expect(page(res).items).toEqual([]);
    expect(page(res).total).toBe(total);
  });

  it('answers the empty scenario with empty and null data, and still serves the page under partial and too_large', async () => {
    setScenario('empty');
    const empty = await auditTrail({}, undefined, { role: 'admin', latency: 0 });
    expect(empty.outcome).toBe('empty');
    expect(empty.data).toBeNull();
    setScenario('partial');
    expect((await auditTrail({}, undefined, { role: 'admin', latency: 0 })).outcome).toBe('ok');
    setScenario('too_large');
    expect((await auditTrail({}, undefined, { role: 'admin', latency: 0 })).outcome).toBe('ok');
  });

  it('forbids an engineer ahead of every scenario and filter, leaking no equipment id', async () => {
    setScenario('error');
    const plain = await auditTrail({}, undefined, { role: 'engineer', latency: 0 });
    expect(plain.outcome).toBe('forbidden');
    expect(plain.message).toContain('console:access');
    const filtered = await auditTrail({ type: 'equipment', targetId: 'ICH-PHOTO-0103' }, undefined, { role: 'engineer', latency: 0 });
    expect(filtered.outcome).toBe('forbidden');
    expect(body(filtered)).not.toContain('ICH-PHOTO-0103');
  });

  it('grades an in-flight request with the role it was sent as', async () => {
    setRole('admin');
    const pending = auditTrail({}, undefined, { latency: 60 });
    setRole('engineer'); // no console:access; the pinned role must still decide
    const res = await pending;
    expect(res.outcome).toBe('ok');
    expect(page(res).total).toBeGreaterThan(0);
  });

  it('projects rows to exactly the AuditEvent fields the fixture set (no userId, no triage_state)', async () => {
    const res = await auditTrail({ type: 'metric', pageSize: 100 }, undefined, { role: 'admin', latency: 0 });
    for (const event of page(res).items) {
      expect(Object.keys(event).every(k => ['id', 'at', 'actor', 'action', 'source', 'target', 'changes', 'reason'].includes(k))).toBe(true);
    }
    expect(Object.keys(page(res).items[0])).toEqual(['id', 'at', 'actor', 'action', 'source', 'target', 'changes', 'reason']);
    const sync = events(await entityAudit({ type: 'equipment', id: EQUIPMENT[0].equipmentId, scopeId: EQUIPMENT[0].site }, undefined, { role: 'admin', latency: 0 })).find(e => e.action === 'sync')!;
    expect(Object.keys(sync)).toEqual(['id', 'at', 'actor', 'action', 'source', 'target']);
  });
});

describe('entityAudit (issue #50: the destination audit read)', () => {
  it('serves an engineer a granted-room equipment audit and gates scope and room otherwise', async () => {
    const granted = events(await entityAudit({ type: 'equipment', id: 'ICH-PHOTO-0103', scopeId: 'ICH' }, undefined, { role: 'engineer', latency: 0 }));
    expect(granted.length).toBeGreaterThan(0);
    // Same id under another granted site is a miss, never a cross-site hit (same as getEntity).
    const cross = await entityAudit({ type: 'equipment', id: 'ICH-PHOTO-0103', scopeId: 'CJU' }, undefined, { role: 'engineer', latency: 0 });
    expect(cross.outcome).toBe('empty');
    // A real id in a CJU room the engineer does not hold is a room miss; the body leaks no changes value.
    const cju = EQUIPMENT.find(e => e.site === 'CJU' && !USERS.engineer.grants.CJU.includes(e.room))!;
    const room = await entityAudit({ type: 'equipment', id: cju.equipmentId, scopeId: 'CJU' }, undefined, { role: 'engineer', latency: 0 });
    expect(room.outcome).toBe('forbidden');
    expect(room.message).toBe('No grant for equipment');
    expect(body(room)).not.toContain(cju.chamberType);
    // A site the engineer holds nothing in gets the scope message.
    const scope = await entityAudit({ type: 'equipment', id: 'ICH-PHOTO-0103', scopeId: 'XIA' }, undefined, { role: 'engineer', latency: 0 });
    expect(scope.outcome).toBe('forbidden');
    expect(scope.message).toBe('No grant for scope XIA');
  });

  it('treats a null equipment scope as the checkScope unknown path, not a cross-site hit', async () => {
    const res = await entityAudit({ type: 'equipment', id: 'ICH-PHOTO-0103', scopeId: null }, undefined, { role: 'engineer', latency: 0 });
    expect(res.outcome).toBe('forbidden');
    expect(res.message).toBe('Unknown scope null');
  });

  it('lets a viewer read a metric audit, forbids equipment, and rejects a scoped metric ref', async () => {
    const metric = await entityAudit({ type: 'metric', id: 'cycle_time', scopeId: null }, undefined, { role: 'viewer', latency: 0 });
    expect(metric.outcome).toBe('ok');
    expect(ids(events(metric))).toEqual(['metric:cycle_time:update', 'metric:cycle_time:create']);
    const equipment = await entityAudit({ type: 'equipment', id: 'ICH-PHOTO-0103', scopeId: 'ICH' }, undefined, { role: 'viewer', latency: 0 });
    expect(equipment.outcome).toBe('forbidden');
    expect(equipment.message).toBe('No permission equipment:view');
    const scoped = await entityAudit({ type: 'metric', id: 'cycle_time', scopeId: 'ICH' }, undefined, { role: 'viewer', latency: 0 });
    expect(scoped.outcome).toBe('error');
    expect(scoped.message).toBe('Metric audit has no scope');
  });

  it('errors on an unknown entity type ahead of the permission check', async () => {
    const res = await entityAudit({ type: 'notice', id: 'n-1', scopeId: null }, undefined, { role: 'viewer', latency: 0 });
    expect(res.outcome).toBe('error');
    expect(res.message).toBe('Unknown entity type');
    expect(res.data).toBeNull();
  });
});
