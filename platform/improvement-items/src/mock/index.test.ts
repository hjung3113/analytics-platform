import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NO_FEATURES, contextCapabilities, groupId, type MenuMeta } from '@ap/contracts';
import { createMockAdapter, getRole, setRole } from '@ap/mock-server';
import { improvementItemsMock, improvementItemsActionsMock, resetItems } from './index';
import { MANAGE_PERMISSION } from '../endpoints';
const menu: MenuMeta = { id: 'improvement-items', group: groupId('improvementItems'), label: { ko: '개선 아이템', en: 'Improvement items' }, description: { ko: '', en: '' }, path: '/improvement-items', permission: 'platform:view', requiresScope: false, context: contextCapabilities(), pageType: 'management', features: NO_FEATURES, pageKeys: [] };
const registry = { menus: [menu] };
const previous = getRole();
beforeEach(() => { setRole('admin'); resetItems(); });
afterEach(() => setRole(previous));
const adapter = () => createMockAdapter({ endpoints: [...improvementItemsMock], actions: [...improvementItemsActionsMock], registry, permissions: ['platform:view', MANAGE_PERMISSION] });
const params = { page: 0, pageSize: 25, sorting: [] };
const id = '13280000-0000-4000-8000-000000000001';
const query = (a: ReturnType<typeof adapter>, endpoint: string, p: object) => a.menuQuery({ endpoint, context: {}, params: p });
const write = (a: ReturnType<typeof adapter>, action: string, input: object, expectedVersion?: string) => a.menuAction({ action: `improvement.${action}`, context: {}, input, idempotencyKey: crypto.randomUUID(), ...(expectedVersion ? { expectedVersion } : {}) });

