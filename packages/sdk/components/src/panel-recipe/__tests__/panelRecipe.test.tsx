// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { House } from 'lucide-react';
import { I18nProvider, createRegistry, type MenuEntry } from '@ap/kernel';
import { noContext, testSpace } from '@ap/kernel/testing';
import { groupId, spaceId } from '@ap/contracts';
import { PANEL_RECIPE_ITEM, PanelRecipeBack, PanelRecipeFrame, panelRecipe, type PanelRecipeHost } from '../../index';

afterEach(cleanup);

const endpoint = { id: 'samples.rows', menuId: 'samples', permission: 'platform:view' } as const;
const menu: MenuEntry = {
  id: 'samples', path: '/samples', primary: true, group: groupId('overview'), label: { ko: '예시', en: 'Samples' }, description: { ko: '', en: '' }, icon: House,
  permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'analysis',
  features: { export: true, savedView: false, annotate: false, compare: false },
  pageKeys: ['level', 'mark'],
  panels: [
    { id: 'chart', title: { ko: '차트', en: 'Chart' }, queryInputs: { context: ['time'], page: [{ key: 'level', required: true }] }, displayInputs: { page: [{ key: 'mark' }] }, outputs: [{ key: 'mark', action: 'highlight' }], grain: 'row', endpoints: [endpoint], pieces: ['AnalysisChart', 'QueryView'] },
    { id: 'list', title: { ko: '목록', en: 'List' }, queryInputs: {}, displayInputs: {}, outputs: [], grain: 'row', endpoints: [endpoint], pieces: ['PlatformDataTable'] },
  ],
};
const registry = createRegistry({ spaces: [{ ...testSpace(), homeMenuId: 'samples' }], groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }], menus: [menu] });
const panel = (id: string) => registry.panels('samples').find(entry => entry.id === id)!;
const host: PanelRecipeHost = { add: true, pin: true, hide: false, layout: true, maximize: false, range: true };
const state = (recipe: ReturnType<typeof panelRecipe>, id: string) => recipe.platform.find(feature => feature.id === id);

describe('panelRecipe', () => {
  it('reads the registered panel, menu switches and host facts, with the menu words for its keys', () => {
    const recipe = panelRecipe({ panel: panel('chart'), menu, context: {}, host, labels: { keys: { level: { ko: '단계', en: 'Level' } }, actions: { highlight: { ko: '강조', en: 'Highlight' } } } });
    expect(recipe.data).toMatchObject({ endpoints: ['samples.rows'], grain: { ko: 'row', en: 'row' } });
    expect(recipe.data.inputs.map(input => input.label.ko)).toEqual(['기간', '단계']);
    expect(recipe.follows.outputs).toEqual([{ key: 'mark', label: { ko: 'mark', en: 'mark' }, action: { ko: '강조', en: 'Highlight' } }]);
    expect(recipe.condition).toEqual({ declared: { ko: '단계 필요', en: 'Needs Level' }, now: { ko: '단계', en: 'Level' } });
    expect(panelRecipe({ panel: panel('chart'), menu, context: { level: 'a' }, host }).condition.now).toBeUndefined();
    expect(recipe.platform.map(feature => [feature.id, feature.state])).toEqual([
      ['add', 'on'], ['pin', 'on'], ['hide', 'off'], ['layout', 'on'], ['maximize', 'off'], ['range', 'on'], ['annotate', 'off'], ['image', 'off'],
      ['csv', 'on'], ['states', 'on'], ['link', 'on'], ['permission', 'on'], ['audit', 'unknown'],
    ]);
    expect(state(recipe, 'annotate')?.note?.ko).toBe('메뉴가 끔');
    expect(state(recipe, 'permission')?.note?.ko).toBe('platform:view');
    expect(recipe.code).toBeUndefined();
  });
  it('counts CSV beyond a chart only when the host says the panel offers one', () => {
    expect(state(panelRecipe({ panel: panel('list'), menu, context: {}, host }), 'csv')?.state).toBe('off');
    expect(state(panelRecipe({ panel: panel('list'), menu, context: {}, host: { ...host, csv: true } }), 'csv')?.state).toBe('on');
    expect(state(panelRecipe({ panel: panel('list'), menu: { features: { ...menu.features, export: false } }, context: {}, host: { ...host, csv: true } }), 'csv')?.state).toBe('off');
    expect(state(panelRecipe({ panel: panel('list'), menu, context: {}, host }), 'annotate')?.note).toBeUndefined();
  });
});

