// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { LayoutDashboard } from 'lucide-react';
import { groupId, menuPermission, spaceId } from '@ap/contracts';
import { AnalysisSelectionChipZone } from '@ap/components';
import { createRegistry, I18nProvider, PlatformProvider } from '@ap/kernel';
import { testAdapter, testSession } from '@ap/kernel/testing';
import { manifests } from '../../../index';
import type { HwTimeRuns } from '../../../endpoints';
import { useHwTimeFilter } from '../../../shared/useHwTimeFilter';
import { RunQueryPanel } from '../AdditionalPanels';

await vi.hoisted(async () => { (await import('@ap/components/testing/engines')).mockEchartsCanvas(); });

const permission = menuPermission('analytics:view');
const space = spaceId('mars');
const registry = createRegistry({
  permissions: [permission],
  spaces: [{ id: space, label: { ko: '분석', en: 'Analytics' }, description: { ko: '목적', en: 'Purpose' }, permission, homeMenuId: 'hw-time' }],
  groups: [{ id: groupId('hwTime'), label: { ko: '동작시간분석', en: 'Operation time' }, icon: LayoutDashboard, space }],
  menus: manifests,
});
const session = testSession(['analytics:view', 'platform:view']);
const judgement = { value: 3, lower: 2, upper: 4, status: 'normal' } as const;
const data: HwTimeRuns = {
  daily: ['2026-09-23', '2026-09-24', '2026-09-25'].map(day => ({
    id: day, equipmentId: 'MEM-PHOTO-0103', at: `${day}T00:00:00`, moduleId: 'PM1', motion: 'Pump',
    seconds: 3, judgement, motions: { Pump: judgement }, module: judgement,
  })),
  points: [], bounds: [], total: 3, shown: 0,
};
const adapter = testAdapter({ session: () => session,
  menuQuery: async () => ({ outcome: 'ok', data, trust: null, correlationId: 'fixture',
    assessments: [{ kind: 'collection', state: 'clear' }, { kind: 'processing_delay', state: 'clear' }, { kind: 'coverage', state: 'clear' }],
  }),
});

function AnalysisTrend() {
  const filter = useHwTimeFilter();
  return <RunQueryPanel kind="trend" target="PM1/Pump" filter={filter} />;
}

afterEach(() => { cleanup(); window.history.replaceState(null, '', '/'); });

it('publishes a range from the analysis trend panel to the menu URL and chip zone', async () => {
  window.history.replaceState(null, '', '/mars/hw-time?v=1&scopeId=MEM&from=2026-09-23T00:00:00&to=2026-09-26T00:00:00&moduleType=PM&drillMotion=Pump&drillModule=PM1');
  render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}>
    <AnalysisSelectionChipZone />
    <AnalysisTrend />
  </PlatformProvider></I18nProvider>);
  const chart = within(await screen.findByRole('region', { name: '추세' }));
  fireEvent.click(await chart.findByRole('button', { name: '구간 선택' }));
  fireEvent.click(chart.getByRole('button', { name: '선택' }));
  expect(new URLSearchParams(window.location.search).get('trendRange')).toBe('09-23/09-25');
  expect(screen.getByRole('button', { name: '날짜 09-23 – 09-25' })).toBeTruthy();
  expect(chart.queryByRole('group', { name: '시작과 끝으로 구간 선택' })).toBeNull();
});

it('places the trend selection row after both charts at the panel bottom', async () => {
  window.history.replaceState(null, '', '/mars/hw-time?v=1&scopeId=MEM&from=2026-09-23T00:00:00&to=2026-09-26T00:00:00&moduleType=PM&drillMotion=Pump&drillModule=PM1&trendRange=09-23/09-25');
  render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><AnalysisTrend /></PlatformProvider></I18nProvider>);
  const panel = await screen.findByTestId('hw-overview-trend');
  const row = within(panel).getByRole('group', { name: '다음 분석' });
  expect(panel.lastElementChild).toBe(row.parentElement?.parentElement);
  const clear = within(row).getByRole('button', { name: '지우기' });
  const verdict = within(panel).getByRole('region', { name: '일별 HTM 판정 건수' });
  expect(clear.tabIndex).toBe(0);
  expect(verdict.compareDocumentPosition(clear)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
});
