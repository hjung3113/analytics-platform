import { describe, expect, it } from 'vitest';
import { normalizeWorkspaceState, initialWorkspaceState, collapsePanel, floatPanel, showPanel } from '../workspaceState';
import { clampFloatingPanel } from '../../dock/schema';
import { fromEngineLayout, toEngineLayout } from '../../dock/engineModel';

const preset = { id: 'all', layout: { type: 'group' as const, panels: ['main', 'side', 'other'] } };
const spec = { panelIds: ['main', 'side', 'other'], primaryId: 'main', presets: [preset], initialPreset: 'all', initialMode: 'fit' as const };
const box = { panelId: 'side', x: 5000, y: -20, width: 560, height: 440 };

describe('workspace edge preference v1 (#2435)', () => {
  it('starts with nothing collapsed and reads an old v1 unchanged', () => {
    const state = initialWorkspaceState(spec);
    expect(state.hidden).toEqual([]);
    expect(normalizeWorkspaceState(state, spec)).toEqual(state);
  });
  it.each(['left', 'top'] as const)('remembers %s for a hidden panel and through pinning', edge => {
    const state = collapsePanel(initialWorkspaceState(spec), 'side', 'main', edge);
    expect(state.hidden).toEqual(['side']);
    expect(state.collapsed).toEqual({ side: edge });
    expect(normalizeWorkspaceState(JSON.parse(JSON.stringify(state)), spec)).toEqual(state);
    expect(showPanel(state, 'side', 'main', preset).collapsed).toEqual({ side: edge });
    expect(collapsePanel(state, 'main', 'main', edge)).toBe(state);
  });
  it('drops unknown and primary floating ids, validates numbers, keeps version 1', () => {
    const state = normalizeWorkspaceState({ ...initialWorkspaceState(spec), hidden: ['side'], collapsed: { side: 'left', ghost: 'top', main: 'left' }, floating: [box, { ...box, panelId: 'ghost' }, { ...box, panelId: 'main' }, { ...box, panelId: 'other', width: NaN }] }, spec);
    expect(state.v).toBe(1);
    expect(state.floating).toEqual([box]);
    expect(state.collapsed).toEqual({ side: 'left' });
    expect(clampFloatingPanel(box, { width: 800, height: 600 })).toEqual({ ...box, x: 240, y: 0 });
  });
  it('floating round-trips the engine model without joining the grid', () => {
    const state = floatPanel(initialWorkspaceState(spec), box, 'main');
    const engine = toEngineLayout(state.layout, spec.panelIds.map(id => ({ id, title: id })), { width: 100, height: 80 }, { width: 800, height: 600 }, state.floating);
    const back = fromEngineLayout(engine);
    expect(back.tree).toEqual(state.layout);
    expect(back.floating).toEqual([{ ...box, x: 240, y: 0 }]);
  });
  it('caps a floated panel minimum to its clamped box, keeping oversized content scrollable', () => {
    const engine = toEngineLayout({ type: 'group', panels: ['main'], active: 'main' }, [{ id: 'main', title: 'Main' }, { id: 'side', title: 'Side', minWidth: 900, minHeight: 800 }], { width: 100, height: 80 }, { width: 800, height: 600 }, [box]);
    expect(engine.panels.side).toMatchObject({ minimumWidth: 560, minimumHeight: 440 });
  });
});
