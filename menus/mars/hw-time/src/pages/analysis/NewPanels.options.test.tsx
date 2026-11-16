// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { memoryStorage } from '@ap/kernel/testing';
import { HTM_STATUSES } from '../../endpoints';
import { HW_TIME_NEW_PANEL_MESSAGES as N } from '../../messages';
import { answer, renderOverview, requests } from './test-support';

beforeEach(() => {
  requests.length = 0;
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('sessionStorage', memoryStorage());
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

it('declares four translated category legend entries and maps every server status in both heatmaps', async () => {
  await renderOverview('&moduleType=PM&drillMotion=Pump&pins=heatmap&pins=equipmentDays', request => {
    const response = answer(request);
    if (request.endpoint === 'hwTime.matrix') {
      const data = response.data as import('../../endpoints').HwTimeMatrix;
      data.cells.forEach((cell, index) => { cell.motions.Pump!.status = HTM_STATUSES[index % HTM_STATUSES.length]!; });
    }
    if (request.endpoint === 'hwTime.equipmentDays') response.data = { rows: HTM_STATUSES.map(status => ({
      equipmentId: `EQ-${status}`, date: '2026-09-20', judgement: { value: 3, lower: 1, upper: 4, status },
    })) };
    return response;
  });
  for (const id of ['hw-overview-matrix', 'hw-equipment-days']) {
    const spec = JSON.parse(screen.getByTestId(id).textContent!);
    expect(spec.categories).toEqual([
      { id: 'normal', label: N.normal, tone: 'success' },
      { id: 'over', label: N.over, tone: 'danger' },
      { id: 'under', label: N.under, tone: 'warning' },
      { id: 'unjudgeable', label: N.unjudgeable, tone: 'neutral' },
    ]);
    expect(spec.cells.map((cell: { category: string }) => cell.category)).toEqual(HTM_STATUSES);
    expect(spec.cells.every((cell: { value: unknown }) => typeof cell.value === 'number')).toBe(true);
    // Dense rows stay readable: 24px minimum rows with scroll, verdict as a cell border only (#2451 look, both heatmaps).
    expect(spec).toMatchObject({ minRowHeight: 24, statusDisplay: 'border' });
  }
});
