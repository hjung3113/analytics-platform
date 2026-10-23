import { describe, expect, it } from 'vitest';
import { groupOf, panelOrder } from '../dock/commands';
import { dockGroups, isValidDockTree, type DockNode } from '../dock/schema';
import { applyPreset, hidePanel, initialWorkspaceState, normalizeWorkspaceState, presetTree, resetLayout, settleRows, showPanel, tabAfterHide, withRows, type PanelWorkspaceLayout, type WorkspacePreset, type WorkspaceSpec } from './workspaceState';

const IDS = ['trend', 'selector', 'detail', 'kpi'];
const group = (panels: string[], active?: string): PanelWorkspaceLayout => ({ type: 'group', panels, active });
const balanced: WorkspacePreset = {
  id: 'balanced',
  layout: { type: 'branch', dir: 'row', sizes: [1, 3, 1], children: [group(['selector']), { type: 'branch', dir: 'column', sizes: [1, 3], children: [group(['kpi']), group(['trend'])] }, group(['detail'])] },
};
const focus: WorkspacePreset = { id: 'focus', layout: { type: 'branch', dir: 'row', sizes: [7, 3], children: [group(['trend']), group(['selector', 'detail', 'kpi'])] } };
const spec: WorkspaceSpec = { panelIds: IDS, primaryId: 'trend', presets: [balanced, focus], initialPreset: 'balanced' };

const groupsOf = (tree: DockNode) => dockGroups(tree).map(g => g.panels);
const initial = initialWorkspaceState(spec);

/** The share of the whole area a panel's group takes, from the branch shares. */
function areaOf(tree: DockNode, panelId: string): number {
  const walk = (node: DockNode, share: number): number => {
    if (node.type === 'group') return node.panels.includes(panelId) ? share : 0;
    return node.children.reduce((total, child, index) => total + walk(child, share * (node.sizes[index]! / 100)), 0);
  };
  return walk(tree, 1);
}

describe('presetTree', () => {
  it('turns ratios into shares and keeps the arrangement', () => {
    const tree = presetTree(balanced.layout, IDS);
    expect(groupsOf(tree)).toEqual([['selector'], ['kpi'], ['trend'], ['detail']]);
    expect(tree).toMatchObject({ type: 'branch', dir: 'row', sizes: [20, 60, 20] });
    expect(isValidDockTree(tree, IDS)).toBe(true);
  });

  it('drops ids that are not given and adds the ones the preset does not name to its first group', () => {
    expect(groupsOf(presetTree(balanced.layout, ['trend', 'selector']))).toEqual([['selector'], ['trend']]);
    expect(groupsOf(presetTree(group(['trend']), ['trend', 'kpi']))).toEqual([['trend', 'kpi']]);
  });
});

describe('initialWorkspaceState', () => {
  it('is the initial preset with nothing hidden', () => {
    expect(initial).toMatchObject({ v: 1, preset: 'balanced', hidden: [] });
    expect(panelOrder(initial.layout).sort()).toEqual([...IDS].sort());
  });
});

