// @vitest-environment jsdom
import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, createRegistry } from '@ap/kernel';
import { testSpace } from '@ap/kernel/testing';
import { groupId, menuPermission } from '@ap/contracts';
import { LayoutDashboard } from 'lucide-react';
import { PANEL_RECIPE_ITEM, PanelRecipeBack, PanelWorkspace } from '@ap/components';
import { manifests } from '../../../index';
import { panelRecipe } from '../recipeModel';

const registry = createRegistry({ permissions: [menuPermission('analytics:view')], spaces: [{ ...testSpace(), homeMenuId: 'hw-time' }], groups: [{ id: groupId('hwTime'), label: { ko: 'HW', en: 'HW' }, icon: LayoutDashboard, space: testSpace().id }], menus: manifests });
const trend = registry.panels('hw-time').find(panel => panel.id === 'trend');

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function Workspace() {
  const [back, setBack] = useState(false);
  return <PanelWorkspace label={{ ko: '설명 작업 영역', en: 'Recipe workspace' }} persistKey="recipe-keyboard" initialMode="stack" compactBelow={0} initialPreset="two"
    presets={[{ id: 'two', label: { ko: '둘', en: 'Two' }, layout: { type: 'branch', dir: 'row', sizes: [1, 1], children: [{ type: 'group', panels: ['trend'] }, { type: 'group', panels: ['next'] }] } }]}
    panels={[
      { id: 'trend', primary: true, title: { ko: '추세', en: 'Trend' }, render: () => back ? <PanelRecipeBack recipe={panelRecipe(trend, {}, { primary: true, pin: false })!} onClose={() => setBack(false)} /> : <p>앞면</p> },
      { id: 'next', title: { ko: '다음 패널', en: 'Next panel' }, render: () => <button>다음 내용</button> },
    ]}
    panelMenuItems={id => id === 'trend' ? [{ id: 'recipe', label: PANEL_RECIPE_ITEM, onSelect: () => setBack(true) }] : []} />;
}

describe('recipe keyboard in the real workspace DockLayout', () => {
  it('keeps the scroll body after the return button and before the next panel', async () => {
    vi.stubGlobal('ResizeObserver', class {
      constructor(private callback: ResizeObserverCallback) {}
      observe(target: Element) { this.callback([{ target, contentRect: { width: 1200, height: 600 } } as ResizeObserverEntry], this as unknown as ResizeObserver); }
      unobserve() {}
      disconnect() {}
    });
    render(<I18nProvider><Workspace /></I18nProvider>);
    const tab = await screen.findByRole('tab', { name: '추세' });
    const layout = tab.closest('[data-dock-layout]')!;
    // The group actions mount in their slot after the layout effects; on a loaded runner the tab can appear first.
    const trigger = await waitFor(() => {
      const found = layout.querySelector<HTMLElement>('[data-dock-group-actions][data-dock-active="trend"] [data-dock-group-menu]');
      expect(found).not.toBeNull();
      return found!;
    });
    fireEvent.keyDown(trigger, { key: 'Enter' });
    const item = await screen.findByRole('menuitem', { name: '이 패널 만든 방법' });
    fireEvent.keyDown(item, { key: 'Enter' });
    const back = await screen.findByRole('button', { name: '앞면으로' });
    back.focus();
    // Dock must allow the native Tab step into the body rather than jumping panels.
    expect(fireEvent.keyDown(back, { key: 'Tab' })).toBe(true);
    const body = screen.getByRole('region', { name: '패널 설명 본문' });
    expect(body.tabIndex).toBe(0);
    expect(body.className).toContain('focus-visible:ring-focus-ring');
    expect(within(body).getAllByRole('heading', { level: 4 })).toHaveLength(3);
    // jsdom does not implement default Tab or scrolling; focus its next native target.
    body.focus();
    expect(document.activeElement).toBe(body);
    expect(fireEvent.keyDown(body, { key: 'PageDown' })).toBe(true);
    expect(fireEvent.keyDown(body, { key: 'ArrowDown' })).toBe(true);
    expect(fireEvent.keyDown(body, { key: 'Tab' })).toBe(false);
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: '다음 패널' }));
  });
});
