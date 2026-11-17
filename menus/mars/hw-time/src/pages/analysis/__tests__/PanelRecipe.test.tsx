// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { groupId, menuPermission } from '@ap/contracts';
import { LayoutDashboard } from 'lucide-react';
import { manifests } from '../../../index';
import HwTimePage from '../../../HwTimePage';
import { panelDeclarations } from '../panelDeclaration';
import { panelRecipe } from '../recipeModel';
import { RecipeBack } from '../PanelRecipe';
import declarationSource from '../panelDeclaration.ts?raw';

vi.mock('@ap/components', async original => {
  const actual = await original<typeof import('@ap/components')>();
  return { ...actual, PanelWorkspace: (p: import('@ap/components').PanelWorkspaceProps) => <div>
    {p.panels.map(panel => <section key={panel.id} aria-label={`panel ${panel.id}`}>
      {p.panelMenuItems?.(panel.id).map(item => <button key={item.id} onClick={item.onSelect}>{item.label.ko}</button>)}
      {panel.render()}
    </section>)}
  </div> };
});
await vi.hoisted(async () => { (await import('@ap/components/testing/engines')).mockEchartsCanvas(); });
afterEach(cleanup);

describe('panel recipe', () => {
  it.each(Object.keys(panelDeclarations))('%s has generated pieces and a rendered shape', id => {
    const recipe = panelRecipe(id, {}, { primary: false })!;
    expect(recipe.declaration).toBe(panelDeclarations[id as keyof typeof panelDeclarations]);
    expect(recipe.pieces.length).toBeGreaterThan(0);
    expect(recipe.shape.ko).not.toBe('—');
    expect(recipe.code.files.length).toBeGreaterThan(0);
    expect(recipe.code.declaration).toBeGreaterThan(0);
  });
  it('renders ordered columns and source-derived summary with counting rules and chart kind', () => {
    const recipe = panelRecipe('trend', {}, { primary: false })!;
    render(<I18nProvider><RecipeBack recipe={recipe} onClose={() => {}} /></I18nProvider>);
    const block = declarationSource.split('  trend: {')[1]!.split('  scatter: {')[0]!;
    const lines = block.split(/\r?\n/).filter(line => line.trim()).length;
    expect(screen.getByText(`직접 선언 ${lines}줄(공유 정의 제외) · SDK 조각 ${panelDeclarations.trend.pieces.length}개 · 플랫폼 기능 10/13개 제공`)).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 4 }).map(node => node.textContent)).toEqual(['① 메뉴가 선언한 것', '② 가져다 쓴 SDK 조각', '③ 플랫폼이 붙여 준 것']);
    expect(screen.getByText('선 차트')).toBeTruthy();
    expect(screen.getAllByText(/빈 줄 제외·주석 포함/).length).toBeGreaterThan(0);
    expect(screen.getByText(/메뉴가 안 켬/)).toBeTruthy();
    expect(document.querySelector('p[title]')).toBeNull();
  });
  it('offers the item on each declared panel and restores its front without a variant key', async () => {
    const pins = Object.keys(panelDeclarations).map(id => `&pins=${id}`).join('');
    window.history.replaceState(null, '', `/mars/hw-time?v=1&scopeId=MEM&moduleType=PM&drillModule=PM1&drillMotion=Chuck${pins}`);
    const registry = createRegistry({ permissions: [menuPermission('analytics:view')], spaces: [{ ...testSpace(), homeMenuId: 'hw-time' }], groups: [{ id: groupId('hwTime'), label: { ko: 'HW', en: 'HW' }, icon: LayoutDashboard, space: testSpace().id }], menus: manifests });
    const session = testSession(['analytics:view', 'platform:view']);
    const adapter = testAdapter({ session: () => session, menuQuery: async request => ({ outcome: 'ok', data: request.endpoint === 'hwTime.boundHistory' ? [] : { equipment: [], modules: [], motions: [], cells: [], rows: [], points: [], daily: [], total: 0, shown: 0, bounds: [], limits: { maxRows: 96 } }, assessments: [], trust: null, correlationId: 'recipe-test' }) });
    render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><HwTimePage params={{}} /></PlatformProvider></I18nProvider>);
    const region = await screen.findByRole('region', { name: 'panel trend' });
    fireEvent.click(within(region).getByRole('button', { name: '이 패널 만든 방법' }));
    expect(within(region).getByRole('heading', { name: '이 패널 만든 방법' })).toBeTruthy();
    fireEvent.click(within(region).getByRole('button', { name: '앞면으로' }));
    expect(within(region).queryByRole('heading', { name: '이 패널 만든 방법' })).toBeNull();
    for (const id of Object.keys(panelDeclarations)) expect(within(screen.getByRole('region', { name: `panel ${id}` })).getByRole('button', { name: '이 패널 만든 방법' })).toBeTruthy();
    expect(manifests[0]!.pageKeys).not.toContain('variant');
  });
});
