import { describe, expect, it } from 'vitest';
import { EQUIPMENT_SELECTION_DIMENSION, PANEL_INSTANCES_MAX, type AnalysisSelection, type PanelInstance } from '@ap/contracts';
import { buildSavedPanels, heldOf, heldSourceFor, isHeldSource, keepHeld, panelAdditionOverflows, planAdd, withAdded, type AddIntent, type PanelConfiguration } from './heldPanels';

// #2862 R C2·C3·C6: the pure rules behind held raw tables.
const equipment = { key: 'motionEquipment', dimension: EQUIPMENT_SELECTION_DIMENSION, shape: 'set' } as const;
const source = (id: string, outputs: PanelInstance['outputs'] = [equipment]): PanelInstance => ({ id, source: { kind: 'declared', panel: 'moduleMotions' }, inputs: [], outputs });
const declared = (id: string, inputs: PanelInstance['inputs'] = []): PanelInstance => ({ id, source: { kind: 'declared', panel: id }, inputs, outputs: [] });
const hold = (from: string, value: AnalysisSelection = { shape: 'set', values: ['MEM-PHOTO-0105'] }, key = 'motionEquipment') =>
  ({ key, from, mode: 'hold' as const, value });
const custom = (added: PanelInstance[], sources: PanelInstance[] = []): PanelConfiguration => ({ kind: 'custom', added: added.map(instance => ({ slot: instance.id, instance })), sources });

describe('heldSourceFor', () => {
  it('reuses a kept equipment source', () => {
    const kept = source('held-source');
    expect(heldSourceFor({ kind: 'custom', added: [], sources: [kept] })).toEqual({ sources: [kept], id: 'held-source', added: false });
  });
  it('takes a free id when a saved panel already uses the reserved one, and does not reuse a source of another shape', () => {
    const taken = declared('held-source');
    const range = source('held-source-2', [{ ...equipment, shape: 'range' }]);
    const next = heldSourceFor({ kind: 'custom', added: [{ slot: 'saved-panel-0', instance: taken }], sources: [range] });
    expect(next.id).toBe('held-source-3');
    expect(next.sources).toEqual([range, source('held-source-3')]);
  });
  it('avoids a mounted slot name too, like every other new id (#3164)', () => {
    const chart = declared('saved-x');
    expect(heldSourceFor({ kind: 'custom', added: [{ slot: 'held-source', instance: chart }], sources: [] }).id).toBe('held-source-2');
  });
});

describe('buildSavedPanels', () => {
  it('keeps a restored source as saved while something names it and drops it after', () => {
    const range = source('held-source', [{ ...equipment, shape: 'range' }]);
    const table = declared('table', [hold('held-source.motionEquipment', { shape: 'range', from: '2026-09-01T00:00:00', to: '2026-09-02T00:00:00' })]);
    expect(buildSavedPanels(custom([table], [range]), 4)).toEqual({ version: 1, instances: [table, range] });
    expect(buildSavedPanels(custom([declared('table')], [range]), 4)).toEqual({ version: 1, instances: [declared('table')] });
  });
});

describe('panelAdditionOverflows', () => {
  const full = (count: number) => Array.from({ length: count }, (_, index) => declared(`panel-${index}`));
  const holding: AddIntent = { mode: 'hold', held: { motionEquipment: { shape: 'set', values: ['MEM-PHOTO-0105'] } } };
  it('tells before a hold would pass the saved panel limit, counting a new source', () => {
    expect(panelAdditionOverflows(custom(full(PANEL_INSTANCES_MAX - 2)), 4, 'table', holding)).toBe(false);
    expect(panelAdditionOverflows(custom(full(PANEL_INSTANCES_MAX - 1)), 4, 'table', holding)).toBe(true);
    expect(panelAdditionOverflows({ kind: 'default' }, 4, 'table', holding)).toBe(false);
  });
  it('measures what would be saved: a replaced hold drops its range source, so 24 still fits (R2 C11)', () => {
    const range = source('held-source', [{ ...equipment, shape: 'range' }]);
    const table = declared('table', [hold('held-source.motionEquipment', { shape: 'range', from: '2026-09-01T00:00:00', to: '2026-09-02T00:00:00' })]);
    expect(buildSavedPanels(custom([table, ...full(PANEL_INSTANCES_MAX - 2)], [range]), 4)?.instances).toHaveLength(PANEL_INSTANCES_MAX);
    expect(panelAdditionOverflows(custom([table, ...full(PANEL_INSTANCES_MAX - 2)], [range]), 4, 'table', holding)).toBe(false);
  });
  it('counts the instance a pinned table gets first, and a second following table (#2862 ② R C2)', () => {
    const materialize = true;
    expect(planAdd(custom(full(PANEL_INSTANCES_MAX - 2)), 'table', 4, holding, materialize).overflows).toBe(true);
    expect(planAdd(custom(full(PANEL_INSTANCES_MAX - 3)), 'table', 4, holding, materialize).overflows).toBe(false);
    const held = custom([declared('table', [hold('held-source.motionEquipment')]), ...full(PANEL_INSTANCES_MAX - 2)], [source('held-source')]);
    expect(planAdd(held, 'table', 4, { mode: 'follow' }).overflows).toBe(true);
    expect(planAdd(custom(full(PANEL_INSTANCES_MAX)), 'table', 4).overflows).toBe(true);
  });
});

