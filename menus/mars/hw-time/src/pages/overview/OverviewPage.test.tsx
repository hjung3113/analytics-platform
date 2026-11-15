// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '@ap/kernel/testing';
import type { ApiResponse, MenuQuery } from '@ap/contracts';
import type { HwTimeMatrix } from '../../endpoints';
import { answer, renderOverview, requests, settle } from './test-support';

beforeEach(() => { requests.length = 0; vi.stubGlobal('localStorage', memoryStorage()); vi.stubGlobal('sessionStorage', memoryStorage()); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });
const chart = (id: string) => JSON.parse(screen.getByTestId(id).textContent!);

describe('HW Time overview View', () => {
  it('shows parallel Module/Motion check lists and sums checked Motion averages in both charts', async () => {
    await renderOverview();
    expect(screen.getByText('통계 미제공')).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Recipe/PPID' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('tree', { name: 'Module' })).toBeTruthy();
    const motions = screen.getByRole('tree', { name: 'Motion' });
    expect(chart('hw-overview-matrix').cells[0].value).toBe(20);
    fireEvent.click(within(motions).getByRole('checkbox', { name: /Chuck/ }));
    await waitFor(() => expect(chart('hw-overview-matrix').cells[0].value).toBe(18));
    expect(chart('hw-overview-bars').series.map((s: { id: string }) => s.id)).not.toContain('Chuck');
    expect(chart('hw-overview-bars').series[0].points[0][0]).toBe('EQ-001 · PM1');
    expect(chart('hw-overview-bars').startAlign).toBe(false);
    fireEvent.click(within(screen.getByRole('tree', { name: 'Module' })).getByRole('checkbox', { name: /PM2/ }));
    await waitFor(() => expect(chart('hw-overview-matrix').xLabels).toEqual(['PM1']));
    expect(chart('hw-overview-bars').series[0].points).toHaveLength(2);
  });

  it('passes heatmap row focus to the SDK bar scroll/highlight API without storing it in the URL', async () => {
    await renderOverview();
    fireEvent.click(screen.getByRole('button', { name: 'focus EQ-002 PM2' }));
    expect(chart('hw-overview-bars')).toMatchObject({ activeCategory: 'EQ-002 · PM2', revealActive: true, rowPitch: 28 });
    expect(window.location.search).not.toContain('row=');
    fireEvent.click(within(screen.getByRole('tree', { name: 'Module' })).getByRole('checkbox', { name: /PM2/ }));
    await waitFor(() => expect(chart('hw-overview-bars').activeCategory).toBeNull());
  });

  it('passes server judgements to the SDK: equipment row groups, out-of-bound bar pieces and heatmap cells only (#2326)', async () => {
    const judged = (request: MenuQuery): ApiResponse<unknown> => {
      const response = answer(request);
      if (request.endpoint !== 'hwTime.matrix') return response;
      const data = structuredClone(response.data) as HwTimeMatrix;
      const [first] = data.cells;
      first.motions.Chuck = { value: 9, lower: 3, upper: 4, status: 'over' };
      first.motions.Dechuck = { value: 1, lower: 3, upper: 4, status: 'under' };
      first.module = { value: 20, lower: null, upper: null, status: 'over' };
      return { ...response, data };
    };
    await renderOverview('', judged);
    const bars = chart('hw-overview-bars');
    expect(bars.rowGroups).toEqual({ header: '설비', byCategory: [
      ['EQ-001 · PM1', { group: 'EQ-001', label: 'PM1' }], ['EQ-001 · PM2', { group: 'EQ-001', label: 'PM2' }],
      ['EQ-002 · PM1', { group: 'EQ-002', label: 'PM1' }], ['EQ-002 · PM2', { group: 'EQ-002', label: 'PM2' }],
    ] });
    // Recipe-unsplit pieces are not emphasised; only the server's over/under pieces are.
    expect(bars.statuses).toEqual(['Chuck@EQ-001 · PM1:danger', 'Dechuck@EQ-001 · PM1:warning']);
    const cells = chart('hw-overview-matrix').cells as { x: string; y: string; status?: { tone: string; label: string } }[];
    expect(cells.find(c => c.x === 'PM1' && c.y === 'EQ-001')!.status!.tone).toBe('danger');
    // `판정 불가` stays in the caption above and in the Motion table; a mark on every cell would drown the out-of-bound ones (advisor).
    expect(cells.filter(c => c.status).map(c => `${c.y} · ${c.x}:${c.status!.tone}`)).toEqual(['EQ-001 · PM1:danger']);
    // The heatmap mark and the bar marks read the same matrix cell: a marked cell is exactly a row with a marked bar piece.
    expect(new Set(bars.statuses.map((s: string) => s.split('@')[1]!.split(':')[0]))).toEqual(new Set(cells.filter(c => c.status).map(c => `${c.y} · ${c.x}`)));
    expect(screen.getByText(/Recipe 미구분 — 판정 불가/)).toBeTruthy();
    // Colour starts at 0 so every cell is filled by its size; a min–max ramp turned the common value white.
    expect(chart('hw-overview-matrix').scale).toEqual({ type: 'sequential', domain: [0, Math.max(...cells.map(c => (c as unknown as { value: number }).value))] });
    expect(screen.queryByText(/HTM 강조는 준비 중/)).toBeNull();
    // Unchecking the over Motion leaves the cell with the under piece the bar row still shows, not the all-Motion roll-up.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Chuck' }));
    await settle();
    const narrowed = chart('hw-overview-matrix').cells as { x: string; y: string; status?: { tone: string } }[];
    expect(narrowed.filter(c => c.status).map(c => `${c.y} · ${c.x}:${c.status!.tone}`)).toEqual(['EQ-001 · PM1:warning']);
    expect(chart('hw-overview-bars').statuses).toEqual(['Dechuck@EQ-001 · PM1:warning']);
  });

  it('switches between stacked totals and SDK Motion lanes locally while retaining status, focus and quiet emphasis', async () => {
    await renderOverview();
    const before = window.location.search;
    const series = chart('hw-overview-bars').series;
    fireEvent.click(screen.getByRole('button', { name: 'focus EQ-002 PM2' }));
    const status = screen.getByRole('status').textContent;
    fireEvent.click(screen.getByRole('radio', { name: '동작별 정렬' }));
    expect(chart('hw-overview-bars')).toMatchObject({ startAlign: true, emphasisFocus: 'none', activeCategory: 'EQ-002 · PM2', series });
    expect(screen.getByRole('status').textContent).toBe(status);
    fireEvent.click(screen.getByRole('radio', { name: '누적' }));
    expect(chart('hw-overview-bars')).toMatchObject({ startAlign: false, emphasisFocus: 'none', activeCategory: 'EQ-002 · PM2', series });
    expect(window.location.search).toBe(before);
    expect(requests.map(r => r.endpoint)).toEqual(['hwTime.matrix']);
  });

  it('drills to server statuses and run tabs with shared local settings, the SDK scatter and the SDK trend', async () => {
    await renderOverview();
    fireEvent.click(screen.getByRole('button', { name: 'drill EQ-001 · PM1' }));
    const table = await screen.findByRole('region', { name: 'PM1 · Motion' });
    expect(await within(table).findByText('HTM 하한 미달')).toBeTruthy();
    expect(within(table).getByText('HTM 상한 초과')).toBeTruthy();
    fireEvent.click(within(table).getByRole('button', { name: 'Chuck 회차 보기' }));
    await screen.findByTestId('hw-overview-runs');
    expect(screen.getByText('표본 2 / 전체 576 · 기준 밖 점 전부 포함')).toBeTruthy();
    // #2332: categorical x per equipment · Module, equipment groups, the server's per-category bounds, status on out-of-bound points only.
    const scatter = chart('hw-overview-runs-scatter');
    expect(scatter.xCategories.order).toEqual(['EQ-001 · PM1', 'EQ-002 · PM1']);
    expect(scatter.xCategories.groups.byCategory).toEqual([['EQ-001 · PM1', { group: 'EQ-001', label: 'PM1' }], ['EQ-002 · PM1', { group: 'EQ-002', label: 'PM1' }]]);
    expect(scatter.xCategories.bounds).toEqual([['EQ-001 · PM1', { lower: 3, upper: 4 }], ['EQ-002 · PM1', { lower: 3, upper: 4 }]]);
    expect(scatter.points.map((p: { id: string; category: string; y: number; group: string; status?: { tone: string } }) => [p.id, p.category, p.y, p.group, p.status?.tone]))
      .toEqual([['run-0', 'EQ-001 · PM1', 9, 'EQ-001', 'danger'], ['run-1', 'EQ-002 · PM1', 2, 'EQ-002', 'warning']]);
    expect(screen.queryByText(/산점도는 SDK 조각/)).toBeNull();
    expect(screen.getByRole('group', { name: '이 패널만' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: '가로축' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: '색' }).textContent).toBe('설비');
    expect(screen.getByRole('combobox', { name: '값' }).textContent).toBe('고른 Motion 회차 시간');
    const before = requests.map(r => r.endpoint);
    fireEvent.mouseDown(screen.getByRole('tab', { name: '추세' }), { button: 0, ctrlKey: false });
    // #2333: one line per equipment on a time axis, status rings on out-of-bound daily means only, no band across two equipment.
    const trend = chart('hw-overview-runs-trend');
    expect(trend.series.map((s: { id: string }) => s.id)).toEqual(['EQ-001', 'EQ-002']);
    expect(trend.statuses).toEqual(['EQ-001@2026-09-19T00:00:00:danger', 'EQ-002@2026-09-19T00:00:00:warning']);
    expect(trend.emphasisFocus).toBe('none');
    expect(trend.bounds).toEqual([]);
    expect(screen.queryByText(/추세 차트는 SDK 조각/)).toBeNull();
    expect(screen.queryByRole('combobox', { name: '가로축' })).toBeNull();
    expect(screen.getByRole('combobox', { name: '색' }).textContent).toBe('설비');
    expect(requests.map(r => r.endpoint)).toEqual(before);
    fireEvent.mouseDown(screen.getByRole('tab', { name: '분포' }), { button: 0, ctrlKey: false });
    expect(await screen.findByTestId('hw-overview-runs-scatter')).toBeTruthy();
    expect(new URLSearchParams(window.location.search).get('drillMotion')).toBe('Chuck');
  });

  it('shares changed colour/value settings across tabs without URL writes or requests, including Motion check changes', async () => {
    // Radix Select scrolls the focused option; jsdom has no scrollIntoView.
    const originalScroll = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = vi.fn();
    try {
      await renderOverview('&drillModule=PM1&drillMotion=Chuck');
      await screen.findByTestId('hw-overview-runs');
      const before = window.location.search;
      async function choose(name: string, option: string) {
        fireEvent.keyDown(screen.getByRole('combobox', { name }), { key: 'Enter' });
        fireEvent.click(await screen.findByRole('option', { name: option }));
      }
      await choose('값', 'Module 시간');
      await choose('색', '상태');
      await choose('가로축', 'Module');
      expect(window.location.search).toBe(before);
      fireEvent.mouseDown(screen.getByRole('tab', { name: '추세' }), { button: 0, ctrlKey: false });
      expect(screen.getByRole('combobox', { name: '값' }).textContent).toBe('Module 시간');
      expect(screen.getByRole('combobox', { name: '색' }).textContent).toBe('상태');
      fireEvent.click(within(screen.getByRole('tree', { name: 'Motion' })).getByRole('checkbox', { name: /Dechuck/ }));
      await waitFor(() => expect(within(screen.getByRole('tree', { name: 'Motion' })).getByRole('checkbox', { name: /Dechuck/ }).getAttribute('aria-checked')).toBe('false'));
      expect(new URLSearchParams(window.location.search).has('motion')).toBe(false);
      expect(screen.getByRole('combobox', { name: '값' }).textContent).toBe('Module 시간');
      expect(requests.map(r => r.endpoint)).toEqual(['hwTime.matrix', 'hwTime.motionStats', 'hwTime.runs']);
      fireEvent.mouseDown(screen.getByRole('tab', { name: '분포' }), { button: 0, ctrlKey: false });
      expect(screen.getByRole('combobox', { name: '가로축' }).textContent).toBe('Module');
    } finally { HTMLElement.prototype.scrollIntoView = originalScroll; }
  });

  it('keeps unknown checked averages unknown instead of substituting zero', async () => {
    const { answer } = await import('./test-support');
    await renderOverview('', request => {
      const response = answer(request);
      if (request.endpoint === 'hwTime.matrix') (response.data as import('../../endpoints').HwTimeMatrix).cells[0]!.motions.Chuck!.value = null;
      return response;
    });
    expect(chart('hw-overview-matrix').cells[0].value).toBeNull();
  });
});

