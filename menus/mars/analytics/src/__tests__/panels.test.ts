import { describe, expect, it } from 'vitest';
import { manifests } from '../index';
import { cycleDistEndpoint, cycleExportEndpoint, cycleKpiEndpoint, cycleSlowPageEndpoint, cycleTrendEndpoint } from '../endpoints';

describe('cycle-time panel declarations (#2433)', () => {
  it('registers the four workspace panels with endpoint and page contracts', () => {
    const panels = manifests.find(menu => menu.id === 'cycle-time')!.panels!;
    expect(panels.map(panel => panel.id)).toEqual(['summary', 'trend', 'distribution', 'slow']);
    expect(panels.map(panel => panel.endpoints)).toEqual([[cycleKpiEndpoint], [cycleTrendEndpoint], [cycleDistEndpoint], [cycleSlowPageEndpoint, cycleExportEndpoint, cycleKpiEndpoint]]);
    expect(panels.map(panel => panel.queryInputs.page?.map(input => input.key) ?? [])).toEqual([['conditionSet'], ['conditionSet', 'granularity'], ['conditionSet', 'tableEquipment'], ['conditionSet', 'granularity', 'percentile', 'sort', 'bucket', 'bin', 'page']]);
    expect(panels.map(panel => panel.outputs.map(output => output.key))).toEqual([[], ['bucket', 'page'], ['bin', 'page'], ['sort', 'page', 'bucket', 'bin', 'percentile', 'tableEquipment']]);
    expect(panels[2].queryInputs.page).toContainEqual({ key: 'tableEquipment', selection: 'filter' });
    for (const panel of panels) expect(panel.queryInputs.context).toEqual(['scopeId', ...Object.keys(cycleKpiEndpoint.context)]);
  });
});

describe('cycle-time panels read the condition preset key (#2433)', () => {
  it('every panel identity changes with conditionSet', async () => {
    const { panelQueryIdentity } = await import('@ap/kernel');
    const panels = manifests.find(menu => menu.id === 'cycle-time')!.panels!;
    for (const panel of panels) expect(panelQueryIdentity(panel, { conditionSet: 'equipment' })).not.toBe(panelQueryIdentity(panel, { conditionSet: 'organization' }));
  });
});
