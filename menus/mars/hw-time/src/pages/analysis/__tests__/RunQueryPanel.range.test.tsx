// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { LayoutDashboard } from 'lucide-react';
import { groupId, menuPermission, spaceId } from '@ap/contracts';
import { AnalysisSelectionChipZone } from '@ap/components';
import { stubCompactTableGeometry } from '@ap/components/testing';
import { createRegistry, I18nProvider, PlatformProvider } from '@ap/kernel';
import { testAdapter, testSession } from '@ap/kernel/testing';
import { manifests } from '../../../index';
import { MOTION_EQUIPMENT_KEY, type HtmJudgement, type HwTimeRuns } from '../../../endpoints';
import { useHwTimeFilter } from '../../../shared/useHwTimeFilter';
import { RunQueryPanel } from '../AdditionalPanels';

await vi.hoisted(async () => { (await import('@ap/components/testing/engines')).mockEchartsCanvas(); });
beforeAll(() => { HTMLElement.prototype.scrollIntoView ??= vi.fn(); });

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

const trendUrl = '/mars/hw-time?v=1&scopeId=MEM&from=2026-09-23T00:00:00&to=2026-09-26T00:00:00&moduleType=PM&drillMotion=Pump&drillModule=PM1';
const equipment = ['MEM-PHOTO-0103', 'MEM-PHOTO-0105', 'MEM-PHOTO-0107'];
const run = (equipmentId: string, index: number, seconds: number, status: HtmJudgement['status']) => {
  const observation = data.daily[index]!;
  const judgement = { ...observation.judgement, value: seconds, status };
  return { ...observation, id: `${equipmentId}/${observation.at}`, equipmentId, seconds, judgement, motions: { Pump: judgement } };
};

const splitDays = [
  run(equipment[0]!, 0, 24, 'over'), run(equipment[0]!, 1, 3, 'normal'),
  run(equipment[1]!, 0, 1, 'under'), run(equipment[1]!, 1, 19, 'over'),
  run(equipment[2]!, 0, 20, 'over'), run(equipment[2]!, 1, 2.5, 'normal'), run(equipment[2]!, 2, 0.5, 'under'),
];

function StepFourTrend() {
  const filter = useHwTimeFilter();
  return <RunQueryPanel kind="trend" target="PM1/Pump" filter={filter} equipmentSelectionInstanceId="trend" />;
}

let restoreSplitGeometry: (() => void) | undefined;
afterEach(() => { restoreSplitGeometry?.(); restoreSplitGeometry = undefined; });

async function mountSplit(daily: HwTimeRuns['daily'] = splitDays, url = trendUrl) {
  const dailyAdapter = testAdapter({ session: () => session,
    menuQuery: async () => ({ outcome: 'ok', data: { ...data, daily }, trust: null, correlationId: 'split-fixture',
      assessments: [{ kind: 'collection', state: 'clear' }, { kind: 'processing_delay', state: 'clear' }, { kind: 'coverage', state: 'clear' }],
    }),
  });
  restoreSplitGeometry = stubCompactTableGeometry();
  window.history.replaceState(null, '', url);
  render(<I18nProvider><PlatformProvider adapter={dailyAdapter} registry={registry}>
    <AnalysisSelectionChipZone />
    <StepFourTrend />
  </PlatformProvider></I18nProvider>);
  return within(await screen.findByTestId('hw-overview-trend'));
}

function tileIds(grid: HTMLElement) {
  return within(grid).getAllByRole('button').map(tile => tile.getAttribute('aria-label'));
}

it('defaults to one shared-axis tile per equipment with daily HTM status and bounds', async () => {
  const panel = await mountSplit();
  expect(panel.getByRole('radio', { name: '나눠 보기', checked: true })).toBeTruthy();
  const grid = panel.getByRole('grid');
  expect(tileIds(grid)).toEqual(equipment);
  expect(panel.getByRole('radio', { name: '축 공유', checked: true })).toBeTruthy();
  expect(panel.getByRole('radio', { name: '보통', checked: true })).toBeTruthy();
  expect(within(grid).getByRole('button', { name: equipment[0] }).getAttribute('aria-description')).toContain('HTM 상한 초과');
  expect(grid.querySelector('[data-small-multiple-band]')).toBeTruthy();
  expect(panel.queryByRole('region', { name: '일별 HTM 판정 건수' })).toBeNull();
});

it('switches to the existing range-select chart in the overlay', async () => {
  const panel = await mountSplit();
  fireEvent.click(panel.getByRole('radio', { name: '겹쳐 보기' }));
  expect(panel.queryByRole('grid')).toBeNull();
  expect(within(panel.getByRole('region', { name: '추세' })).getByRole('button', { name: '구간 선택' })).toBeTruthy();
  expect(panel.getByRole('radio', { name: '겹쳐 보기', checked: true })).toBe(document.activeElement);
  expect(panel.getByRole('region', { name: '일별 HTM 판정 건수' })).toBeTruthy();
});

it('publishes the existing equipment selection to the URL and chip zone on a tile click', async () => {
  const panel = await mountSplit();
  fireEvent.click(within(panel.getByRole('grid')).getByRole('button', { name: equipment[1] }));
  expect(new URLSearchParams(window.location.search).getAll(MOTION_EQUIPMENT_KEY)).toEqual([equipment[1]]);
  expect(within(screen.getByRole('group', { name: '분석 선택' })).getByRole('button', { name: `설비 ${equipment[1]}` })).toBeTruthy();
});

