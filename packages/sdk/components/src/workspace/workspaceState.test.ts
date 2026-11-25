import { describe, expect, it, vi } from 'vitest';
import { groupOf, panelOrder } from '../dock/commands';
import { dockGroups, isValidDockTree, type DockNode } from '../dock/schema';
import { applyPreset, changeMode, hidePanel, initialWorkspaceState, normalizeWorkspaceState, presetTree, rememberSharedRows, resetLayout, settleRows, showPanel, tabAfterHide, updateWorkspacePanels, withRows, type PanelWorkspaceLayout, type WorkspacePreset, type WorkspaceSpec } from './workspaceState';
import { topLevelRows } from './workspaceRows';
import { readWorkspaceState, writeWorkspaceState } from './workspaceStorage';

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

describe('initialMode (#690)', () => {
  const stackSpec: WorkspaceSpec = { ...spec, initialMode: 'stack' };
  const saved = { v: 1, preset: 'focus', layout: presetTree(focus.layout, IDS), hidden: [] };

  it('an untouched workspace starts in stack mode, rows still to be measured; initialMode fit starts fitted, and so does a stored value without mode', () => {
    expect(initialWorkspaceState(stackSpec)).toMatchObject({ v: 1, preset: 'balanced', hidden: [], mode: 'stack' });
    expect(initialWorkspaceState(stackSpec).rows).toBeUndefined();
    expect(initialWorkspaceState({ ...spec, initialMode: 'fit' }).mode).toBeUndefined();
    // ADR-0130: without initialMode the start is stack as well.
    expect(initialWorkspaceState(spec)).toMatchObject({ mode: 'stack' });
  });

  it('a saved fit wins over initialMode, and so does a saved stack over initialMode fit', () => {
    expect(normalizeWorkspaceState(saved, stackSpec).mode).toBeUndefined();
    expect(normalizeWorkspaceState({ ...saved, mode: 'fit' }, stackSpec).mode).toBeUndefined();
    expect(normalizeWorkspaceState({ ...saved, mode: 'stack' }, { ...spec, initialMode: 'fit' }).mode).toBe('stack');
  });

  it('an old saved value without mode reads as fit, not as initialMode', () => {
    const old = JSON.parse(JSON.stringify(saved)) as Record<string, unknown>;
    expect('mode' in old).toBe(false);
    const state = normalizeWorkspaceState(old, stackSpec);
    expect(state.mode).toBeUndefined();
    expect(state.rows).toBeUndefined();
  });

  it('기본 배치 keeps the height mode the user has, and never rewrites it to initialMode', () => {
    const fitNow = normalizeWorkspaceState(saved, stackSpec);
    expect(resetLayout(fitNow, balanced).mode).toBeUndefined();
    const stackNow = withRows(fitNow, 'stack');
    expect(resetLayout(stackNow, balanced).mode).toBe('stack');
    expect(resetLayout(stackNow, balanced)).toMatchObject({ preset: 'balanced', hidden: [] });
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
  const rowSpec: WorkspaceSpec = { ...spec, presets: [{ id: 'column', layout: columns }, balanced, focus], initialPreset: 'column', initialMode: 'fit' };
  const base = initialWorkspaceState(rowSpec);
  const stored = (extra: Record<string, unknown>) => ({ v: 1, preset: base.preset, layout: base.layout, hidden: [], ...extra });
  const env = { minimum: () => 200, maximum: 700, baseline: 900, oneRow: 600 };

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

  describe('a stored row under a newly declared preferred height (#2786)', () => {
    // `kpi` asks for 480 px (its row's preferred height); the other rows declare nothing.
    const heights = new Map([['kpi', 480]]);
    const preferredSpec: WorkspaceSpec = { ...rowSpec, preferredHeights: heights, rowPreferred: row => (panelOrder(row).includes('kpi') ? 480 : undefined) };

    it('is raised once to it, and the state records the declarations it saw', () => {
      const state = normalizeWorkspaceState(stored({ mode: 'stack', rows: [300, 420, 380] }), preferredSpec);
      expect(state.rows).toEqual([300, 420, 480]);
      expect(state.preferredSeen).toEqual({ kpi: 480 });
    });

    it('keeps the user\'s smaller height after that, until the menu declares a larger one', () => {
      const shrunk = stored({ mode: 'stack', rows: [300, 420, 380], preferredSeen: { kpi: 480 } });
      expect(normalizeWorkspaceState(shrunk, preferredSpec).rows).toEqual([300, 420, 380]);
      const grown: WorkspaceSpec = { ...preferredSpec, preferredHeights: new Map([['kpi', 560]]), rowPreferred: row => (panelOrder(row).includes('kpi') ? 560 : undefined) };
      expect(normalizeWorkspaceState(shrunk, grown).rows).toEqual([300, 420, 560]);
    });

    it('leaves a taller row, rows without a declaration and fit mode alone', () => {
      expect(normalizeWorkspaceState(stored({ mode: 'stack', rows: [300, 420, 600] }), preferredSpec).rows).toEqual([300, 420, 600]);
      const fit = normalizeWorkspaceState(stored({}), preferredSpec);
      expect(fit.mode).toBeUndefined();
      expect(fit.rows).toBeUndefined();
    });

    it('a new workspace starts with the declarations seen, so a later shrink is not undone', () => {
      expect(initialWorkspaceState(preferredSpec).preferredSeen).toEqual({ kpi: 480 });
      expect(initialWorkspaceState(rowSpec).preferredSeen).toBeUndefined();
    });

    it.each([NaN, Infinity, -1])('raises a valid declaration during re-match and leaves the row with %s alone', invalid => {
      const next = normalizeWorkspaceState(stored({ mode: 'stack', rows: [300, 420, 380] }), {
        ...preferredSpec, panelIds: [...IDS, 'extra'], below: ['extra'],
        preferredHeights: new Map([['trend', invalid], ['kpi', 480]]),
        rowPreferred: row => (panelOrder(row).includes('trend') ? invalid : preferredSpec.rowPreferred?.(row)),
      });
      expect(next.rows).toEqual([300, 420, 480, 360]);
      expect(next.preferredSeen).toEqual({ kpi: 480 });
    });
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

describe('default start and stackPreset (ADR-0130)', () => {
  const column: WorkspacePreset = { id: 'column', layout: { type: 'branch', dir: 'column', sizes: [1, 1, 1], children: [group(['trend']), group(['selector', 'detail']), group(['kpi'])] } };
  const withStack: WorkspaceSpec = { ...spec, presets: [balanced, focus, column], stackPreset: 'column' };
  const env = { minimum: () => 200, maximum: 700, baseline: 900, oneRow: 600 };
  const fit = (state: ReturnType<typeof initialWorkspaceState>) => withRows(state, 'fit');

  it('an untouched workspace starts in stack on stackPreset; initialMode fit starts on initialPreset; no stackPreset starts on initialPreset', () => {
    expect(initialWorkspaceState(withStack)).toMatchObject({ preset: 'column', mode: 'stack' });
    expect(initialWorkspaceState({ ...withStack, initialMode: 'fit' })).toMatchObject({ preset: 'balanced' });
    expect(initialWorkspaceState({ ...withStack, initialMode: 'fit' }).mode).toBeUndefined();
    expect(initialWorkspaceState(spec)).toMatchObject({ preset: 'balanced', mode: 'stack' });
  });

  it('an unknown stackPreset is ignored (exact lookup, never the first preset)', () => {
    expect(initialWorkspaceState({ ...withStack, stackPreset: 'nope' })).toMatchObject({ preset: 'balanced', mode: 'stack' });
    const fitState = fit(initialWorkspaceState({ ...withStack, stackPreset: 'nope', initialMode: 'fit' }));
    expect(changeMode(fitState, 'stack', { ...withStack, stackPreset: 'nope' }, env).layout).toEqual(fitState.layout);
  });

  it('storage is never rewritten on load: a stored fit, a stored stack and a value without mode keep their layout', () => {
    const stored = { v: 1, preset: 'balanced', layout: presetTree(balanced.layout, IDS), hidden: [] };
    expect(normalizeWorkspaceState(stored, withStack)).toMatchObject({ preset: 'balanced' });
    expect(normalizeWorkspaceState(stored, withStack).mode).toBeUndefined();
    expect(normalizeWorkspaceState({ ...stored, mode: 'stack', rows: [300] }, withStack)).toMatchObject({ preset: 'balanced', mode: 'stack' });
    expect(normalizeWorkspaceState(null, withStack)).toMatchObject({ preset: 'column', mode: 'stack' });
  });

  it('fit to stack applies stackPreset only while the layout still is the initial preset', () => {
    const untouched = fit(initialWorkspaceState({ ...withStack, initialMode: 'fit' }));
    const switched = changeMode(untouched, 'stack', withStack, env);
    expect(switched).toMatchObject({ preset: 'column', mode: 'stack' });
    expect(groupsOf(switched.layout)).toEqual([['trend'], ['selector', 'detail'], ['kpi']]);
    const moved = { ...untouched, layout: presetTree(focus.layout, IDS) };
    expect(changeMode(moved, 'stack', withStack, env).layout).toEqual(moved.layout);
  });

  it('stack to fit applies the initial preset only while the layout still is the stackPreset arrangement', () => {
    const stacked = initialWorkspaceState(withStack);
    expect(changeMode(stacked, 'fit', withStack, env)).toMatchObject({ preset: 'balanced' });
    expect(changeMode(stacked, 'fit', withStack, env).mode).toBeUndefined();
    const moved = { ...stacked, layout: presetTree(focus.layout, IDS) };
    const back = changeMode(moved, 'fit', withStack, env);
    expect(back.layout).toEqual(moved.layout);
    expect(back.mode).toBeUndefined();
  });

  it('sizes, the active tab and the tab order do not make an arrangement the user\'s', () => {
    const untouched = fit(initialWorkspaceState({ ...withStack, initialMode: 'fit' }));
    const tweaked = { ...untouched, layout: presetTree({ ...balanced.layout, sizes: [9, 1, 5] } as PanelWorkspaceLayout, IDS) };
    expect(changeMode(tweaked, 'stack', withStack, env).preset).toBe('column');
    const tabs = fit(initialWorkspaceState({ ...withStack, initialMode: 'fit', presets: [{ id: 'balanced', layout: { type: 'group', panels: ['trend', 'selector', 'detail', 'kpi'] } }, column] }));
    const reordered = { ...tabs, layout: { type: 'group' as const, panels: ['kpi', 'detail', 'selector', 'trend'], active: 'detail' } };
    const spec2 = { ...withStack, presets: [{ id: 'balanced', layout: { type: 'group' as const, panels: ['trend', 'selector', 'detail', 'kpi'] } }, column] };
    expect(changeMode(reordered, 'stack', spec2, env).preset).toBe('column');
  });

  it('hidden panels: the layout is compared with the preset arranged over the panels now shown', () => {
    const untouched = fit(initialWorkspaceState({ ...withStack, initialMode: 'fit' }));
    const hidden = hidePanel(untouched, 'detail', 'trend');
    const switched = changeMode(hidden, 'stack', withStack, env);
    expect(switched.preset).toBe('column');
    expect(panelOrder(switched.layout).sort()).toEqual(['kpi', 'selector', 'trend']);
    expect(switched.hidden).toEqual(['detail']);
  });

  it('without a stackPreset every transition keeps the arrangement', () => {
    const untouched = fit(initialWorkspaceState({ ...spec, initialMode: 'fit' }));
    expect(changeMode(untouched, 'stack', spec, env).layout).toEqual(untouched.layout);
    expect(changeMode(changeMode(untouched, 'stack', spec, env), 'fit', spec, env).layout).toEqual(untouched.layout);
  });

  it('기본 배치 keeps the current preset and the mode', () => {
    const stacked = initialWorkspaceState(withStack);
    expect(resetLayout(stacked, column)).toMatchObject({ preset: 'column', mode: 'stack' });
  });
});

describe('placement below (#2398)', () => {
  const below: WorkspaceSpec = { ...spec, panelIds: [...IDS, 'extra'], presets: [focus], initialPreset: 'focus', below: ['extra'] };
  const lastRow = (tree: DockNode) => tree.type === 'branch' && tree.dir === 'column' ? tree.children[tree.children.length - 1] : undefined;

  it('a below panel the preset does not name is the last row of a fresh workspace and of a preset switch', () => {
    const fresh = initialWorkspaceState({ ...below, initialMode: 'fit' });
    expect(lastRow(fresh.layout)).toMatchObject({ type: 'group', panels: ['extra'] });
    expect(lastRow(applyPreset(fresh, focus, ['extra']).layout)).toMatchObject({ type: 'group', panels: ['extra'] });
    expect(lastRow(resetLayout(fresh, focus, ['extra']).layout)).toMatchObject({ type: 'group', panels: ['extra'] });
  });

  it('a below panel joining a stored layout gets a new last row; stored stack rows keep their px and the new row gets 360', () => {
    const stored = withRows(initialWorkspaceState({ ...spec, presets: [focus], initialPreset: 'focus', initialMode: 'fit' }), 'stack', [500]);
    const next = normalizeWorkspaceState(stored, below);
    expect(lastRow(next.layout)).toMatchObject({ type: 'group', panels: ['extra'] });
    expect(groupOf(next.layout, 'trend')?.active).toBe('trend');
    expect(next.rows).toEqual([500, 360]);
  });

  it('a below panel replacing a gone row: the surviving row keeps its own px (not the gone row\'s) and the new row gets 360', () => {
    const swap: WorkspaceSpec = { ...spec, panelIds: ['trend', 'extra'], presets: [{ id: 'focus', layout: { type: 'group', panels: ['trend'] } }], initialPreset: 'focus', below: ['extra'] };
    const raw = { v: 1, preset: 'focus', layout: { type: 'branch', dir: 'column', sizes: [30, 70], children: [{ type: 'group', panels: ['selector'], active: 'selector' }, { type: 'group', panels: ['trend'], active: 'trend' }] }, hidden: [], mode: 'stack', rows: [250, 600] };
    const next = normalizeWorkspaceState(raw, swap);
    expect(topLevelRows(next.layout).map(panelOrder)).toEqual([['trend'], ['extra']]);
    expect(next.rows).toEqual([600, 360]);
  });

  it('a below panel already placed by the user stays where it is', () => {
    const placed = normalizeWorkspaceState({ v: 1, preset: 'focus', layout: { type: 'branch', dir: 'row', sizes: [50, 50], children: [{ type: 'group', panels: ['trend', 'extra'], active: 'trend' }, { type: 'group', panels: ['selector', 'detail', 'kpi'], active: 'selector' }] }, hidden: [] }, below);
    expect(groupOf(placed.layout, 'extra')?.panels).toEqual(['trend', 'extra']);
  });

  it('uses the prior row height and declarations when a below panel leaves', () => {
    const previous = withRows(initialWorkspaceState(below), 'stack', [300, 500]);
    const remaining = { ...below, panelIds: IDS, below: [], preferredHeights: new Map([['trend', 480]]), rowPreferred: () => 480 };
    expect(updateWorkspacePanels(previous, remaining, ['extra'])).toMatchObject({ rows: [480], preferredSeen: { trend: 480 } });
    expect(updateWorkspacePanels({ ...previous, preferredSeen: { trend: 480 } }, remaining, ['extra']).rows).toEqual([300]);
    expect(updateWorkspacePanels(previous, { ...remaining, rowMinimum: () => 650 }, ['extra'], 400).rows).toEqual([650]);
    const taller = withRows(previous, 'stack', [720, 500]);
    const grown = { ...remaining, preferredHeights: new Map([['trend', 800]]), rowPreferred: () => 800 };
    expect(updateWorkspacePanels(taller, grown, ['extra'], 600).rows).toEqual([720]);
  });

  it('a panel without placement still joins the primary group as a tab', () => {
    const next = normalizeWorkspaceState(initialWorkspaceState({ ...spec, presets: [focus], initialPreset: 'focus' }), { ...below, below: [] });
    expect(groupOf(next.layout, 'extra')?.panels).toContain('trend');
  });
});

describe('shared lower rows (#2490)', () => {
  const base: WorkspaceSpec = {
    panelIds: ['matrix', 'settings', 'runs'],
    primaryId: 'matrix',
    presets: [{ id: 'matrix', layout: group(['matrix']) }],
    initialPreset: 'matrix',
    initialMode: 'fit',
    sharedRows: [{ id: 'trends', panels: ['settings', 'runs'] }],
  };
  const only = (id: string): WorkspaceSpec => ({ ...base, panelIds: ['matrix', id] });

  it('keeps a raised shared row height when a member leaves', () => {
    const size = { id: 'trends', share: 35, height: 300, widths: { settings: 40, runs: 60 } };
    const raw = { ...withRows(initialWorkspaceState(base), 'stack', [410, 300]), sharedRowSizes: [size] };
    const preferred = { ...base, preferredHeights: new Map([['settings', 480]]), rowPreferred: (row: DockNode) => (panelOrder(row).includes('settings') ? 480 : undefined) };
    const restored = normalizeWorkspaceState(raw, preferred);
    const remaining = { ...preferred, panelIds: ['matrix', 'settings'], sharedRows: [{ id: 'trends', panels: ['settings'] }] };
    expect(restored.rows).toEqual([410, 480]);
    expect(restored.sharedRowSizes).toEqual([{ ...size, height: 480 }]);
    expect(updateWorkspacePanels(restored, remaining, []).rows).toEqual([410, 480]);
  });

  it('uses the stored fit share when the settings trend first joins the live panel set', () => {
    const stored = JSON.stringify({
      v: 1, preset: 'matrix', hidden: [],
      layout: { type: 'branch', dir: 'column', sizes: [63, 37], children: [group(['matrix'], 'matrix'), group(['settings'], 'settings')] },
    });
    const setItem = vi.fn();
    const storage = { getItem: () => stored, setItem };
    const loaded = readWorkspaceState('workspace', { ...base, panelIds: ['matrix'], sharedRows: [] }, storage);
    if (loaded === null) throw new Error('Expected the legacy preference');
    expect(panelOrder(loaded.layout)).toEqual(['matrix']);
    writeWorkspaceState('workspace', loaded, storage);
    expect(JSON.parse(setItem.mock.calls[0]![1])).toEqual({
      v: 1, preset: 'matrix', layout: group(['matrix'], 'matrix'), hidden: [],
    });

    const spec = { ...only('settings'), sharedRows: [{ id: 'trends', panels: ['settings'] }] };
    const opened = updateWorkspacePanels(loaded, spec, []);
    expect(opened.layout).toMatchObject({ dir: 'column', sizes: [63, 37] });
    const hidden = hidePanel(opened, 'settings', spec.primaryId);
    const reopened = showPanel(hidden, 'settings', spec.primaryId, spec.presets[0]!, [], spec.sharedRows);
    expect(reopened.layout).toMatchObject({ dir: 'column', sizes: [63, 37] });
    const resized = rememberSharedRows(reopened, {
      ...reopened, layout: { type: 'branch', dir: 'column', sizes: [60, 40], children: topLevelRows(reopened.layout) },
    }, spec.sharedRows);
    const absent = updateWorkspacePanels(resized, { ...spec, panelIds: ['matrix'], sharedRows: [] }, []);
    expect(updateWorkspacePanels(absent, spec, []).layout).toMatchObject({ dir: 'column', sizes: [60, 40] });
  });

  it('remembers a legacy 63/37 fit split when the settings trend is first hidden and shown', () => {
    const stored = JSON.stringify({
      v: 1, preset: 'matrix', hidden: [],
      layout: { type: 'branch', dir: 'column', sizes: [63, 37], children: [group(['matrix'], 'matrix'), group(['settings'], 'settings')] },
    });
    const loaded = readWorkspaceState('workspace', only('settings'), { getItem: () => stored, setItem: () => {} });
    if (loaded === null) throw new Error('Expected the legacy preference');
    const hidden = hidePanel(loaded, 'settings', base.primaryId);
    const reopened = showPanel(hidden, 'settings', base.primaryId, base.presets[0]!, [], base.sharedRows);
    expect(reopened.layout).toMatchObject({ dir: 'column', sizes: [63, 37] });
  });

  it('does not remember an automatically redistributed fit split after reloading a current preference', () => {
    const spec = { ...base, sharedRows: [{ id: 'settings-row', panels: ['settings'] }, { id: 'runs-row', panels: ['runs'] }] };
    const initial = initialWorkspaceState(spec);
    const hidden = hidePanel(initial, 'runs', base.primaryId);
    let stored: string | null = null;
    const storage = { getItem: () => stored, setItem: (_key: string, value: string) => { stored = value; } };
    writeWorkspaceState('workspace', hidden, storage, { sharedRows: true });
    const loaded = readWorkspaceState('workspace', spec, storage);
    if (loaded === null) throw new Error('Expected the current preference');
    expect(loaded.sharedRowSizes).toBeUndefined();
    const reopened = showPanel(loaded, 'runs', base.primaryId, base.presets[0]!, [], spec.sharedRows);
    expect(reopened.layout).toEqual(initial.layout);
  });

  it.each([
    ['settings', 'runs'],
    ['runs', 'settings'],
  ])('restores default and manually resized fit shares after hiding %s then %s', (first, second) => {
    const sharedRows = [{ id: 'settings-row', panels: ['settings'] }, { id: 'runs-row', panels: ['runs'] }];
    const separate = { ...base, sharedRows };
    const initial = initialWorkspaceState(separate);
    const env = { baseline: 850, minimum: () => 200, maximum: 2000, oneRow: 850 };
    const hide = (state: typeof initial, id: string) => settleRows(state, hidePanel(state, id, base.primaryId), 'keep', env, undefined, [], sharedRows);
    const show = (state: typeof initial, id: string) => showPanel(state, id, base.primaryId, base.presets[0]!, [], sharedRows);
    const cycle = (state: typeof initial) => show(show(hide(hide(state, first), second), first), second);
    const shares = (state: typeof initial) => state.layout.type === 'branch' ? state.layout.sizes : [];
    const expectShares = (state: typeof initial, expected: typeof initial) => {
      expect(shares(state)).toHaveLength(shares(expected).length);
      shares(expected).forEach((share, index) => expect(shares(state)[index]).toBeCloseTo(share));
    };
    const reopened = cycle(initial);
    expectShares(reopened, initial);
    expect(reopened.sharedRowSizes).toBeUndefined();

    if (initial.layout.type !== 'branch') throw new Error('Expected three fit rows');
    const resized = rememberSharedRows(initial, { ...initial, layout: { ...initial.layout, sizes: [45, 20, 35] } }, sharedRows);
    expectShares(cycle(resized), resized);
    const oneAbsent = normalizeWorkspaceState(resized, { ...separate, panelIds: separate.panelIds.filter(panel => panel !== first) });
    const bothAbsent = normalizeWorkspaceState(oneAbsent, { ...separate, panelIds: ['matrix'] });
    const restored = normalizeWorkspaceState(bothAbsent, separate);
    expectShares(restored, resized);
  });

  it.each(['settings', 'runs'])('fills the lower row with %s and joins its sibling in declaration order', id => {
    const old = { v: 1, preset: 'matrix', layout: group(['matrix']), hidden: [] };
    const lone = normalizeWorkspaceState(old, only(id));
    expect(topLevelRows(lone.layout)).toEqual([
      { type: 'group', panels: ['matrix'], active: 'matrix' },
      { type: 'group', panels: [id], active: id },
    ]);
    expect(normalizeWorkspaceState(lone, base).layout).toEqual(initialWorkspaceState(base).layout);
  });

  it('keeps the resized height and split through a saved preference with both panels absent, and clears them on reset', () => {
    const initial = initialWorkspaceState(base);
    const [matrix, trends] = topLevelRows(initial.layout);
    if (trends?.type !== 'branch') throw new Error('Expected a split row');
    const layout: DockNode = { type: 'branch', dir: 'column', sizes: [63, 37], children: [matrix!, { ...trends, sizes: [28, 72] }] };
    const resized = rememberSharedRows(initial, { ...initial, layout }, base.sharedRows!);
    const alone = normalizeWorkspaceState(resized, { ...base, panelIds: ['matrix'] });
    expect(topLevelRows(alone.layout)).toHaveLength(1);
    const restored = normalizeWorkspaceState(JSON.parse(JSON.stringify(alone)), base);
    expect(restored.layout).toEqual(layout);
    const reset = resetLayout(alone, base.presets[0]!, [], base.sharedRows);
    expect(normalizeWorkspaceState(reset, base).layout).toEqual(initial.layout);
  });

  it('restores stack height and split after hiding both members and showing them in reverse order', () => {
    const initial = initialWorkspaceState({ ...base, initialMode: 'stack' });
    const [matrix, trends] = topLevelRows(initial.layout);
    if (trends?.type !== 'branch') throw new Error('Expected a split row');
    const layout: DockNode = { type: 'branch', dir: 'column', sizes: [50, 50], children: [matrix!, { ...trends, sizes: [28, 72] }] };
    const withSplit = rememberSharedRows(initial, { ...initial, layout }, base.sharedRows!);
    const measured = withRows(withSplit, 'stack', [410, 360]);
    const resized = rememberSharedRows(measured, withRows(withSplit, 'stack', [410, 510]), base.sharedRows!);
    const env = { baseline: 850, minimum: () => 200, maximum: 2000, oneRow: 850 };
    const hide = (state: typeof resized, id: string) => settleRows(state, hidePanel(state, id, base.primaryId), 'keep', env, undefined, [], base.sharedRows);
    const show = (state: ReturnType<typeof settleRows>, id: string) => settleRows(state, showPanel(state, id, base.primaryId, base.presets[0]!, [], base.sharedRows), 'keep', env, undefined, [], base.sharedRows);
    const lone = hide(resized, 'runs');
    const neither = settleRows(lone, hidePanel(lone, 'settings', base.primaryId), 'keep', env, undefined, [], base.sharedRows);
    expect(topLevelRows(neither.layout)).toHaveLength(1);
    const reversed = show(show(neither, 'runs'), 'settings');
    expect(reversed.rows).toEqual(resized.rows);
    expect(reversed.layout).toEqual(resized.layout);
  });
});