describe('improvement mock dispatch', () => {
  it('registers all three reads and six writes', () => {
    expect(improvementItemsMock).toHaveLength(3); expect(improvementItemsActionsMock).toHaveLength(6); expect(adapter).not.toThrow();
  });
  it('reads real rows, saved-view filters, target history, missing detail, and errors', async () => {
    const a = adapter();
    const mine = await query(a, 'improvement.items', { ...params, filters: [{ id: 'assignee', op: 'in', value: ['me'] }, { id: 'status', op: 'notIn', value: ['verified', 'dropped'] }] });
    expect(mine).toMatchObject({ outcome: 'ok', data: { total: 3 } });
    const history = await query(a, 'improvement.items', { ...params, targetKind: 'equipment', targetKey: 'EQ-01' });
    expect(history).toMatchObject({ outcome: 'ok', data: { total: 5 } });
    expect(await query(a, 'improvement.itemDetail', { itemNo: 'IM-1' })).toMatchObject({ outcome: 'ok', data: { id } });
    expect(await query(a, 'improvement.itemDetail', { itemId: '13280000-0000-4000-8000-000000000099' })).toMatchObject({ data: null });
    expect(await query(a, 'improvement.items', { ...params, filters: [{ id: 'status', op: 'in', value: ['bad'] }] })).toMatchObject({ outcome: 'error' });
  });
  it.each(['admin', 'viewer'] as const)('serves one-row home count reads for %s using the existing saved-view rule', async role => {
    setRole(role);
    const a = adapter();
    const mine = [{ id: 'assignee', op: 'in', value: ['me'] }, { id: 'status', op: 'notIn', value: ['verified', 'dropped'] }];
    const pending = [{ id: 'assignee', op: 'in', value: ['me'] }, { id: 'status', op: 'in', value: ['done'] }];
    const assigned = await query(a, 'improvement.items', { ...params, pageSize: 1, filters: mine });
    const done = await query(a, 'improvement.items', { ...params, pageSize: 1, filters: pending });
    expect(assigned).toMatchObject({ outcome: role === 'admin' ? 'ok' : 'empty', data: { total: role === 'admin' ? 3 : 0 } });
    expect(done).toMatchObject({ outcome: role === 'admin' ? 'ok' : 'empty', data: { total: role === 'admin' ? 1 : 0 } });
    expect((assigned.data as { rows: unknown[] }).rows).toHaveLength(role === 'admin' ? 1 : 0);
  });
  it('creates, reads detail/events and rejects blank and origin-less items', async () => {
    const a = adapter();
    expect(await write(a, 'itemCreate', { problem: ' ' })).toMatchObject({ outcome: 'invalid' });
    expect(await write(a, 'itemCreate', { problem: 'no origin' })).toMatchObject({ outcome: 'invalid' });
    const res = await write(a, 'itemCreate', { problem: 'new problem', origin: { menuId: 'cycle-time', context: { from: '2026-11-01T00:00', to: '2026-11-05T00:00' } } });
    expect(res).toMatchObject({ outcome: 'ok', data: { itemNo: 6, version: '1' } });
    const created = res.data as { itemId: string };
    expect(await query(a, 'improvement.itemEvents', { itemId: created.itemId })).toMatchObject({ outcome: 'ok', data: { total: 1, rows: [{ eventType: 'created' }] } });
  });
  it('uses CAS, never silently overwrites, and preserves the first update', async () => {
    const a = adapter();
    expect(await write(a, 'itemUpdate', { itemId: id, problem: 'first' }, '1')).toMatchObject({ outcome: 'ok', version: '2' });
    expect(await write(a, 'itemUpdate', { itemId: id, problem: 'second' }, '1')).toMatchObject({ outcome: 'conflict', version: '2' });
    expect(await query(a, 'improvement.itemDetail', { itemId: id })).toMatchObject({ data: { problem: 'first' } });
  });
  it('requires action, action day, fresh effect and reopen/drop reasons', async () => {
    const a = adapter();
    expect(await write(a, 'itemSetStatus', { itemId: id, status: 'done' }, '1')).toMatchObject({ outcome: 'invalid' });
    expect(await write(a, 'itemSetStatus', { itemId: id, status: 'in_progress', action: 'repair' }, '1')).toMatchObject({ outcome: 'ok' });
    expect(await write(a, 'itemSetStatus', { itemId: id, status: 'done' }, '2')).toMatchObject({ outcome: 'invalid' });
    expect(await write(a, 'itemSetStatus', { itemId: id, status: 'done', actionDate: '2026-11-05' }, '2')).toMatchObject({ outcome: 'ok' });
    expect(await write(a, 'itemSetStatus', { itemId: id, status: 'verified' }, '3')).toMatchObject({ outcome: 'invalid' });
    expect(await write(a, 'itemSetStatus', { itemId: id, status: 'verified', effect: { result: 'ineffective' } }, '3')).toMatchObject({ outcome: 'ok' });
    expect(await write(a, 'itemReopen', { itemId: id, reason: '' }, '4')).toMatchObject({ outcome: 'invalid' });
    expect(await write(a, 'itemReopen', { itemId: id, reason: 'review' }, '4')).toMatchObject({ outcome: 'ok' });
    expect(await write(a, 'itemSetStatus', { itemId: id, status: 'dropped' }, '5')).toMatchObject({ outcome: 'invalid' });
    expect(await write(a, 'itemSetStatus', { itemId: id, status: 'dropped', reason: 'duplicate' }, '5')).toMatchObject({ outcome: 'ok' });
  });
  it('answers conflict before row-state judgments, like the server (C2)', async () => {
    const a = adapter();
    expect(await write(a, 'itemSetStatus', { itemId: id, status: 'in_progress', action: 'repair' }, '1')).toMatchObject({ outcome: 'ok', version: '2' });
    // a stale in_progress move against the already moved row carries the current version, not illegal_transition
    expect(await write(a, 'itemSetStatus', { itemId: id, status: 'in_progress', action: 'late' }, '1')).toMatchObject({ outcome: 'conflict', version: '2' });
    // replaying with the current version is judged on the row: a repeat of the status is illegal
    expect(await write(a, 'itemSetStatus', { itemId: id, status: 'in_progress', action: 'late' }, '2')).toMatchObject({ outcome: 'invalid', fieldErrors: [{ path: ['status'], code: 'illegal_transition' }] });
    // a stale reopen against an open row conflicts first as well
    expect(await write(a, 'itemReopen', { itemId: id, reason: 'r' }, '1')).toMatchObject({ outcome: 'conflict', version: '2' });
  });
  it('registers assignment and Quest linking, keeps reads open to viewers, and refuses writes', async () => {
    const a = adapter();
    expect(await write(a, 'itemAssign', { itemId: id, assigneeId: null }, '1')).toMatchObject({ outcome: 'ok' });
    expect(await write(a, 'itemLinkQuest', { itemId: id, questId: 'Q-1', questTitle: 'snapshot' }, '2')).toMatchObject({ outcome: 'ok' });
    setRole('viewer');
    expect(await query(a, 'improvement.items', params)).toMatchObject({ outcome: 'ok' });
    expect(await write(a, 'itemUpdate', { itemId: id, problem: 'no' }, '3')).toMatchObject({ outcome: 'forbidden' });
  });
  it('mirrors the server input schemas: required keys, bounds, codes and nested shapes (C3)', async () => {
    const a = adapter();
    const id2 = '13280000-0000-4000-8000-000000000002';
    // itemAssign without the key is a required error and never clears the stored assignee
    expect(await write(a, 'itemAssign', { itemId: id }, '1')).toMatchObject({ outcome: 'invalid', fieldErrors: [{ path: ['assigneeId'], code: 'required' }] });
    expect(await query(a, 'improvement.itemDetail', { itemId: id })).toMatchObject({ data: { assignee: { id: 'admin' } } });
    // itemLinkQuest without the key pair is required and never unlinks the stored Quest
    expect(await write(a, 'itemLinkQuest', { itemId: id2 }, '1')).toMatchObject({ outcome: 'invalid', fieldErrors: [{ path: ['questId'], code: 'required' }, { path: ['questTitle'], code: 'required' }] });
    expect(await query(a, 'improvement.itemDetail', { itemId: id2 })).toMatchObject({ data: { quest: { id: 'Q-1' } } });
    // a wrong-typed text is required like the server (#1411); a wrong-typed itemId too
    expect(await write(a, 'itemCreate', { problem: 5, targets: [{ kind: 'equipment', externalKey: 'EQ-01', displayName: 'x' }] }))
      .toMatchObject({ outcome: 'invalid', fieldErrors: [{ path: ['problem'], code: 'required' }] });
    expect(await write(a, 'itemCreate', { problem: 'p', targets: [{ kind: 'equipment', externalKey: 'EQ-01', displayName: 5 }] }))
      .toMatchObject({ outcome: 'invalid', fieldErrors: [{ path: ['targets', '0', 'displayName'], code: 'required' }] });
    // an oversized problem is too_long, not malformed
    expect(await write(a, 'itemCreate', { problem: '가'.repeat(501), targets: [{ kind: 'equipment', externalKey: 'EQ-01', displayName: 'x' }] }))
      .toMatchObject({ outcome: 'invalid', fieldErrors: [{ path: ['problem'], code: 'too_long' }] });
    // a nested effect compareLink must be an app-relative path, like the server schema
    expect(await write(a, 'itemSetStatus', { itemId: '13280000-0000-4000-8000-000000000003', status: 'verified', effect: { result: 'effective', compareLink: 'https://evil.example/x' } }, '1'))
      .toMatchObject({ outcome: 'invalid', fieldErrors: [{ path: ['effect', 'compareLink'], code: 'malformed' }] });
    // a repeated (kind, externalKey) target is a duplicate at the second index
    const dup = { kind: 'equipment', externalKey: 'EQ-01', displayName: 'x' };
    expect(await write(a, 'itemCreate', { problem: 'p', targets: [dup, dup] }))
      .toMatchObject({ outcome: 'invalid', fieldErrors: [{ path: ['targets', '1'], code: 'duplicate' }] });
    // an unknown status value is malformed, not illegal_transition
    expect(await write(a, 'itemSetStatus', { itemId: id, status: 'bogus' }, '1')).toMatchObject({ outcome: 'invalid', fieldErrors: [{ path: ['status'], code: 'malformed' }] });
    // explicit nulls stay the clearing operation on a quested row
    expect(await write(a, 'itemLinkQuest', { itemId: id2, questId: null, questTitle: null }, '1')).toMatchObject({ outcome: 'ok' });
    expect(await query(a, 'improvement.itemDetail', { itemId: id2 })).toMatchObject({ data: { quest: null } });
  });
  it('trims targets before the duplicate check and storage, like the server (C3)', async () => {
    const a = adapter();
    const origin = { menuId: 'cycle-time', context: { from: '2026-11-01T00:00', to: '2026-11-05T00:00' } };
    // leading/trailing space and tab collapse before the duplicate check: the second occurrence is the duplicate
    expect(await write(a, 'itemCreate', { problem: 'p', origin, targets: [
      { kind: 'equipment', externalKey: ' EQ-9 ', displayName: 'x' },
      { kind: 'equipment', externalKey: '\tEQ-9', displayName: 'y' },
    ] })).toMatchObject({ outcome: 'invalid', fieldErrors: [{ path: ['targets', '1'], code: 'duplicate' }] });
    // a single padded target is stored trimmed, so its history answers the trimmed key
    const res = await write(a, 'itemCreate', { problem: 'p2', origin, targets: [{ kind: 'equipment', externalKey: ' EQ-10 ', displayName: ' 설비 EQ-10 ' }] });
    expect(res).toMatchObject({ outcome: 'ok' });
    const created = (res.data as { itemId: string }).itemId;
    expect(await query(a, 'improvement.items', { ...params, targetKind: 'equipment', targetKey: 'EQ-10' })).toMatchObject({ outcome: 'ok', data: { total: 1 } });
    expect(await query(a, 'improvement.itemDetail', { itemId: created })).toMatchObject({ outcome: 'ok', data: { targets: [{ kind: 'equipment', externalKey: 'EQ-10', displayName: '설비 EQ-10' }] } });
    // itemUpdate stores the trimmed copy too
    await write(a, 'itemUpdate', { itemId: created, targets: [{ kind: 'process', externalKey: ' PR-1\t', displayName: 'x' }] }, '1');
    expect(await query(a, 'improvement.itemDetail', { itemId: created })).toMatchObject({ outcome: 'ok', data: { targets: [{ kind: 'process', externalKey: 'PR-1', displayName: 'x' }] } });
  });
});

