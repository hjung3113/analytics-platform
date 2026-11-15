// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { groupId, menuPermission, spaceId, type MenuQuery } from '@ap/contracts';
import { createRegistry, I18nProvider, PlatformProvider } from '@ap/kernel';
import { memoryStorage, testAdapter, testSession } from '@ap/kernel/testing';
import { manifests } from '../index';
import { useHwTimeFilter } from './useHwTimeFilter';
import { HwTimeFilterContext } from './HwTimeFilterContext';
import { useHwTimeLevel, useHwTimeTrend } from './data';
import { HW_TIME_CARRY_SET } from '../test-support';
const registry = createRegistry({ carrySets: [HW_TIME_CARRY_SET], permissions: [menuPermission('analytics:view')],
  spaces: [{ id: spaceId('mars'), label: { ko: 'MARS', en: 'MARS' }, description: { ko: '분석', en: 'Analysis' }, homeMenuId: 'hw-time' }],
  groups: [{ id: groupId('hwTime'), label: { ko: 'HW Time', en: 'HW Time' }, icon: manifests[0].icon, space: spaceId('mars') }], menus: manifests });
const session = testSession(['analytics:view', 'platform:view']);
const query = vi.fn(async (request: MenuQuery) => ({ outcome: 'ok' as const, data: request.endpoint === 'hwTime.trend'
  ? { rows: [], limits: { maxRows: 8 } }
  : { level: 0 as const, series: ['TR1', 'TR2'].map(id => ({ id, name: id, color: 'chart-blue' })), rows: [{ id: 'EQ-001', equipmentId: 'EQ-001', values: { TR1: 1, TR2: 2 }, total: 3 }], totals: { values: { TR1: 1, TR2: 2 }, total: 3 }, limits: { maxRows: 120 } },
  assessments: [{ kind: 'collection' as const, state: 'clear' as const }, { kind: 'processing_delay' as const, state: 'clear' as const }, { kind: 'coverage' as const, state: 'clear' as const }], trust: null, correlationId: 'synthetic',
}));
const adapter = testAdapter({ session: () => session, menuQuery: query });
function Filter({ children }: { children: ReactNode }) {
  const filter = useHwTimeFilter();
  return <HwTimeFilterContext value={filter}>{children}</HwTimeFilterContext>;
}
function wrapper({ children }: { children: ReactNode }) {
  return <I18nProvider><PlatformProvider adapter={adapter} registry={registry}><Filter>{children}</Filter></PlatformProvider></I18nProvider>;
}
function setup(search: string) {
  query.mockClear();
  vi.stubGlobal('localStorage', memoryStorage());
  window.history.replaceState(null, '', `/mars/hw-time?v=1&scopeId=MEM&from=2026-09-19T09:00:00&to=2026-09-26T09:00:00${search}`);
  return renderHook(() => ({ level: useHwTimeLevel({}), trend: useHwTimeTrend(['EQ-001']) }), { wrapper });
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe('shared filters on real menu queries', () => {
  it('sends the active type on both endpoints and projects checked series with matching totals', async () => {
    const { result } = setup('&moduleType=TR&module=TR2');
    await waitFor(() => expect(result.current.level.response?.data?.series.map(s => s.id)).toEqual(['TR2']));
    expect(result.current.level.response?.data?.rows[0]?.total).toBe(2);
    expect(query.mock.calls.map(([request]) => request.params)).toEqual([{ moduleType: 'TR' }, { rowIds: ['EQ-001'], moduleType: 'TR' }]);
  });
  it.each(['&split=recipe', '&module=~bogus', '&module=~none&module=PM1', '&moduleType=bogus'])('sends no query while a shared key is invalid (%s)', async search => {
    const { result } = setup(search);
    await act(async () => {});
    expect(result.current.level.response).toBeNull();
    expect(query).not.toHaveBeenCalled();
  });
});
