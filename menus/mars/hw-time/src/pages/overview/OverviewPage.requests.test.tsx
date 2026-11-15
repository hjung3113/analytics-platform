// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryStorage, testAdapter } from '@ap/kernel/testing';
import { I18nProvider, PlatformProvider } from '@ap/kernel';
import type { ApiResponse, MenuQuery } from '@ap/contracts';
import { registry, renderOverview, requests, session, settle } from './test-support';

beforeEach(() => { requests.length = 0; vi.stubGlobal('localStorage', memoryStorage()); vi.stubGlobal('sessionStorage', memoryStorage()); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

describe('overview adapter request boundary', () => {
  it('toggling Module/Motion checks never refetches matrix data', async () => {
    await renderOverview();
    expect(requests.map(r => r.endpoint)).toEqual(['hwTime.matrix']);
    for (const name of ['Module', 'Motion']) {
      const check = within(screen.getByRole('tree', { name })).getAllByRole('checkbox')[0]!;
      fireEvent.click(check); await settle(); fireEvent.click(check); await settle();
    }
    expect(requests.map(r => r.endpoint)).toEqual(['hwTime.matrix']);
  });

  it.each(['&moduleType=BAD', '&module=~bad', '&motion=~none&motion=PM/Pump', '&split=recipe', '&module=PM1&module=PM1', '&drillModule=LK1', '&drillModule=PM1&drillMotion=DoorOpen', '&drillMotion=Pump'])('%s closes all query gates and offers recovery', async search => {
    await renderOverview(search, undefined, { waitForData: false });
    expect(await screen.findByRole('button', { name: /초기화|복구|지우기/ })).toBeTruthy();
    expect(requests).toHaveLength(0);
  });

  it('a Module drill and Motion drill request only their corresponding new dataset', async () => {
    await renderOverview();
    fireEvent.click(screen.getByRole('button', { name: 'drill EQ-001 · PM1' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Chuck 회차 보기' }));
    await screen.findByTestId('hw-overview-runs');
    expect(requests.map(r => r.endpoint)).toEqual(['hwTime.matrix', 'hwTime.motionStats', 'hwTime.runs']);
  });
});

// Preserve the existing #2007 regression for the two unchanged legacy chart pages.
// Their level/trend behavior has not been removed by the overview rewrite.
describe('legacy HW Time pages keep the drill-gap gate (#2007)', () => {
  const pages = [
    ['steps', () => import('../steps/StepsPage')],
    ['compare', () => import('../compare/ComparePage')],
  ] as const;
  const legacyAnswer = (request: MenuQuery): ApiResponse<unknown> => {
    const params = request.params as { drillModule?: string; drillMotion?: string; rowIds?: string[] };
    const motions = ['Chuck', 'Dechuck', 'Pump'];
    const block = (ids: string[]) => ({
      series: ids.map(id => ({ id, name: id, color: 'chart-blue' })),
      rows: ['H1', 'H2', 'H3'].map(subItem => ({ id: `EQ-001.${subItem}`, equipmentId: 'EQ-001', subItem, values: Object.fromEntries(ids.map(id => [id, 2])), total: 2 * ids.length })),
      totals: { values: Object.fromEntries(ids.map(id => [id, 6])), total: 6 * ids.length },
    });
    const data = request.endpoint === 'hwTime.trend'
      ? { limits: { maxRows: 8 }, rows: (params.rowIds ?? []).map(id => ({ id, points: [{ at: '2026-09-19', value: 1 }, { at: '2026-09-20', value: 2 }] })) }
      : { ...block(motions), level: 2, context: block(motions), detail: block([params.drillMotion ?? 'Pump']), limits: { maxRows: 120 } };
    return { outcome: 'ok', data, assessments: [{ kind: 'collection', state: 'clear' }, { kind: 'processing_delay', state: 'clear' }, { kind: 'coverage', state: 'clear' }], trust: null, correlationId: 'fixture' };
  };
  async function renderLegacy(page: (typeof pages)[number], search: string) {
    const { default: Page } = await page[1]();
    const adapter = testAdapter({ session: () => session, menuQuery: async request => { requests.push(request); return legacyAnswer(request); } });
    window.history.replaceState(null, '', `/hw-time/${page[0]}?v=1&scopeId=MEM&from=2026-09-19T09:00:00&to=2026-09-26T09:00:00${search}`);
    render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><Page params={{}} /></PlatformProvider></I18nProvider>);
  }
  it.each(pages)('%s: a Motion without its Module asks for neither level nor trend', async (...page) => {
    await renderLegacy(page, '&drillMotion=Pump&trend=EQ-001.H1');
    expect(await screen.findByText(/앞 단계 없이 쓸 수 없습니다/)).toBeTruthy();
    await settle();
    expect(requests).toHaveLength(0);
  });
  it.each(pages)('%s: the full drill path still asks for level and trend', async (...page) => {
    await renderLegacy(page, '&drillModule=PM1&drillMotion=Pump&trend=EQ-001.H1');
    await waitFor(() => expect(requests.some(request => request.endpoint === 'hwTime.trend')).toBe(true));
    expect(requests.some(request => request.endpoint === 'hwTime.levelRows')).toBe(true);
  });
});

describe('overview empty selections keep mounted observers and local settings (C3)', () => {
  it.each(['Module', 'Motion'])('all %s off then one on keeps matrix/stats/runs, bar mode and run settings', async list => {
    const originalScroll = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = vi.fn();
    try {
      await renderOverview('&drillModule=PM1&drillMotion=Chuck');
      await screen.findByTestId('hw-overview-runs');
      fireEvent.click(screen.getByRole('radio', { name: '동작별 정렬' }));
      fireEvent.mouseDown(screen.getByRole('tab', { name: '추세' }), { button: 0, ctrlKey: false });
      fireEvent.keyDown(screen.getByRole('combobox', { name: '값' }), { key: 'Enter' });
      fireEvent.click(await screen.findByRole('option', { name: 'Module 시간' }));
      const before = requests.map(request => request.endpoint);
      const tree = screen.getByRole('tree', { name: list });
      for (const check of within(tree).getAllByRole('checkbox')) fireEvent.click(check);
      expect(await screen.findByText('선택한 항목 없음')).toBeTruthy();
      expect(screen.queryByRole('tab', { name: '분포' })).toBeNull();
      fireEvent.click(within(tree).getByRole('checkbox', { name: list === 'Module' ? /PM1/ : /Chuck/ }));
      await settle();
      expect(requests.map(request => request.endpoint)).toEqual(before);
      expect(screen.getByRole('radio', { name: '동작별 정렬' }).getAttribute('aria-checked')).toBe('true');
      expect(screen.getByRole('tab', { name: '추세' }).getAttribute('data-state')).toBe('active');
      expect(screen.getByRole('combobox', { name: '값' }).textContent).toBe('Module 시간');
    } finally { HTMLElement.prototype.scrollIntoView = originalScroll; }
  });

  it('an undrilled all-off then one-on selection keeps its single matrix read', async () => {
    await renderOverview();
    const tree = screen.getByRole('tree', { name: 'Module' });
    for (const check of within(tree).getAllByRole('checkbox')) fireEvent.click(check);
    expect(await screen.findByText('선택한 항목 없음')).toBeTruthy();
    fireEvent.click(within(tree).getByRole('checkbox', { name: /PM1/ }));
    await settle();
    expect(requests.map(request => request.endpoint)).toEqual(['hwTime.matrix']);
  });
});
