// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '@ap/kernel/testing';
import type { HwTimeMatrix } from '../../endpoints';
import { answer, renderOverview, requests } from './test-support';

beforeEach(() => { requests.length = 0; vi.stubGlobal('localStorage', memoryStorage()); vi.stubGlobal('sessionStorage', memoryStorage()); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });
const chart = (id: string) => JSON.parse(screen.getByTestId(id).textContent!);
const RUN_URL = '&moduleType=PM&drillMotion=Chuck&drillModule=PM1&pins=scatter';

describe('HW Time optional panels and projections', () => {
  it('keeps run settings collapsed until opened, with independent per-panel controls', async () => {
    await renderOverview(RUN_URL);
    const scatter = await screen.findByTestId('hw-overview-scatter');
    const controls = within(scatter).getByText('패널 표시 설정');
    expect(controls.closest('details')!.open).toBe(false);
    fireEvent.click(controls);
    expect(controls.closest('details')!.open).toBe(true);
    expect(within(scatter).getByRole('combobox', { name: '가로축' })).toBeTruthy();
    expect(within(scatter).getByText('표본 2 / 전체 576 · 기준 밖 점 전부 포함')).toBeTruthy();
    const trend = within(await screen.findByTestId('hw-overview-trend'));
    expect(trend.queryByRole('combobox', { name: '가로축' })).toBeNull();
    expect(trend.getByRole('grid')).toBeTruthy();
    fireEvent.click(trend.getByRole('radio', { name: '겹쳐 보기' }));
    expect(chart('hw-overview-runs-scatter').density).toBe('quiet');
    expect(screen.queryByTestId('hw-overview-runs-trend')).toBeNull();
    expect(within(screen.getByTestId('hw-overview-trend')).getByText('일 평균 추세는 2일 이상 기간에서 보임')).toBeTruthy();
  });

  it('projects checked Motions through bars and an added heatmap without another read', async () => {
    await renderOverview('&moduleType=PM&pins=heatmap');
    expect(chart('hw-overview-matrix').cells[0].value).toBe(20);
    const before = requests.length;
    fireEvent.click(within(screen.getByRole('tree', { name: '계층' })).getByRole('checkbox', { name: 'Chuck' }));
    await waitFor(() => expect(chart('hw-overview-matrix').cells[0].value).toBe(18));
    expect(chart('hw-current').series.map((series: { id: string }) => series.id)).not.toContain('Chuck');
    expect(requests).toHaveLength(before);
  });

  it('preserves unknown checked values in heatmaps and aggregate type means', async () => {
    await renderOverview('&moduleType=PM&pins=heatmap', request => {
      const response = answer(request);
      if (request.endpoint === 'hwTime.matrix' && (request.params as { moduleType: string }).moduleType === 'PM') (response.data as HwTimeMatrix).cells[0]!.motions.Chuck!.value = null;
      return response;
    });
    expect(chart('hw-overview-matrix').cells[0].value).toBeNull();
    expect(chart('hw-previous').series[0].points[0][1]).toBeNull();
  });

  it('takes out-of-bound emphasis only from the supplied server judgements', async () => {
    await renderOverview('&moduleType=PM&pins=heatmap', request => {
      const response = answer(request);
      if (request.endpoint === 'hwTime.matrix') {
        const data = response.data as HwTimeMatrix;
        data.cells[0]!.motions.Chuck = { value: 2, lower: 100, upper: 200, status: 'over' };
        data.cells[0]!.motions.Dechuck = { value: 3, lower: 0, upper: 1, status: 'under' };
      }
      return response;
    });
    expect(chart('hw-current').statuses).toContain('Chuck@MEM-PHOTO-0103 · PM1:danger');
    expect(chart('hw-current').statuses).toContain('Dechuck@MEM-PHOTO-0103 · PM1:warning');
    expect(chart('hw-overview-matrix').cells[0].status.tone).toBe('danger');
  });

  it('applies a scatter-only FilterLine condition without changing the trend or issuing a query', async () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    await renderOverview(RUN_URL);
    const scatter = await screen.findByTestId('hw-overview-scatter');
    const trend = await screen.findByTestId('hw-overview-trend');
    const before = requests.length, url = window.location.search;
    fireEvent.click(within(scatter).getByText('패널 표시 설정'));
    const line = within(scatter).getByRole('group', { name: '이 패널만' });
    fireEvent.click(within(line).getByRole('button', { name: '필터 추가' }));
    fireEvent.click(await screen.findByRole('button', { name: '설비' }));
    const dialog = await screen.findByRole('dialog', { name: '설비' });
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'MEM-PHOTO-0103' }));
    fireEvent.click(within(dialog).getByRole('button', { name: '적용' }));
    await waitFor(() => expect(within(scatter).getByText('표시할 회차 1개 · 일별 평균 1개')).toBeTruthy());
    fireEvent.click(within(trend).getByRole('button', { name: '패널 표시 설정' }));
    expect(within(screen.getByRole('dialog', { name: '패널 표시 설정' })).getByText('표시할 회차 2개 · 일별 평균 2개')).toBeTruthy();
    expect(requests).toHaveLength(before); expect(window.location.search).toBe(url);
  });
});
