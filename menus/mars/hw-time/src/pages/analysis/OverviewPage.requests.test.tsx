// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '@ap/kernel/testing';
import { renderOverview, requests, settle } from './test-support';

beforeEach(() => { requests.length = 0; vi.stubGlobal('localStorage', memoryStorage()); vi.stubGlobal('sessionStorage', memoryStorage()); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

describe('stepped workspace adapter request boundary', () => {
  it('loads every type once for the equipment means, and reuses matrices across steps 1–4', async () => {
    await renderOverview();
    expect(requests.map(request => (request.params as { moduleType: string }).moduleType).sort()).toEqual(['LK', 'PM', 'TR']);
    const tree = () => screen.getByRole('tree', { name: '계층' });
    for (const name of ['PM', 'Pump', 'PM1']) {
      fireEvent.click(within(tree()).getByText(name, { exact: true })); await settle();
    }
    await screen.findByTestId('hw-overview-trend');
    expect(requests.map(request => request.endpoint)).toEqual(['hwTime.matrix', 'hwTime.matrix', 'hwTime.matrix', 'hwTime.runs']);
  });

  it.each([
    ['&moduleType=PM&drillMotion=Pump', ['hwTime.matrix']],
    ['&moduleType=PM&drillMotion=Pump&drillModule=PM1', ['hwTime.matrix', 'hwTime.runs']],
    ['&moduleType=PM&drillMotion=Pump&trend=PM2/Pump', ['hwTime.matrix', 'hwTime.runs']],
  ])('deep link %s reads only displayed data', async (search, expected) => {
    await renderOverview(search); await settle();
    expect(requests.map(request => request.endpoint).sort()).toEqual([...expected].sort());
  });

  it('all-off then one-on keeps query owners and options without widening results', async () => {
    await renderOverview('&moduleType=PM&align=1');
    const before = requests.length;
    const type = within(screen.getByRole('tree', { name: '계층' })).getByRole('checkbox', { name: 'PM' });
    fireEvent.click(type); await settle();
    expect(screen.getByText('선택한 항목 없음')).toBeTruthy();
    fireEvent.click(type); await settle();
    expect(screen.queryByText('선택한 항목 없음')).toBeNull();
    expect(requests).toHaveLength(before);
    expect(JSON.parse(screen.getByTestId('hw-current').textContent!).startAlign).toBe(true);
  });

  it.each(['&moduleType=BAD', '&module=~bad', '&motion=~none&motion=PM/Pump', '&split=recipe', '&module=PM1&module=PM1', '&drillModule=LK1', '&drillMotion=Pump'])('%s blocks every automatic read', async search => {
    await renderOverview(search, undefined, { waitForData: false });
    expect(screen.getByRole('button', { name: /초기화|복구|지우기/ })).toBeTruthy();
    expect(requests).toHaveLength(0);
  });
});