it('sorts by breached days and breaks ties by maximum daily value', async () => {
  const panel = await mountSplit();
  const grid = panel.getByRole('grid');
  fireEvent.click(panel.getByRole('radio', { name: 'HTM 이탈 많은 순' }));
  expect(tileIds(grid)).toEqual([equipment[2], equipment[1], equipment[0]]);
});

it('opens the same-data table from the one-day split grid', async () => {
  const panel = await mountSplit([run(equipment[0]!, 0, 8, 'over')]);
  expect(panel.getByRole('grid')).toBeTruthy();
  fireEvent.click(panel.getByRole('button', { name: '표로 보기' }));
  const table = within(screen.getByRole('dialog', { name: 'PM1 · Pump 일 평균' })).getByRole('table');
  const row = await within(table).findByRole('row', { name: /MEM-PHOTO-0103/ });
  expect(within(row).getAllByRole('cell').map(cell => cell.textContent)).toEqual([
    equipment[0], '2026-09-23', '8.00', '2.00', '4.00', 'HTM 상한 초과',
  ]);
  expect(within(table).getAllByRole('row')).toHaveLength(2);
});

it.each(['initial split', 'return to split'] as const)('edits a restored year-crossing date chip in %s', async mode => {
  const dates = ['2026-12-31', '2027-01-01', '2027-01-02'];
  const url = trendUrl.replace(/from=[^&]+&to=[^&]+/, 'from=2026-12-31T00:00:00&to=2027-01-03T00:00:00');
  const panel = await mountSplit(data.daily.map((row, index) => ({ ...row, at: `${dates[index]}T00:00:00` })), `${url}&trendRange=12-31/01-01`);
  if (mode === 'return to split') {
    fireEvent.click(panel.getByRole('radio', { name: '겹쳐 보기' }));
    fireEvent.click(panel.getByRole('radio', { name: '나눠 보기' }));
  }
  fireEvent.click(screen.getByRole('button', { name: '날짜 12-31 – 01-01' }));
  const editor = within(screen.getByRole('dialog'));
  expect(editor.getByRole('combobox', { name: '시작' }).textContent).toBe('12-31');
  const end = editor.getByRole('combobox', { name: '끝' });
  fireEvent.keyDown(end, { key: 'Enter' });
  fireEvent.keyDown(await screen.findByRole('option', { name: '01-02' }), { key: 'Enter' });
  expect(end.textContent).toBe('01-02');
  fireEvent.click(editor.getByRole('button', { name: '적용' }));
  expect(new URLSearchParams(window.location.search).get('trendRange')).toBe('12-31/01-02');
});

it.each(['one day', 'final day after a gap'] as const)('draws an HTM band with day width for %s', async scenario => {
  const first = run(equipment[0]!, 0, 3, 'normal');
  const last = run(equipment[0]!, 2, 3, 'normal');
  const daily = scenario === 'one day' ? [first] : [
    first, run(equipment[1]!, 1, 3, 'normal'), { ...last, judgement: { ...last.judgement, upper: 6 } },
  ];
  const panel = await mountSplit(daily);
  const tile = within(panel.getByRole('grid')).getByRole('button', { name: equipment[0] });
  const path = tile.querySelector('[data-small-multiple-band]')?.getAttribute('d') ?? '';
  const segments = Array.from(path.matchAll(/M([\d.]+) [\d.]+H([\d.]+)/g), ([, left, right]) => ({ left: Number(left), right: Number(right) }));
  expect(segments).toHaveLength(scenario === 'one day' ? 1 : 2);
  for (const segment of segments) expect(segment.right).toBeGreaterThan(segment.left);
  if (scenario === 'final day after a gap') {
    expect(segments[0]!.right).toBeLessThan(segments[1]!.left);
    expect(segments[1]!.right - segments[1]!.left).toBeCloseTo(segments[0]!.right - segments[0]!.left);
  }
});

it('keeps the trend display choice out of the URL in either direction', async () => {
  const panel = await mountSplit();
  const search = window.location.search;
  for (const name of ['겹쳐 보기', '나눠 보기']) {
    fireEvent.click(panel.getByRole('radio', { name }));
    expect(panel.getByRole('radio', { name, checked: true })).toBeTruthy();
    expect(window.location.search).toBe(search);
  }
});

it('publishes a range from the analysis trend panel to the menu URL and chip zone', async () => {
  window.history.replaceState(null, '', '/mars/hw-time?v=1&scopeId=MEM&from=2026-09-23T00:00:00&to=2026-09-26T00:00:00&moduleType=PM&drillMotion=Pump&drillModule=PM1');
  render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}>
    <AnalysisSelectionChipZone />
    <AnalysisTrend />
  </PlatformProvider></I18nProvider>);
  const chart = within(await screen.findByRole('region', { name: '추세' }));
  fireEvent.click(await chart.findByRole('button', { name: '구간 선택' }));
  const editor = screen.getByRole('dialog', { name: '시작과 끝으로 구간 선택' });
  fireEvent.click(within(editor).getByRole('button', { name: '선택' }));
  expect(new URLSearchParams(window.location.search).get('trendRange')).toBe('09-23/09-25');
  expect(screen.getByRole('button', { name: '날짜 09-23 – 09-25' })).toBeTruthy();
  expect(screen.queryByRole('dialog', { name: '시작과 끝으로 구간 선택' })).toBeNull();
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