describe('normalizeWorkspaceState', () => {
  const good = { v: 1, preset: 'focus', layout: presetTree(focus.layout, IDS), hidden: [] };
  const withLayout = (layout: unknown) => ({ ...good, layout });

  it('keeps a valid state as it is', () => {
    expect(normalizeWorkspaceState(JSON.parse(JSON.stringify(good)), spec)).toEqual(good);
  });

  it.each<[string, unknown]>([
    ['undefined', undefined],
    ['null', null],
    ['a string', 'x'],
    ['a number', 7],
    ['an array', []],
    ['a missing version', { ...good, v: undefined }],
    ['a wrong version', { ...good, v: 2 }],
    ['an object without a layout', { v: 1 }],
    ['a layout that is no tree', { ...good, layout: 'nope' }],
    ['a layout naming no known panel', withLayout({ type: 'group', panels: ['zz'], active: 'zz' })],
  ])('repairs %s to a valid state for every panel', (_name, raw) => {
    const state = normalizeWorkspaceState(raw, spec);
    expect(state.v).toBe(1);
    expect(isValidDockTree(state.layout, IDS.filter(id => !state.hidden.includes(id)))).toBe(true);
    expect(state.hidden).toEqual([]);
  });

  it('falls back to the initial preset for an unknown one and keeps the layout', () => {
    const state = normalizeWorkspaceState({ ...good, preset: 'gone' }, spec);
    expect(state.preset).toBe('balanced');
    expect(groupsOf(state.layout)).toEqual([['trend'], ['selector', 'detail', 'kpi']]);
  });

  it.each<[string, unknown, string[][]]>([
    ['an unknown id', withLayout({ type: 'group', panels: ['trend', 'selector', 'ghost', 'detail', 'kpi'], active: 'ghost' }), [['trend', 'selector', 'detail', 'kpi']]],
    ['a duplicate id', withLayout({ type: 'branch', dir: 'row', sizes: [50, 50], children: [group(['trend', 'kpi']), group(['kpi', 'selector', 'detail'])] }), [['trend', 'kpi'], ['selector', 'detail']]],
    ['an empty group', withLayout({ type: 'branch', dir: 'row', sizes: [50, 50], children: [group([]), group(['trend', 'selector', 'detail', 'kpi'])] }), [['trend', 'selector', 'detail', 'kpi']]],
  ])('repairs %s', (_name, raw, expected) => {
    expect(groupsOf(normalizeWorkspaceState(raw, spec).layout)).toEqual(expected);
  });

  it.each<[string, number[]]>([
    ['sizes that do not add up', [30, 30]],
    ['a negative size', [-10, 110]],
    ['a non-finite size', [Number.NaN, 100]],
    ['too few sizes', [100]],
  ])('replaces %s by equal shares', (_name, sizes) => {
    const raw = withLayout({ type: 'branch', dir: 'row', sizes, children: [group(['trend', 'kpi']), group(['selector', 'detail'])] });
    expect(normalizeWorkspaceState(raw, spec).layout).toMatchObject({ type: 'branch', sizes: [50, 50] });
  });

  it('adds a panel that is neither in the tree nor hidden to the primary\'s group, behind its active tab', () => {
    const raw = withLayout({ type: 'branch', dir: 'row', sizes: [50, 50], children: [group(['selector']), group(['detail', 'trend'], 'trend')] });
    const state = normalizeWorkspaceState(raw, spec);
    expect(groupsOf(state.layout)).toEqual([['selector'], ['detail', 'trend', 'kpi']]);
    expect(dockGroups(state.layout)[1]!.active).toBe('trend');
  });

  it('puts the primary back when the stored tree lacks it', () => {
    const raw = withLayout({ type: 'group', panels: ['selector', 'detail'], active: 'selector' });
    expect(panelOrder(normalizeWorkspaceState(raw, spec).layout).sort()).toEqual([...IDS].sort());
  });

  it('keeps hidden panels out of the tree, and drops the primary, unknown ids and duplicates from the hidden list', () => {
    const raw = { v: 1, preset: 'focus', hidden: ['detail', 'detail', 'trend', 'ghost', 7], layout: presetTree(focus.layout, ['trend', 'selector', 'kpi']) };
    const state = normalizeWorkspaceState(raw, spec);
    expect(state.hidden).toEqual(['detail']);
    expect(panelOrder(state.layout)).not.toContain('detail');
    expect(panelOrder(state.layout)).toContain('trend');
  });

  it('puts a hidden panel the tree still names out of the tree', () => {
    const state = normalizeWorkspaceState({ ...good, hidden: ['kpi'] }, spec);
    expect(state.hidden).toEqual(['kpi']);
    expect(panelOrder(state.layout)).not.toContain('kpi');
  });

  it('does not treat an array as a layout node, even one carrying node fields', () => {
    const layout = Object.assign([], { type: 'group', panels: ['detail', 'trend'] });
    const state = normalizeWorkspaceState({ v: 1, preset: 'focus', layout, hidden: [] }, spec);
    expect(state.layout).toEqual(presetTree(focus.layout, IDS));
  });

  it('does not throw on a cyclic value', () => {
    const loop: Record<string, unknown> = { type: 'branch', dir: 'row', sizes: [100], children: [] };
    (loop.children as unknown[]).push(loop);
    expect(() => normalizeWorkspaceState({ v: 1, preset: 'focus', layout: loop, hidden: [] }, spec)).not.toThrow();
  });
});