describe('review regressions', () => {
  it('keeps the panel and bars on the same supplied non-default Motion colour (C5)', async () => {
    await renderOverview('', request => {
      const response = answer(request);
      if (request.endpoint === 'hwTime.matrix') {
        const data = response.data as HwTimeMatrix;
        data.motions = data.motions.map(motion => ({ ...motion, color: 'chart-purple' }));
      }
      return response;
    });
    const bars = chart('hw-overview-bars');
    expect(bars.series[0].color).toBe('chart-purple');
    const { readColorToken } = await import('@ap/ui/theme');
    const expected = document.createElement('span');
    expected.style.backgroundColor = readColorToken(bars.series[0].color);
    const row = within(screen.getByRole('tree', { name: 'Motion' })).getByRole('treeitem', { name: /Chuck/ });
    expect(row.querySelector<HTMLElement>('[data-legend-swatch]')?.style.backgroundColor).toBe(expected.style.backgroundColor);
  });

  it('adds and clears a rendered panel FilterLine condition across both tabs without requests (#2334)', async () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    await renderOverview('&drillModule=PM1&drillMotion=Chuck');
    await screen.findByTestId('hw-overview-runs');
    const before = requests.map(request => request.endpoint);
    const url = window.location.search;
    const line = screen.getByRole('group', { name: '이 패널만' });
    expect(line.querySelector('[data-filter-scope]')?.textContent).toBe('이 패널만');
    expect(screen.getByText('표시할 회차 2개 · 일별 평균 2개')).toBeTruthy();
    fireEvent.click(within(line).getByRole('button', { name: '필터 추가' }));
    fireEvent.click(await screen.findByRole('button', { name: '설비' }));
    const dialog = await screen.findByRole('dialog', { name: '설비' });
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'EQ-001' }));
    fireEvent.click(within(dialog).getByRole('button', { name: '적용' }));
    await waitFor(() => expect(screen.getByText('표시할 회차 1개 · 일별 평균 1개')).toBeTruthy());
    fireEvent.mouseDown(screen.getByRole('tab', { name: '추세' }), { button: 0, ctrlKey: false });
    expect(screen.getByText('표시할 회차 1개 · 일별 평균 1개')).toBeTruthy();
    // Narrowed to one equipment, the trend draws that equipment's daily HTM band (#2333, single-equipment policy).
    expect(chart('hw-overview-runs-trend').bounds).toEqual([['2026-09-19T00:00:00', { lower: 3, upper: 4 }]]);
    fireEvent.click(within(line).getByRole('button', { name: '모두 지우기' }));
    expect(screen.getByText('표시할 회차 2개 · 일별 평균 2개')).toBeTruthy();
    expect(requests.map(request => request.endpoint)).toEqual(before);
    expect(window.location.search).toBe(url);
  });
});
