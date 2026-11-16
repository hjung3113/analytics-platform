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

describe('HW Time linked workspace', () => {
  it('starts run settings and diagnostic copy collapsed behind one named disclosure (#2372)', async () => {
    await renderOverview('&drillModule=PM1&drillMotion=Chuck');
    const scatter = screen.getByTestId('hw-overview-scatter');
    const controls = within(scatter).getByText('패널 표시 설정');
    const settings = controls.closest('details')!;
    expect(settings.open).toBe(false);
    fireEvent.click(controls);
    expect(settings.open).toBe(true);
    expect(within(scatter).getByRole('combobox', { name: '가로축' })).toBeTruthy();
    expect(within(scatter).getByRole('group', { name: '이 패널만' })).toBeTruthy();
    expect(within(scatter).getByText('표본 2 / 전체 576 · 기준 밖 점 전부 포함')).toBeTruthy();
  });

  it('keeps matrix diagnostic and judgement announcements out of the visible plot layout (#2372)', async () => {
    await renderOverview();
    const heatmap = screen.getByRole('region', { name: 'panel heatmap' });
    expect(within(heatmap).getByText(/합성 데이터/).classList.contains('sr-only')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'activate EQ-002 PM2' }));
    const bars = screen.getByRole('region', { name: 'panel bars' });
    expect(within(bars).getByRole('status').classList.contains('sr-only')).toBe(true);
  });

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

  it('declares 표시 조건 minimizable with a summary of the current conditions (#2359)', async () => {
    await renderOverview();
    const summary = () => (JSON.parse(screen.getByTestId('workspace').dataset.config!) as { minimize: Record<string, string> }).minimize;
    expect(Object.keys(summary())).toEqual(['filter']);
    const [, type, modules, moduleTotal, motions, motionTotal] = /^(\S+) · Module (\d+)\/(\d+) · Motion (\d+)\/(\d+)$/.exec(summary().filter!)!;
    expect(type).toBeTruthy();
    expect(modules).toBe(moduleTotal);
    expect(motions).toBe(motionTotal);
    fireEvent.click(within(screen.getByRole('tree', { name: 'Motion' })).getByRole('checkbox', { name: /Chuck/ }));
    await waitFor(() => expect(summary().filter).toContain(`Motion ${Number(motionTotal) - 1}/${motionTotal}`));
  });

  it('persists heatmap activation as row and restores the linked bar focus', async () => {
    await renderOverview();
    fireEvent.click(screen.getByRole('button', { name: 'activate EQ-002 PM2' }));
    expect(chart('hw-overview-bars')).toMatchObject({ activeCategory: 'EQ-002 · PM2', revealActive: true, rowPitch: 28 });
    expect(new URLSearchParams(window.location.search).get('row')).toBe('EQ-002 · PM2');
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
    // `판정 불가` stays in the accessible chart description and Motion table; a mark on every cell would drown the out-of-bound ones (advisor).
    expect(cells.filter(c => c.status).map(c => `${c.y} · ${c.x}:${c.status!.tone}`)).toEqual(['EQ-001 · PM1:danger']);
    // The heatmap mark and the bar marks read the same matrix cell: a marked cell is exactly a row with a marked bar piece.
    expect(new Set(bars.statuses.map((s: string) => s.split('@')[1]!.split(':')[0]))).toEqual(new Set(cells.filter(c => c.status).map(c => `${c.y} · ${c.x}`)));
    expect(screen.getAllByText(/Recipe 미구분 — 판정 불가/).length).toBeGreaterThan(0);
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

  it('switches the URL align option between stacked totals and SDK Motion lanes while retaining status, focus and quiet emphasis', async () => {
    await renderOverview();
    const series = chart('hw-overview-bars').series;
    fireEvent.click(screen.getByRole('button', { name: 'activate EQ-002 PM2' }));
    const status = within(screen.getByRole('region', { name: 'panel bars' })).getByRole('status').textContent;
    fireEvent.click(screen.getByRole('button', { name: '옵션' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Motion 시작 위치 맞추기' }));
    expect(chart('hw-overview-bars')).toMatchObject({ startAlign: true, emphasisFocus: 'none', activeCategory: 'EQ-002 · PM2', series });
    expect(within(screen.getByRole('region', { name: 'panel bars' })).getByRole('status').textContent).toBe(status);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Motion 시작 위치 맞추기' }));
    expect(chart('hw-overview-bars')).toMatchObject({ startAlign: false, emphasisFocus: 'none', activeCategory: 'EQ-002 · PM2', series });
    expect(new URLSearchParams(window.location.search).has('align')).toBe(false);
    expect(requests.filter(r => !['hwTime.levelRows', 'hwTime.tableRows'].includes(r.endpoint)).map(r => r.endpoint)).toEqual(['hwTime.matrix']);
  });

  it('drills to server statuses and run panels with independent local settings, the SDK scatter and the SDK trend', async () => {
    await renderOverview();
    fireEvent.click(screen.getByRole('button', { name: 'drill EQ-001 · PM1' }));
    const table = await screen.findByRole('region', { name: 'PM1 · Motion' });
    expect(await within(table).findByText('HTM 하한 미달')).toBeTruthy();
    expect(within(table).getByText('HTM 상한 초과')).toBeTruthy();
    fireEvent.click(within(table).getByRole('button', { name: 'Chuck 회차 보기' }));
    await screen.findByTestId('hw-overview-scatter');
    expect(screen.getByText('표본 2 / 전체 576 · 기준 밖 점 전부 포함')).toBeTruthy();
    // #2332: categorical x per equipment (one Module on screen drops the Module label), the server's per-category bounds,
    // one colour by default, status on out-of-bound points only.
    const scatter = chart('hw-overview-runs-scatter');
    expect(scatter.density).toBe('quiet');
    expect(scatter.xCategories.order).toEqual(['EQ-001', 'EQ-002']);
    expect(scatter.xCategories.groups).toBeUndefined();
    expect(scatter.xLabel).toBe('설비');
    expect(scatter.groups.map((g: { label: string }) => g.label)).toEqual(['회차']);
    expect(scatter.xCategories.bounds).toEqual([['EQ-001', { lower: 3, upper: 4 }], ['EQ-002', { lower: 3, upper: 4 }]]);
    expect(scatter.points.map((p: { id: string; category: string; y: number; group: string; status?: { tone: string } }) => [p.id, p.category, p.y, p.group, p.status?.tone]))
      .toEqual([['run-0', 'EQ-001', 9, 'runs', 'danger'], ['run-1', 'EQ-002', 2, 'runs', 'warning']]);
    expect(screen.queryByText(/산점도는 SDK 조각/)).toBeNull();
    expect(within(screen.getByTestId('hw-overview-scatter')).getByRole('group', { name: '이 패널만' })).toBeTruthy();
    expect(within(screen.getByTestId('hw-overview-scatter')).getByRole('combobox', { name: '가로축' })).toBeTruthy();
    expect(within(screen.getByTestId('hw-overview-scatter')).getByRole('combobox', { name: '색' }).textContent).toBe('단색');
    expect(within(screen.getByTestId('hw-overview-trend')).getByRole('combobox', { name: '색' }).textContent).toBe('설비');
    expect(within(screen.getByTestId('hw-overview-scatter')).getByRole('combobox', { name: '값' }).textContent).toBe('고른 Motion 회차 시간');
    const before = requests.map(r => r.endpoint);
    // #2333: one line per equipment on a time axis, status rings on out-of-bound daily means only, no band across two equipment.
    const trend = chart('hw-overview-runs-trend');
    expect(trend.series.map((s: { id: string }) => s.id)).toEqual(['EQ-001', 'EQ-002']);
    expect(trend.statuses).toEqual(['EQ-001@2026-09-19T00:00:00:danger', 'EQ-002@2026-09-19T00:00:00:warning']);
    expect(trend.emphasisFocus).toBe('none');
    expect(trend.bounds).toEqual([]);
    expect(screen.queryByText(/추세 차트는 SDK 조각/)).toBeNull();
    expect(within(screen.getByTestId('hw-overview-trend')).queryByRole('combobox', { name: '가로축' })).toBeNull();
    expect(within(screen.getByTestId('hw-overview-scatter')).getByRole('combobox', { name: '색' }).textContent).toBe('단색');
    expect(requests.map(r => r.endpoint)).toEqual(before);
    expect(await screen.findByTestId('hw-overview-runs-scatter')).toBeTruthy();
    expect(new URLSearchParams(window.location.search).get('drillMotion')).toBe('Chuck');
  });

  it('keeps changed colour/value settings in one panel without URL writes or requests, including Motion check changes', async () => {
    // Radix Select scrolls the focused option; jsdom has no scrollIntoView.
    const originalScroll = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = vi.fn();
    try {
      await renderOverview('&drillModule=PM1&drillMotion=Chuck');
      await screen.findByTestId('hw-overview-scatter');
      const before = window.location.search;
      fireEvent.click(within(screen.getByTestId('hw-overview-scatter')).getByText('패널 표시 설정'));
      async function choose(name: string, option: string) {
        fireEvent.keyDown(within(screen.getByTestId('hw-overview-scatter')).getByRole('combobox', { name }), { key: 'Enter' });
        fireEvent.click(await screen.findByRole('option', { name: option }));
      }
      await choose('값', 'Module 시간');
      await choose('색', '상태');
      await choose('가로축', 'Module');
      expect(window.location.search).toBe(before);
        expect(within(screen.getByTestId('hw-overview-scatter')).getByRole('combobox', { name: '값' }).textContent).toBe('Module 시간');
      expect(within(screen.getByTestId('hw-overview-scatter')).getByRole('combobox', { name: '색' }).textContent).toBe('상태');
      fireEvent.click(within(screen.getByRole('tree', { name: 'Motion' })).getByRole('checkbox', { name: /Dechuck/ }));
      await waitFor(() => expect(within(screen.getByRole('tree', { name: 'Motion' })).getByRole('checkbox', { name: /Dechuck/ }).getAttribute('aria-checked')).toBe('false'));
      expect(new URLSearchParams(window.location.search).has('motion')).toBe(false);
      expect(within(screen.getByTestId('hw-overview-scatter')).getByRole('combobox', { name: '값' }).textContent).toBe('Module 시간');
      expect(requests.filter(r => !['hwTime.levelRows', 'hwTime.tableRows'].includes(r.endpoint)).map(r => r.endpoint)).toEqual(['hwTime.matrix', 'hwTime.motionStats', 'hwTime.runs']);
        expect(within(screen.getByTestId('hw-overview-scatter')).getByRole('combobox', { name: '가로축' }).textContent).toBe('Module');
    } finally { HTMLElement.prototype.scrollIntoView = originalScroll; }
  });

  it('reveals the panel filled by each link without moving keyboard focus', async () => {
    await renderOverview();
    const heatmap = screen.getByRole('button', { name: 'activate EQ-002 PM2' });
    heatmap.focus();
    fireEvent.click(heatmap);
    const revealed = () => JSON.parse(screen.getByTestId('workspace').getAttribute('data-config')!).reveal?.panelId;
    expect(revealed()).toBe('bars');
    expect(document.activeElement).toBe(heatmap);
    fireEvent.click(screen.getByRole('button', { name: 'drill EQ-002 · PM2' }));
    expect(revealed()).toBe('motions');
    const motion = await screen.findByRole('button', { name: 'Chuck 회차 보기' });
    motion.focus();
    fireEvent.click(motion);
    expect(revealed()).toBe('scatter');
    await settle();
    expect(document.activeElement).toBe(motion);
    expect(new URLSearchParams(window.location.search).get('drillMotion')).toBe('Chuck');
    // Clearing the Module removes its own button; focus lands on the panel hint, never the page heading or body.
    const clear = screen.getByRole('button', { name: 'Module 선택 해제' });
    clear.focus();
    fireEvent.click(clear);
    await settle();
    expect(new URLSearchParams(window.location.search).get('drillModule')).toBeNull();
    expect(new URLSearchParams(window.location.search).get('drillMotion')).toBeNull();
    expect(document.activeElement).toBe(within(screen.getByRole('region', { name: 'panel motions' })).getByText('Module을 고르세요'));
  });

  it.each(['total-desc', 'total-asc'])('ignores legacy chart-only sort=%s without a table error', async sort => {
    await renderOverview(`&view=steps&sort=${sort}&trend=ignored&minmax=ignored`);
    expect(screen.getByRole('table', { name: 'HW Time 동작시간 표' })).toBeTruthy();
    expect(screen.queryByText(/잘못된.*정렬/)).toBeNull();
  });

  it('restores row, Module, Motion, alignment and all seven panels from a copied URL', async () => {
    await renderOverview('&row=EQ-002%20%C2%B7%20PM2&drillModule=PM2&drillMotion=Chuck&align=1');
    await screen.findByTestId('hw-overview-scatter');
    expect(chart('hw-overview-bars')).toMatchObject({ activeCategory: 'EQ-002 · PM2', startAlign: true });
    expect(chart('hw-overview-runs-scatter').density).toBe('quiet');
    expect(screen.getByRole('table', { name: 'PM2 · Motion' })).toBeTruthy();
    const config = JSON.parse(screen.getByTestId('workspace').getAttribute('data-config')!);
    expect(config.ids).toEqual(['filter', 'heatmap', 'bars', 'motions', 'scatter', 'trend', 'table']);
    expect(config.primary).toBe('bars');
    expect(screen.queryByRole('tab')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Module 선택 해제' }));
    expect(new URLSearchParams(window.location.search).get('drillModule')).toBeNull();
    expect(new URLSearchParams(window.location.search).get('drillMotion')).toBeNull();
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

  it('adds and clears a rendered panel FilterLine condition without changing the other panel without requests (#2334)', async () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    await renderOverview('&drillModule=PM1&drillMotion=Chuck');
    await screen.findByTestId('hw-overview-scatter');
    const before = requests.map(request => request.endpoint);
    const url = window.location.search;
    fireEvent.click(within(screen.getByTestId('hw-overview-scatter')).getByText('패널 표시 설정'));
    const line = within(screen.getByTestId('hw-overview-scatter')).getByRole('group', { name: '이 패널만' });
    expect(line.querySelector('[data-filter-scope]')?.textContent).toBe('이 패널만');
    expect(within(screen.getByTestId('hw-overview-scatter')).getByText('표시할 회차 2개 · 일별 평균 2개')).toBeTruthy();
    fireEvent.click(within(line).getByRole('button', { name: '필터 추가' }));
    fireEvent.click(await screen.findByRole('button', { name: '설비' }));
    const dialog = await screen.findByRole('dialog', { name: '설비' });
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'EQ-001' }));
    fireEvent.click(within(dialog).getByRole('button', { name: '적용' }));
    await waitFor(() => expect(screen.getByText('표시할 회차 1개 · 일별 평균 1개')).toBeTruthy());
    expect(screen.getByText('표시할 회차 1개 · 일별 평균 1개')).toBeTruthy();
    // The scatter condition leaves the trend population and its mixed-equipment band policy unchanged.
    expect(chart('hw-overview-runs-trend').bounds).toEqual([]);
    expect(within(screen.getByTestId('hw-overview-trend')).getByText('표시할 회차 2개 · 일별 평균 2개')).toBeTruthy();
    fireEvent.click(within(line).getByRole('button', { name: '모두 지우기' }));
    expect(within(screen.getByTestId('hw-overview-scatter')).getByText('표시할 회차 2개 · 일별 평균 2개')).toBeTruthy();
    expect(requests.map(request => request.endpoint)).toEqual(before);
    expect(window.location.search).toBe(url);
  });
});
