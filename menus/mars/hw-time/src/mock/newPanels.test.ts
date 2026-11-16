import { describe, expect, it } from 'vitest';
import { emptyGlobal } from '@ap/contracts';
import { EQUIPMENT } from '@ap/mock-server';
import { equipmentDays, hwTimeNewPanelMock } from './newPanels';
import { overviewRuns } from './overview';
const context = { ...emptyGlobal, scopeId: 'MEM', from: '2026-09-19T09:00:00', to: '2026-09-26T09:00:00' };
describe('new panel server data', () => {
  it('filters raw verdict and date before sampling and counts that population', () => {
    const data = overviewRuns(['EQ-003'], { moduleType: 'LK', drillModule: 'LK1', drillMotion: 'Pump', verdict: 'over', date: '2026-09-20' }, context, { sample: true });
    expect(data.total).toBeGreaterThan(0);
    expect(data.points.every(point => point.judgement.status === 'over' && point.at.startsWith('2026-09-20'))).toBe(true);
    expect(data.shown).toBe(data.total);
  });
  it('step 4 equipment days carry server daily means for the selected Motion', () => {
    const params = { moduleType: 'LK', drillModule: 'LK1', drillMotion: 'Pump' };
    const data = equipmentDays(EQUIPMENT.slice(0, 1), params, context);
    const raw = overviewRuns(['EQ-001', 'EQ-002', 'EQ-003'], params, context, { sample: false });
    expect(data.rows.map(row => row.judgement.value)).toEqual(raw.daily.map(row => row.judgement.value));
    expect(data.rows.map(row => row.judgement.status)).toEqual(raw.daily.map(row => row.judgement.status));
  });
  it('rejects drill mismatches and never invents equipment for an empty resolved Scope', () => {
    for (const endpoint of hwTimeNewPanelMock) {
      expect(endpoint.validate?.({ params: { moduleType: 'PM', drillModule: 'LK1' }, context })).toBeTruthy();
      const data = endpoint.handle({ equipment: [], params: {}, context, actor: 'engineer' });
      expect(endpoint.isEmpty?.(data)).toBe(true);
    }
  });
  it('provides synthetic audit events through the menu endpoint', () => {
    const endpoint = hwTimeNewPanelMock.find(endpoint => endpoint.spec.id === 'hwTime.boundHistory')!;
    expect(endpoint.handle({ equipment: EQUIPMENT.slice(0, 1), params: { moduleType: 'LK' }, context, actor: 'engineer' })).toMatchObject([
      { action: 'update', target: { scopeId: 'MEM', type: 'htm-bound', id: 'LK' }, changes: { upper: ['6', '7'] } },
    ]);
  });
});
