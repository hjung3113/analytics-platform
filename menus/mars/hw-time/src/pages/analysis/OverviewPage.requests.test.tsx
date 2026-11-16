// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '@ap/kernel/testing';
import { renderOverview, requests, settle } from './test-support';

beforeEach(() => { requests.length = 0; vi.stubGlobal('localStorage', memoryStorage()); vi.stubGlobal('sessionStorage', memoryStorage()); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

describe('overview adapter request boundary', () => {
  it('toggling Module/Motion checks never refetches matrix data', async () => {
    await renderOverview();
    expect(requests.filter(r => !['hwTime.levelRows', 'hwTime.tableRows'].includes(r.endpoint)).map(r => r.endpoint)).toEqual(['hwTime.matrix']);
    for (const name of ['Module', 'Motion']) {
      const check = within(screen.getByRole('tree', { name })).getAllByRole('checkbox')[0]!;
      fireEvent.click(check); await settle(); fireEvent.click(check); await settle();
    }
    expect(requests.filter(r => !['hwTime.levelRows', 'hwTime.tableRows'].includes(r.endpoint)).map(r => r.endpoint)).toEqual(['hwTime.matrix']);
  });

  it.each(['&moduleType=BAD', '&module=~bad', '&motion=~none&motion=PM/Pump', '&split=recipe', '&module=PM1&module=PM1', '&drillModule=LK1', '&drillModule=PM1&drillMotion=DoorOpen', '&drillMotion=Pump'])('%s closes all query gates and offers recovery', async search => {
    await renderOverview(search, undefined, { waitForData: false });
    expect(await screen.findByRole('button', { name: /초기화|복구|지우기/ })).toBeTruthy();
    expect(requests).toHaveLength(0);
  });

  it('a Module drill and Motion drill request only their corresponding new dataset', async () => {
    await renderOverview();
    const beforeModule = requests.length;
    fireEvent.click(screen.getByRole('button', { name: 'drill EQ-001 · PM1' }));
    await screen.findByRole('table', { name: 'PM1 · Motion' });
    expect(requests.slice(beforeModule).map(request => request.endpoint)).toEqual(['hwTime.motionStats']);
    const beforeMotion = requests.length;
    fireEvent.click(await screen.findByRole('button', { name: 'Chuck 회차 보기' }));
    await screen.findByTestId('hw-overview-scatter');
    expect(requests.slice(beforeMotion).map(request => request.endpoint)).toEqual(['hwTime.runs']);
    expect(new URLSearchParams(window.location.search).get('row')).toBe('EQ-001 · PM1');
    expect(requests.filter(r => !['hwTime.levelRows', 'hwTime.tableRows'].includes(r.endpoint)).map(r => r.endpoint)).toEqual(['hwTime.matrix', 'hwTime.motionStats', 'hwTime.runs']);
  });
});

describe('overview empty selections keep mounted observers and local settings (C3)', () => {
  it.each(['Module', 'Motion'])('all %s off then one on keeps matrix/stats/runs, bar mode and run settings', async list => {
    const originalScroll = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = vi.fn();
    try {
      await renderOverview('&drillModule=PM1&drillMotion=Chuck');
      await screen.findByTestId('hw-overview-scatter');
      fireEvent.click(screen.getByRole('button', { name: '옵션' }));
      fireEvent.click(screen.getByRole('checkbox', { name: 'Motion 시작 위치 맞추기' }));
      fireEvent.keyDown(within(screen.getByTestId('hw-overview-scatter')).getByRole('combobox', { name: '값' }), { key: 'Enter' });
      fireEvent.click(await screen.findByRole('option', { name: 'Module 시간' }));
      const before = requests.map(request => request.endpoint);
      const tree = screen.getByRole('tree', { name: list });
      for (const check of within(tree).getAllByRole('checkbox')) fireEvent.click(check);
      expect(await screen.findByText('선택한 항목 없음')).toBeTruthy();
      expect(screen.queryByRole('combobox', { name: '가로축' })).toBeNull();
      fireEvent.click(within(tree).getByRole('checkbox', { name: list === 'Module' ? /PM1/ : /Chuck/ }));
      await settle();
      expect(requests.map(request => request.endpoint)).toEqual(before);
      expect(new URLSearchParams(window.location.search).get('align')).toBe('1');
      expect(within(screen.getByTestId('hw-overview-scatter')).getByRole('combobox', { name: '값' }).textContent).toBe('Module 시간');
    } finally { HTMLElement.prototype.scrollIntoView = originalScroll; }
  });

  it('an undrilled all-off then one-on selection keeps its single matrix read', async () => {
    await renderOverview();
    const tree = screen.getByRole('tree', { name: 'Module' });
    for (const check of within(tree).getAllByRole('checkbox')) fireEvent.click(check);
    expect(await screen.findByText('선택한 항목 없음')).toBeTruthy();
    fireEvent.click(within(tree).getByRole('checkbox', { name: /PM1/ }));
    await settle();
    expect(requests.filter(request => !['hwTime.levelRows', 'hwTime.tableRows'].includes(request.endpoint)).map(request => request.endpoint)).toEqual(['hwTime.matrix']);
  });
});
