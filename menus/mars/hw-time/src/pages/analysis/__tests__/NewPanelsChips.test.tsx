// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { groupId, menuPermission } from '@ap/contracts';
import { LayoutDashboard } from 'lucide-react';
import { manifests } from '../../../index';
import HwTimePage from '../../../HwTimePage';

vi.mock('@ap/components', async original => {
  const actual = await original<typeof import('@ap/components')>();
  return { ...actual, PanelWorkspace: (p: import('@ap/components').PanelWorkspaceProps) => <div>
    {p.panels.map(panel => <section key={panel.id} aria-label={`panel ${panel.id}`}>{panel.render()}</section>)}
  </div> };
});
await vi.hoisted(async () => { (await import('@ap/components/testing/engines')).mockEchartsCanvas(); });
afterEach(cleanup);

function mount(search: string) {
  window.history.replaceState(null, '', `/mars/hw-time?v=1&scopeId=MEM&moduleType=PM${search}`);
  const registry = createRegistry({ permissions: [menuPermission('analytics:view')], spaces: [{ ...testSpace(), homeMenuId: 'hw-time' }], groups: [{ id: groupId('hwTime'), label: { ko: 'HW', en: 'HW' }, icon: LayoutDashboard, space: testSpace().id }], menus: manifests });
  const session = testSession(['analytics:view', 'platform:view']);
  const adapter = testAdapter({ session: () => session, menuQuery: async () => ({ outcome: 'ok', data: { equipment: [], modules: [], motions: [], cells: [], rows: [], points: [], daily: [], total: 0, shown: 0, bounds: [], limits: { maxRows: 96 } }, assessments: [{ kind: 'collection', state: 'clear' }, { kind: 'processing_delay', state: 'clear' }, { kind: 'coverage', state: 'clear' }], trust: null, correlationId: 'chips' }) });
  render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><HwTimePage params={{}} /></PlatformProvider></I18nProvider>);
}

describe('verdict and date clear chips (v0.40 review-quality Q5)', () => {
  it.each([
    ['donut', '&verdict=over', '판정 상한 초과 필터 해제'],
    ['equipmentDays', '&date=2026-09-25', '날짜 09-25 필터 해제'],
  ])('%s chip has a plain accessible name and keeps focus off the body after clearing', async (id, search, name) => {
    mount(`${search}&pins=${id}`);
    const panel = await screen.findByRole('region', { name: `panel ${id}` });
    const chip = await within(panel).findByRole('button', { name });
    expect(chip.textContent).not.toContain('×');
    chip.focus();
    fireEvent.click(chip);
    expect(within(panel).queryByRole('button', { name })).toBeNull();
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement?.isConnected).toBe(true);
  });
});
