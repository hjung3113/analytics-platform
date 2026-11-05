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
  it('registers assignment and Quest linking, keeps reads open to viewers, and refuses writes', async () => {
    const a = adapter();
    expect(await write(a, 'itemAssign', { itemId: id, assigneeId: null }, '1')).toMatchObject({ outcome: 'ok' });
    expect(await write(a, 'itemLinkQuest', { itemId: id, questId: 'Q-1', questTitle: 'snapshot' }, '2')).toMatchObject({ outcome: 'ok' });
    setRole('viewer');
    expect(await query(a, 'improvement.items', params)).toMatchObject({ outcome: 'ok' });
    expect(await write(a, 'itemUpdate', { itemId: id, problem: 'no' }, '3')).toMatchObject({ outcome: 'forbidden' });
  });
});
