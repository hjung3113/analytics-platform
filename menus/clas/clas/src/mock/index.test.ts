import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { emptyGlobal, parseDateTime, type Capability, type ContextKey, type MenuMeta } from '@ap/contracts';
import { createMockAdapter, EQUIPMENT, getRole, setRole } from '@ap/mock-server';
import { clasMock, operationTimeMock } from './index';
import { operationTimeEndpoint, type OperationTimeData } from '../endpoints';

/**
 * Minimal inline MenuMeta mirroring the 'operation-time' manifest in '../index.ts'
 * (permission, requiresScope, context). Importing '../index' from 'src/mock/**' is lint-banned,
 * so this test restates the registration-relevant fields the adapter validates against.
 * manifest('../index.ts')를 바꾸면 여기도 같이 바꾼다.
 */
const none: Record<ContextKey, Capability> = {
  time: 'unsupported', roomNames: 'unsupported', line: 'unsupported', prcGroup: 'unsupported', condition: 'unsupported', selection: 'unsupported',
  lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported',
};
const menu: MenuMeta = {
  id: 'operation-time', group: 'clas',
  label: { ko: '설비 동작시간', en: 'Equipment operation time' }, description: { ko: '', en: '' },
  path: '/clas/operation-time', permission: 'analytics:view', requiresScope: true,
  context: { ...none, time: 'apply', roomNames: 'apply' }, pageType: 'analysis',
  features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: ['eqp'],
};
const adapter = createMockAdapter({ endpoints: [...clasMock], registry: { menus: [menu] } });
const context = { scopeId: 'MEM', from: '2026-09-25T09:00:00', to: '2026-09-26T09:00:00', roomNames: ['PHOTO', 'ETCH'] };

const previousRole = getRole();
beforeEach(() => { setRole('engineer'); });
afterEach(() => { setRole(previousRole); });

describe('clas operation time mock', () => {
  it.each(['null period', 'empty Scope', 'zero duration'] as const)('returns empty data for %s', reason => {
    const data = operationTimeMock.handle({
      context: { ...emptyGlobal, ...context, ...(reason === 'null period' ? { from: null, to: null } : reason === 'zero duration' ? { to: context.from } : {}) },
      equipment: reason === 'empty Scope' ? [] : EQUIPMENT.slice(0, 6), params: { eqp: '' }, actor: 'engineer',
    });
    expect(operationTimeMock.isEmpty?.(data)).toBe(true);
    expect(data).toEqual({ ranking: [], equipmentId: null, lanes: [] });
  });

  it('ranks Scope equipment by operation time and shows the top one when none is chosen', async () => {
    const response = await adapter.menuQuery({ endpoint: operationTimeEndpoint.id, params: { eqp: '' }, context });
    expect(response.outcome).toBe('ok');
    const data = response.data as OperationTimeData;
    expect(data.ranking.length).toBeGreaterThan(0);
    expect(data.ranking.length).toBeLessThanOrEqual(30);
    expect(data.ranking.every(row => row.equipmentId.startsWith('MEM-'))).toBe(true);
    expect(data.ranking.map(row => row.minutes)).toEqual([...data.ranking.map(row => row.minutes)].sort((a, b) => b - a));
    expect(data.equipmentId).toBe(data.ranking[0].equipmentId);
    expect(data.lanes.map(lane => lane.id)).toEqual(['LL1', 'TM', 'CH1', 'CH2', 'CH3', 'LL2']);
  });

  it('keeps segments inside the requested period', () => {
    const data = operationTimeMock.handle({ context: { ...emptyGlobal, ...context }, equipment: EQUIPMENT.slice(0, 6), params: { eqp: '' }, actor: 'engineer' });
    const from = parseDateTime(context.from, 'from').getTime();
    const to = parseDateTime(context.to, 'to').getTime();
    for (const segment of data.lanes.flatMap(lane => lane.segments)) {
      expect(segment.start).toBeGreaterThanOrEqual(from);
      expect(segment.end).toBeGreaterThan(segment.start);
      expect(segment.end).toBeLessThanOrEqual(to);
    }
  });

  it('shows the chosen equipment only when it is in Scope', () => {
    const equipment = EQUIPMENT.slice(0, 6);
    const pick = equipment[3].equipmentId;
    const chosen = operationTimeMock.handle({ context: { ...emptyGlobal, ...context }, equipment, params: { eqp: pick }, actor: 'engineer' });
    expect(chosen.equipmentId).toBe(pick);
    const outside = operationTimeMock.handle({ context: { ...emptyGlobal, ...context }, equipment, params: { eqp: 'NOT-IN-SCOPE' }, actor: 'engineer' });
    expect(outside.equipmentId).toBe(outside.ranking[0].equipmentId);
  });
});
