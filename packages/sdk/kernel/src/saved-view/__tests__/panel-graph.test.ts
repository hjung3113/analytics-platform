import { describe, expect, it } from 'vitest';
import type { PanelInstance } from '@ap/contracts';
import { followInput, followInstead, freePanelId, holdInput, holdsSelection, namesInstance, resolveHeldInputs } from '../panel-graph';

const set = (...values: string[]) => ({ shape: 'set', values } as const);
const instance = (id: string, rest: Partial<PanelInstance> = {}): PanelInstance => ({ id, source: { kind: 'declared', panel: id }, inputs: [], outputs: [], ...rest });

describe('panel graph pieces (#3164)', () => {
  it('allocates base, then base-2, base-3 against every taken name', () => {
    expect(freePanelId('table', [])).toBe('table');
    expect(freePanelId('table', ['table'])).toBe('table-2');
    expect(freePanelId('table', ['table', 'table-2', 'other'])).toBe('table-3');
  });

  it('builds follow and hold inputs that name the output, with the receiving mode only when given', () => {
    expect(followInput('chart', 'equipment')).toEqual({ key: 'equipment', from: 'chart.equipment', mode: 'follow' });
    expect(holdInput('chart', 'equipment', set('A'), 'highlight')).toEqual({ key: 'equipment', from: 'chart.equipment', mode: 'hold', value: set('A'), use: 'highlight' });
  });

  it('switches every held input to follow, keeping key, source and receiving mode', () => {
    const held = instance('table', { inputs: [holdInput('chart', 'equipment', set('A'), 'filter'), followInput('chart', 'time')] });
    expect(holdsSelection(held)).toBe(true);
    const followed = followInstead(held);
    expect(followed.inputs).toEqual([followInput('chart', 'equipment', 'filter'), followInput('chart', 'time')]);
    expect(holdsSelection(followed)).toBe(false);
    expect(followInstead(followed)).toBe(followed);
  });

  it('tells whether an instance reads another instance', () => {
    const table = instance('table', { inputs: [followInput('chart', 'equipment')] });
    expect(namesInstance([table], 'chart')).toBe(true);
    expect(namesInstance([table], 'char')).toBe(false);
  });

  it('resolves held inputs to their source output dimension and lists the ones naming no output', () => {
    const chart = instance('chart', { outputs: [{ key: 'equipment', dimension: 'equipment-id', shape: 'set' }] });
    const table = instance('table', { inputs: [holdInput('chart', 'equipment', set('A')), holdInput('gone', 'time', set('B')), followInput('chart', 'equipment')] });
    expect(resolveHeldInputs(table, [chart, table])).toEqual({
      held: { equipment: { dimension: 'equipment-id', selection: set('A') } },
      unresolved: ['time'],
    });
  });
});
