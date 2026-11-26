// @vitest-environment jsdom
import { Suspense } from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider } from '@ap/kernel';
import { createMockAdapter, getRole, setRole } from '@ap/mock-server';
import { EQUIPMENT_AXES } from '../../equipmentAxes';
import { registry } from '../../menus';
import { MOCK_ENDPOINTS } from '../mock-assembly';

vi.mock('@ap/components', async original => {
  const components = await original<typeof import('@ap/components')>();
  return { ...components, PanelWorkspace: ({ panels }: import('@ap/components').PanelWorkspaceProps) =>
    <>{panels.map(panel => <div key={panel.id} data-testid={panel.id}>{panel.render()}</div>)}</> };
});

const previousRole = getRole();
afterEach(() => { cleanup(); setRole(previousRole); window.history.replaceState(null, '', '/'); });

it.each(['PM1', '~none'])('recovers the day drill and closes its added panel read with Modules %s', async checked => {
  setRole('engineer');
  const adapter = createMockAdapter({ equipmentAxes: EQUIPMENT_AXES, endpoints: MOCK_ENDPOINTS, registry, permissions: registry.permissions, latency: 0 });
  const query = vi.spyOn(adapter, 'menuQuery');
  window.history.replaceState(null, '', `/mars/hw-time?v=1&scopeId=MEM&from=2026-09-19T09:00:00&to=2026-09-26T09:00:00&moduleType=PM&drillMotion=Pump&motionBasis=day&module=${checked}&pins=equipmentDays`);
  const Screen = registry.matchRoute('/mars/hw-time')!.menu.component!;
  render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry} equipmentAxes={EQUIPMENT_AXES}><Suspense fallback={null}><Screen params={{}} /></Suspense></PlatformProvider></I18nProvider>);
  expect(await screen.findByText('나누기 기준을 사용할 수 없어 이전 단계로 이동했습니다.')).toBeTruthy();
  expect(new URLSearchParams(window.location.search).has('drillMotion')).toBe(false);
  expect(within(screen.getByTestId('equipmentDays')).getByRole('status')).toBeTruthy();
  expect(query.mock.calls.some(([request]) => request.endpoint === 'hwTime.equipmentDays')).toBe(false);
});
