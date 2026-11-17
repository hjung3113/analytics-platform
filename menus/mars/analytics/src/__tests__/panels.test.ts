import { describe, expect, it } from 'vitest';
import { manifests } from '../index';
import { cycleDistEndpoint, cycleExportEndpoint, cycleKpiEndpoint, cycleSlowPageEndpoint, cycleTrendEndpoint } from '../endpoints';

describe('cycle-time panel declarations (#2433)', () => {
  it('registers the four workspace panels with endpoint and page contracts', () => {
    const panels = manifests.find(menu => menu.id === 'cycle-time')!.panels!;
    expect(panels.map(panel => panel.id)).toEqual(['summary', 'trend', 'distribution', 'slow']);
    expect(panels.map(panel => panel.endpoints)).toEqual([[cycleKpiEndpoint], [cycleTrendEndpoint], [cycleDistEndpoint], [cycleSlowPageEndpoint, cycleExportEndpoint]]);
    expect(panels.map(panel => panel.queryInputs.page?.map(input => input.key) ?? [])).toEqual([[], ['granularity'], [], ['granularity', 'percentile', 'sort', 'bucket', 'bin', 'page']]);
    expect(panels.map(panel => panel.outputs.map(output => output.key))).toEqual([[], ['bucket', 'page'], ['bin', 'page'], ['sort', 'page', 'bucket', 'bin', 'percentile']]);
    for (const panel of panels) expect(panel.queryInputs.context).toEqual(['scopeId', ...Object.keys(cycleKpiEndpoint.context)]);
  });
});