describe('effect comparison persistence', () => {
  const doneId = '13280000-0000-4000-8000-000000000003';
  it.each(['effective', 'ineffective', 'inconclusive'])('stores %s, normalized memo and comparison, and keeps them on reopen', async result => {
    const a = adapter(), compareLink = '/mars/cycle-time?v=1&scopeId=MEM&from=2026-11-04T00%3A00%3A00&to=2026-11-11T00%3A00%3A00';
    expect(await write(a, 'itemSetStatus', { itemId: doneId, status: 'verified', effect: { result, note: '  reviewed  ', compareLink: `  ${compareLink}  ` } }, '1')).toMatchObject({ outcome: 'ok' });
    expect(await query(a, 'improvement.itemDetail', { itemId: doneId })).toMatchObject({ data: { status: 'verified', effectResult: result, effectNote: 'reviewed', effectCompareLink: compareLink } });
    expect(await query(a, 'improvement.itemEvents', { itemId: doneId })).toMatchObject({ data: { rows: [{ changes: { after: { effectResult: result, effectCompareLink: compareLink } } }] } });
    expect(await write(a, 'itemReopen', { itemId: doneId, reason: 'review again' }, '2')).toMatchObject({ outcome: 'ok' });
    expect(await query(a, 'improvement.itemDetail', { itemId: doneId })).toMatchObject({ data: { status: 'done', effectResult: result, effectNote: 'reviewed', effectCompareLink: compareLink } });
  });
  it('clears blank memo and comparison and requires a fresh result after reopening', async () => {
    const a = adapter();
    expect(await write(a, 'itemSetStatus', { itemId: doneId, status: 'verified', effect: { result: 'inconclusive', note: '  ', compareLink: '  ' } }, '1')).toMatchObject({ outcome: 'ok' });
    expect(await query(a, 'improvement.itemDetail', { itemId: doneId })).toMatchObject({ data: { effectNote: null, effectCompareLink: null } });
    expect(await write(a, 'itemReopen', { itemId: doneId, reason: 'review' }, '2')).toMatchObject({ outcome: 'ok' });
    expect(await write(a, 'itemSetStatus', { itemId: doneId, status: 'verified' }, '3')).toMatchObject({ outcome: 'invalid', fieldErrors: [{ path: ['effect'], code: 'required' }] });
  });
  it.each<[Record<string, string>, readonly string[], string]>([
    [{ result: 'other' }, ['effect', 'result'], 'malformed'],
    [{ result: 'effective', note: 'x'.repeat(2001) }, ['effect', 'note'], 'too_long'],
    [{ result: 'effective', compareLink: '/x?q=' + 'x'.repeat(2000) }, ['effect', 'compareLink'], 'too_long'],
    ...['//evil.test/x', '/%09/evil.test/x', '/x#fragment', '/x\\evil'].map(compareLink => [{ result: 'effective', compareLink }, ['effect', 'compareLink'], 'malformed'] as [Record<string, string>, string[], string]),
  ])('rejects invalid effect data %j', async (effect, path, code) => {
    expect(await write(adapter(), 'itemSetStatus', { itemId: doneId, status: 'verified', effect }, '1')).toMatchObject({ outcome: 'invalid', fieldErrors: [{ path, code }] });
  });
});