describe('isHeldSource', () => {
  it('needs the reserved id, the «모듈 동작» declaration, no inputs and the equipment output (R2 C2)', () => {
    expect(isHeldSource(source('held-source-2'))).toBe(true);
    expect(isHeldSource(source('held-source-2', []))).toBe(false);
    expect(isHeldSource(source('motion-chart'))).toBe(false);
  });
});

describe('keepHeld', () => {
  it('keeps only held tables across a drill step, without the session source panel', () => {
    const table = declared('table', [hold('held-source.motionEquipment')]);
    const kept = source('held-source');
    const config: PanelConfiguration = { kind: 'custom', added: [{ slot: 'table', instance: table, heldFrom: 'moduleMotions' }, { slot: 'donut', instance: declared('donut') }], sources: [kept] };
    expect(keepHeld(config)).toEqual({ kind: 'custom', added: [{ slot: 'table', instance: table }], sources: [kept] });
    expect(keepHeld(custom([declared('donut')]))).toEqual({ kind: 'default' });
  });
  it('keeps a drawn chart a held table names as a hidden source, so the saved graph stays valid (R2 C3)', () => {
    const chart = source('motion-chart');
    const table = declared('table', [hold('motion-chart.motionEquipment')]);
    const next = keepHeld(custom([chart, table, declared('donut')]));
    expect(next).toEqual({ kind: 'custom', added: [{ slot: 'table', instance: table }], sources: [chart] });
    expect(buildSavedPanels(next, 3)).toEqual({ version: 1, instances: [table, chart] });
  });
});

describe('heldOf', () => {
  const kept = source('held-source');
  it('reads the held equipment with the dimension of the saved source output', () => {
    expect(heldOf(declared('table', [hold('held-source.motionEquipment')]), [kept])).toEqual({
      held: { motionEquipment: { dimension: EQUIPMENT_SELECTION_DIMENSION, selection: { shape: 'set', values: ['MEM-PHOTO-0105'] } } }, unread: false, count: 1,
    });
  });
  it.each([
    ['another dimension', [source('held-source', [{ ...equipment, dimension: 'module' }])], hold('held-source.motionEquipment')],
    ['a missing source', [], hold('held-source.motionEquipment')],
    ['another key', [kept], hold('held-source.motionEquipment', undefined, 'other')],
  ])('marks %s unread', (_name, instances, input) => {
    expect(heldOf(declared('table', [input]), instances)).toMatchObject({ unread: true, count: 0 });
  });
  it('marks a valid range source and range hold unread: this table reads an equipment set (R2 C6)', () => {
    const range = source('held-source', [{ ...equipment, shape: 'range' }]);
    expect(heldOf(declared('table', [hold('held-source.motionEquipment', { shape: 'range', from: '2026-09-01T00:00:00', to: '2026-09-02T00:00:00' })]), [range])).toMatchObject({ unread: true, count: 0 });
  });
  it('keeps the saved dimension so the SDK compares it with the channel', () => {
    expect(heldOf(declared('table', [hold('held-source.motionEquipment')]), [source('held-source', [{ ...equipment, dimension: 'module' }])]).held.motionEquipment?.dimension).toBe('module');
  });
});