describe('panelRecipe ids that name object properties', () => {
  it('shows the id itself for keys, grains and actions without an own label, and renders', () => {
    const odd: MenuEntry = { ...menu, id: 'odd', path: '/odd', pageKeys: ['constructor', 'mark'], panels: [
      { id: 'odd', title: { ko: '이상', en: 'Odd' }, queryInputs: { page: [{ key: 'constructor', required: true }] }, displayInputs: {}, outputs: [{ key: 'mark', action: 'toString' }], grain: 'constructor', endpoints: [{ ...endpoint, menuId: 'odd' }], pieces: ['QueryView'] },
    ], primary: false };
    const oddRegistry = createRegistry({ spaces: [{ ...testSpace(), homeMenuId: 'samples' }], groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }], menus: [menu, odd] });
    const recipe = panelRecipe({ panel: oddRegistry.panels('odd')[0]!, menu: odd, context: {}, host, labels: { grains: {}, actions: {} } });
    expect(recipe.data.inputs[0]!.label).toEqual({ ko: 'constructor', en: 'constructor' });
    expect(recipe.data.grain).toEqual({ ko: 'constructor', en: 'constructor' });
    expect(recipe.follows.outputs[0]!.action).toEqual({ ko: 'toString', en: 'toString' });
    expect(recipe.condition.now).toEqual({ ko: 'constructor', en: 'constructor' });
    render(<I18nProvider><PanelRecipeBack recipe={recipe} onClose={() => {}} /></I18nProvider>);
    expect(screen.getByText(/constructor 필요/)).toBeTruthy();
  });
});

describe('PanelRecipeBack and PanelRecipeFrame', () => {
  it('leaves the code line out of the summary when the menu gives no counts', () => {
    render(<I18nProvider><PanelRecipeBack recipe={panelRecipe({ panel: panel('chart'), menu, context: {}, host })} onClose={() => {}} /></I18nProvider>);
    expect(screen.getByText('SDK 조각 2개 · 플랫폼 기능 8/13개 제공')).toBeTruthy();
    expect(screen.queryByText(/메뉴 코드/)).toBeNull();
    expect(screen.getAllByRole('heading', { level: 4 })).toHaveLength(3);
  });
  it('shows the counts the menu measured', () => {
    render(<I18nProvider><PanelRecipeBack recipe={panelRecipe({ panel: panel('chart'), menu, context: {}, host, code: { declaration: 4, files: [{ name: 'Chart.tsx', lines: 30 }] } })} onClose={() => {}} /></I18nProvider>);
    expect(screen.getByText('직접 선언 4줄(공유 정의 제외) · SDK 조각 2개 · 플랫폼 기능 8/13개 제공')).toBeTruthy();
    expect(screen.getByText(/Chart\.tsx 30줄/)).toBeTruthy();
  });
  it('turns over and returns focus to the frame when closed from inside', () => {
    function Panel() {
      const [open, setOpen] = useState(false);
      return <>
        <button onClick={() => setOpen(true)}>{PANEL_RECIPE_ITEM.ko}</button>
        <PanelRecipeFrame open={open} onClose={() => setOpen(false)} back={close => <PanelRecipeBack recipe={panelRecipe({ panel: panel('chart'), menu, context: {}, host })} onClose={close} />}><p>앞면</p></PanelRecipeFrame>
      </>;
    }
    render(<I18nProvider><Panel /></I18nProvider>);
    fireEvent.click(screen.getByRole('button', { name: '이 패널 만든 방법' }));
    const back = screen.getByRole('button', { name: '앞면으로' });
    const root = back.closest<HTMLElement>('[tabindex="-1"]');
    back.focus();
    fireEvent.click(back);
    expect(screen.getByText('앞면')).toBeTruthy();
    expect(document.activeElement).toBe(root);
  });
});