describe('commands', () => {
  it('applyPreset arranges the panels that are shown and leaves hidden ones hidden', () => {
    const hidden = hidePanel(initial, 'detail', 'trend');
    const next = applyPreset(hidden, focus);
    expect(next.preset).toBe('focus');
    expect(next.hidden).toEqual(['detail']);
    expect(groupsOf(next.layout)).toEqual([['trend'], ['selector', 'kpi']]);
  });

  it('resetLayout is the current preset\'s arrangement of every panel and clears hidden', () => {
    const moved = hidePanel(applyPreset(initial, focus), 'kpi', 'trend');
    const reset = resetLayout(moved, focus);
    expect(reset.hidden).toEqual([]);
    expect(reset.preset).toBe('focus');
    expect(reset.layout).toEqual(presetTree(focus.layout, IDS));
  });

  it.each(['selector', 'detail', 'kpi'])('hidePanel(%s) never makes the primary smaller, in either preset', id => {
    for (const preset of [balanced, focus]) {
      const state = applyPreset(initial, preset);
      const before = areaOf(state.layout, 'trend');
      const next = hidePanel(state, id, 'trend');
      expect(next.hidden).toEqual([id]);
      expect(panelOrder(next.layout)).not.toContain(id);
      expect(areaOf(next.layout, 'trend')).toBeGreaterThanOrEqual(before - 1e-9);
      expect(isValidDockTree(next.layout, IDS.filter(other => other !== id))).toBe(true);
    }
  });

  it('hidePanel leaves the primary, a hidden panel and an unknown id alone', () => {
    expect(hidePanel(initial, 'trend', 'trend')).toBe(initial);
    expect(hidePanel(initial, 'ghost', 'trend')).toBe(initial);
    const hidden = hidePanel(initial, 'detail', 'trend');
    expect(hidePanel(hidden, 'detail', 'trend')).toBe(hidden);
  });

  it.each([balanced, focus])('showPanel never covers the primary ($id)', preset => {
    const start = applyPreset(initial, preset);
    for (const id of ['selector', 'detail', 'kpi']) {
      const shown = showPanel(hidePanel(start, id, 'trend'), id, 'trend', preset);
      expect(shown.hidden).toEqual([]);
      expect(isValidDockTree(shown.layout, IDS)).toBe(true);
      expect(groupOf(shown.layout, 'trend')!.active).toBe('trend');
      expect(groupOf(shown.layout, id)!.panels).not.toContain('trend');
    }
    expect(showPanel(initial, 'detail', 'trend', balanced)).toBe(initial);
  });

  it('showPanel puts the panel into the group of a preset sibling that is still shown, as the active tab', () => {
    const hidden = hidePanel(applyPreset(initial, focus), 'detail', 'trend');
    const shown = showPanel(hidden, 'detail', 'trend', focus);
    expect(groupsOf(shown.layout)).toEqual([['trend'], ['selector', 'kpi', 'detail']]);
    expect(groupOf(shown.layout, 'detail')!.active).toBe('detail');
  });

  it('showPanel without a sibling goes to the first group in reading order that is not the primary\'s', () => {
    const shown = showPanel(hidePanel(initial, 'detail', 'trend'), 'detail', 'trend', balanced);
    expect(groupsOf(shown.layout)).toEqual([['selector', 'detail'], ['kpi'], ['trend']]);
  });

  it('showPanel splits to the right of the primary when only its group exists', () => {
    const alone = { ...initial, layout: presetTree(group(['trend']), ['trend']), hidden: ['detail'] };
    const shown = showPanel(alone, 'detail', 'trend', balanced);
    expect(groupsOf(shown.layout)).toEqual([['trend'], ['detail']]);
    expect(shown.layout).toMatchObject({ type: 'branch', dir: 'row' });
  });

  it('tabAfterHide names the tab now active in the group the panel left, else the primary', () => {
    const state = applyPreset(initial, focus);
    const afterDetail = hidePanel(state, 'detail', 'trend');
    expect(tabAfterHide(state, afterDetail, 'detail', 'trend')).toBe(groupOf(afterDetail.layout, 'selector')!.active);
    const lone = hidePanel(initial, 'detail', 'trend');
    expect(tabAfterHide(initial, lone, 'detail', 'trend')).toBe('trend');
  });
});

