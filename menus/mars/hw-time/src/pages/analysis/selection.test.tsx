// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { memoryStorage } from '@ap/kernel/testing';
import { answer, renderOverview } from './test-support';

beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); vi.stubGlobal('sessionStorage', memoryStorage()); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

it('shows the receiver badge only while the chart selection is applied', async () => {
  await renderOverview('&moduleType=PM&drillMotion=Pump&drillModule=PM1&pins=moduleMotions&pins=table', request => {
    const response = answer(request);
    if (request.endpoint !== 'hwTime.levelRows' || !(request.params as { motionEquipment?: string[] }).motionEquipment) return response;
    return { ...response, data: { level: 0, series: [], rows: [{ id: 'EQ-002', equipmentId: 'EQ-002', values: {}, total: null }], totals: { values: {}, total: null }, limits: { maxRows: 120 } } };
  });
  const table = screen.getByRole('tab', { name: 'table' });
  expect(table.hasAttribute('aria-description')).toBe(false);
  const point = await screen.findByRole('button', { name: 'select hw-module-motions EQ-002' });
  fireEvent.click(point);
  await waitFor(() => {
    expect(table.getAttribute('data-count')).toBe('1');
    expect(table.getAttribute('aria-description')).toBe('필터됨 · 1 · 선택 적용');
  });
  expect(JSON.parse(screen.getByTestId('hw-module-motions').textContent!).activeCategory).toBe('EQ-002');
  fireEvent.click(point);
  await waitFor(() => expect(table.hasAttribute('aria-description')).toBe(false));
});