describe('withAdded: the same panel twice (#2862 ②)', () => {
  const holding: AddIntent = { mode: 'hold', held: { motionEquipment: { shape: 'set', values: ['MEM-PHOTO-0105'] } } };
  const following = declared('table');
  const heldTable = (id: string) => ({ ...declared('table', [hold('held-source.motionEquipment')]), id });
  const slots = (config: PanelConfiguration | null) => config?.kind === 'custom' ? config.added.map(panel => [panel.slot, panel.instance.inputs.map(input => input.mode).join()]) : [];
  it('holds a second instance beside a following one, and changes the held one after that', () => {
    const first = withAdded(custom([following]), 'table', 4, holding);
    expect(first.slot).toBe('saved-instance-table-held');
    expect(slots(first.config)).toEqual([['table', ''], ['saved-instance-table-held', 'hold']]);
    const again = withAdded(first.config!, 'table', 4, holding);
    expect(again.slot).toBe('saved-instance-table-held');
    expect(slots(again.config)).toEqual([['table', ''], ['saved-instance-table-held', 'hold']]);
  });
  it('follows in a second instance beside a held one, and only reveals an open following one', () => {
    const added = withAdded(custom([heldTable('table')], [source('held-source')]), 'table', 4, { mode: 'follow' });
    expect(added.slot).toBe('saved-instance-table-2');
    expect(slots(added.config)).toEqual([['table', 'hold'], ['saved-instance-table-2', '']]);
    expect(withAdded(added.config!, 'table', 4, { mode: 'follow' })).toEqual({ config: null, slot: 'saved-instance-table-2' });
    expect(withAdded(added.config!, 'table', 4)).toEqual({ config: null, slot: 'saved-instance-table-2' });
  });
  it('changes the later instance when two are already open, so the first keeps the address row and page (R C5)', () => {
    const twoHeld = custom([heldTable('table'), heldTable('table-held')], [source('held-source')]);
    expect(slots(withAdded(twoHeld, 'table', 4, { mode: 'follow' }).config)).toEqual([['table', 'hold'], ['table-held', 'follow']]);
    const twoFollowing = custom([following, { ...declared('table'), id: 'table-2' }]);
    expect(slots(withAdded(twoFollowing, 'table', 4, holding).config)).toEqual([['table', ''], ['table-2', 'hold']]);
  });
  it('changes only the second of the two open instances when a saved view has a third (R2 C13)', () => {
    const three = custom([following, { ...declared('table'), id: 'table-2' }, { ...declared('table'), id: 'table-3' }]);
    expect(slots(withAdded(three, 'table', 4, holding).config)).toEqual([['table', ''], ['table-2', 'hold'], ['table-3', '']]);
    const threeHeld = custom([heldTable('table'), heldTable('table-2'), heldTable('table-3')], [source('held-source')]);
    expect(slots(withAdded(threeHeld, 'table', 4, { mode: 'follow' }).config)).toEqual([['table', 'hold'], ['table-2', 'follow'], ['table-3', 'hold']]);
  });
  it('drops a held third across a drill, as it never opened (R2 C13)', () => {
    expect(keepHeld(custom([following, { ...declared('table'), id: 'table-2' }, heldTable('table-3')], [source('held-source')]))).toEqual({ kind: 'default' });
  });
  it('makes the pinned table a following instance beside a held one before a hold (R2 C11)', () => {
    const plan = planAdd(custom([heldTable('table')], [source('held-source')]), 'table', 4, holding, true);
    expect(slots(plan.config)).toEqual([['table', 'hold'], ['saved-instance-table-2', '']]);
  });
  it('gives a first instance a free id when a restored panel of another declaration uses the declared one (R C9)', () => {
    const other = { slot: 'saved-panel-0', instance: { ...declared('donut'), id: 'table' } };
    const next = withAdded({ kind: 'custom', added: [other], sources: [] }, 'table', 4, holding);
    expect(next.slot).toBe('saved-instance-table-2');
    expect(buildSavedPanels(next.config!, 4)?.instances.map(instance => instance.id)).toEqual(['table', 'table-2', 'held-source']);
  });
});