describe('height mode and rows (#686)', () => {
  const columns: PanelWorkspacePresetLayout = { type: 'branch', dir: 'column', sizes: [1, 1, 1], children: [group(['trend']), group(['selector', 'detail']), group(['kpi'])] };
  const rowSpec: WorkspaceSpec = { ...spec, presets: [{ id: 'column', layout: columns }, balanced, focus], initialPreset: 'column' };
  const base = initialWorkspaceState(rowSpec);
  const stored = (extra: Record<string, unknown>) => ({ v: 1, preset: base.preset, layout: base.layout, hidden: [], ...extra });
  const env = { minimum: () => 200, maximum: 700, baseline: 900 };

  it('a state written before the mode existed loads as fit, keeping preset, layout and hidden', () => {
    const state = normalizeWorkspaceState(stored({}), rowSpec);
    expect(state).toEqual(base);
    expect(state.mode).toBeUndefined();
    expect(state.rows).toBeUndefined();
  });

  it.each<[string, Record<string, unknown>, number[] | undefined, boolean]>([
    ['valid rows are kept', { mode: 'stack', rows: [300, 420, 380] }, [300, 420, 380], true],
    ['rows are rounded', { mode: 'stack', rows: [300.4, 420.6, 380] }, [300, 421, 380], true],
    ['a row under its minimum is raised to it', { mode: 'stack', rows: [120, 420, 380] }, [200, 420, 380], true],
    ['a wrong row count drops the rows (they are measured again)', { mode: 'stack', rows: [300, 420] }, undefined, true],
    ['a non-number row drops the rows', { mode: 'stack', rows: [300, '420', 380] }, undefined, true],
    ['a zero or negative row drops the rows', { mode: 'stack', rows: [300, 0, 380] }, undefined, true],
    ['a NaN or infinite row drops the rows', { mode: 'stack', rows: [300, Number.POSITIVE_INFINITY, 380] }, undefined, true],
    ['an absurd row drops the rows', { mode: 'stack', rows: [300, 1e9, 380] }, undefined, true],
    ['rows that are not an array drop the rows', { mode: 'stack', rows: 'tall' }, undefined, true],
    ['no rows at all is stack still to be measured', { mode: 'stack' }, undefined, true],
    ['any other mode is fit, and rows are not read', { mode: 'wide', rows: [300, 420, 380] }, undefined, false],
    ['rows without a mode are dropped', { rows: [300, 420, 380] }, undefined, false],
  ])('%s', (_name, extra, rows, isStack) => {
    const state = normalizeWorkspaceState(stored(extra), rowSpec);
    expect(state.mode).toBe(isStack ? 'stack' : undefined);
    expect(state.rows).toEqual(rows);
    if (rows) expect(state.layout).toMatchObject({ sizes: [expect.any(Number), expect.any(Number), expect.any(Number)] });
  });

  it('uses the spec\'s row minimum when it has one', () => {
    const state = normalizeWorkspaceState(stored({ mode: 'stack', rows: [250, 420, 380] }), { ...rowSpec, rowMinimum: () => 260 });
    expect(state.rows).toEqual([260, 420, 380]);
  });

  it('never throws on garbage and gives a usable fit state', () => {
    for (const raw of [null, 1, 'x', [], { v: 1, mode: 'stack', rows: null, layout: 5 }, { v: 2, mode: 'stack', rows: [1] }]) {
      expect(() => normalizeWorkspaceState(raw, rowSpec)).not.toThrow();
      expect(isValidDockTree(normalizeWorkspaceState(raw, rowSpec).layout, IDS)).toBe(true);
    }
  });

  it('projects the rows onto the top-level shares and serialises mode and rows after the old fields', () => {
    const state = withRows(base, 'stack', [300, 300, 600]);
    expect(state.layout).toMatchObject({ sizes: [25, 25, 50] });
    expect(Object.keys(state)).toEqual(['v', 'preset', 'layout', 'hidden', 'mode', 'rows']);
    expect(Object.keys(withRows(state, 'fit'))).toEqual(['v', 'preset', 'layout', 'hidden']);
  });

  describe('settleRows', () => {
    const stacked = withRows(base, 'stack', [300, 500, 400]);
    it('fit stays free of rows, whatever an edit leaves on it', () => {
      expect(settleRows(base, { ...base, rows: [1, 2, 3] }, 'keep', env).rows).toBeUndefined();
      expect(settleRows(base, base, 'keep', env)).toBe(base);
    });
    it('hiding the only panel of a row drops that row and keeps the others\' px', () => {
      const next = settleRows(stacked, hidePanel(stacked, 'kpi', 'trend'), 'keep', env);
      expect(next.rows).toEqual([300, 500]);
    });
    it('showing it again adds a 360 row only when it makes a row', () => {
      const hidden = settleRows(stacked, hidePanel(stacked, 'kpi', 'trend'), 'keep', env);
      const shown = settleRows(hidden, showPanel(hidden, 'kpi', 'trend', { id: 'column', layout: columns }), 'keep', env);
      expect(shown.rows!.slice(0, 2)).toEqual([300, 500]);
      expect(shown.rows!.length).toBe(topLevelRowCount(shown));
    });
    it('a preset or 기본 배치 derives the rows again from the shares and the baseline, and repeating it adds no height', () => {
      const fit = { ...env, baseline: 1500 };
      const once = settleRows(stacked, resetLayout(stacked, { id: 'column', layout: columns }), 'enter', fit);
      expect(once.rows).toEqual([500, 500, 500]);
      const again = settleRows(once, resetLayout(once, { id: 'column', layout: columns }), 'enter', fit);
      expect(again.rows).toEqual(once.rows);
    });
    it('rows still to be measured stay so through an edit', () => {
      const pending = withRows(base, 'stack');
      expect(settleRows(pending, { ...pending, hidden: ['x'] }, 'keep', env)).toMatchObject({ mode: 'stack' });
      expect(settleRows(pending, { ...pending, hidden: ['x'] }, 'keep', env).rows).toBeUndefined();
    });
  });
});

type PanelWorkspacePresetLayout = PanelWorkspaceLayout;
const topLevelRowCount = (state: { layout: DockNode }) => (state.layout.type === 'branch' && state.layout.dir === 'column' ? state.layout.children.length : 1);
