// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LayoutDashboard } from 'lucide-react';
import { useState } from 'react';
import { groupId, menuPermission, spaceId, type ApiResponse, type MenuQuery } from '@ap/contracts';
import { createRegistry, I18nProvider, PlatformProvider } from '@ap/kernel';
import { memoryStorage, testAdapter, testSession } from '@ap/kernel/testing';
import { manifests } from '../index';
import { useHwTimeLevel, useHwTimeTrend } from './data';

// The drill, level and trend selections of all four HW Time screens go through these two hooks, so the real hooks run on the real Kernel here.
const registry = createRegistry({
  permissions: [menuPermission('analytics:view')],
  spaces: [{ id: spaceId('mars'), label: { ko: '분석', en: 'Analytics' }, description: { ko: '목적', en: 'Purpose' }, permission: menuPermission('analytics:view'), homeMenuId: 'hw-time-steps' }],
  groups: [{ id: groupId('hwTime'), label: { ko: '동작시간분석', en: 'Operation time' }, icon: LayoutDashboard, space: spaceId('mars') }],
  menus: manifests,
});
const session = testSession(['analytics:view', 'platform:view']);
const ASSESSMENTS = [{ kind: 'collection', state: 'clear' }, { kind: 'processing_delay', state: 'clear' }, { kind: 'coverage', state: 'clear' }] as const;

let held = false;
const releases: Array<() => void> = [];
const adapter = testAdapter({
  session: () => session,
  menuQuery: async (request: MenuQuery): Promise<ApiResponse<unknown>> => {
    if (held) await new Promise<void>(resolve => { releases.push(resolve); });
    const params = request.params as { drillModule?: string; rowIds?: string[] };
    const data = request.endpoint === 'hwTime.trend'
      ? { limits: { maxRows: 8 }, rows: (params.rowIds ?? []).map(id => ({ id, points: [{ at: '2026-09-19', value: 1 }] })) }
      : { series: [], rows: [], totals: { values: {}, total: 0 }, level: params.drillModule ? 1 : 0, limits: { maxRows: 120 }, tag: params.drillModule ?? 'summary' };
    return { outcome: 'ok', data, assessments: [...ASSESSMENTS], trust: null, correlationId: 'fixture' };
  },
});

function Probe() {
  const [module, setModule] = useState<string | undefined>(undefined);
  const [rows, setRows] = useState(['EQ-001.H1']);
  const level = useHwTimeLevel(module ? { drillModule: module } : {});
  const trend = useHwTimeTrend(rows);
  return <>
    <p data-testid="level">{level.status}:{(level.response?.data as { tag?: string } | null)?.tag ?? '-'}</p>
    <p data-testid="trend">{trend.status}:{trend.response?.data ? 'rows' : '-'}</p>
    <button type="button" onClick={() => setModule('PM1')}>drill</button>
    <button type="button" onClick={() => setRows(['EQ-001.H2'])}>row</button>
  </>;
}
const text = (id: string) => screen.getByTestId(id).textContent;

beforeEach(() => {
  held = false; releases.length = 0;
  vi.stubGlobal('localStorage', memoryStorage()); vi.stubGlobal('sessionStorage', memoryStorage());
  window.history.replaceState(null, '', '/hw-time/steps?v=1&scopeId=MEM&from=2026-09-19T09:00:00&to=2026-09-26T09:00:00');
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

async function mount() {
  render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><Probe /></PlatformProvider></I18nProvider>);
  await waitFor(() => { expect(text('level')).toBe('done:summary'); expect(text('trend')).toBe('done:rows'); });
  held = true;
}

describe('HW Time hooks keep the previous result while the drill or the trend rows change (#1365)', () => {
  it('a drill change shows the previous level as refreshing, then the new level', async () => {
    await mount();
    fireEvent.click(screen.getByText('drill'));
    expect(text('level')).toBe('refreshing:summary');
    await act(async () => { releases.forEach(release => release()); });
    await waitFor(() => expect(text('level')).toBe('done:PM1'));
  });

  it('a trend row change shows the previous trend as refreshing', async () => {
    await mount();
    fireEvent.click(screen.getByText('row'));
    expect(text('trend')).toBe('refreshing:rows');
  });

  it('a period change still hides the level', async () => {
    await mount();
    act(() => {
      window.history.pushState(null, '', '/hw-time/steps?v=1&scopeId=MEM&from=2026-09-18T09:00:00&to=2026-09-26T09:00:00');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await waitFor(() => expect(text('level')).toBe('loading:-'));
  });
});
