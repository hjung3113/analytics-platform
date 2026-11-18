import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { WorkspaceQueryBarRow } from '../../archetypes/WorkspaceQueryBar';
import { useReportQueryBarStatus } from '../QueryBarStatus';
import { useQueryBarExtension } from '../QueryBarExtension';
import { useRegisterContextEditorFocus } from '../QueryBarStatus';
import { House } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { contextCapabilities, groupId, spaceId, type PageConditions } from '@ap/contracts';
import { createRegistry, I18nProvider, PlatformProvider, useQueryDraft } from '@ap/kernel';
import { PaneScreenProvider, useHostPlatform } from '@ap/kernel/host';
import { createFakeSavedViewStore, testAdapter, testSavedView, testSession, testSpace } from '@ap/kernel/testing';
import { PlatformPage } from '../../archetypes/PlatformPage';
import { createSyntheticHierarchySource } from '../../hierarchy/syntheticHierarchy';
import type { PageConditionLayerOptions } from '../DeclaredPageConditions';

const label = (ko: string) => ({ ko, en: ko });
const declaration: PageConditions = { categories: [
  { id: 'choice', label: label('분류'), kind: { type: 'select', key: 'choice', options: { static: [{ value: 'one', label: label('One') }] } } },
  { id: 'query', label: label('검색'), kind: { type: 'search', key: 'q' } },
  { id: 'many', label: label('대상'), kind: { type: 'multi', key: 'many', options: { static: [{ value: 'a', label: label('Alpha') }, { value: 'b', label: label('Beta') }] } } },
  { id: 'period', label: label('기간'), kind: { type: 'date', from: 'start', to: 'end' } },
] };
const period = '?v=1&from=2026-09-25T09%3A00%3A00&to=2026-09-26T09%3A00%3A00';
let host: ReturnType<typeof useHostPlatform>;
let pageOptions: PageConditionLayerOptions | undefined;
function Page({ layout = 'flow', legacyHead = false }: { layout?: 'flow' | 'fill'; legacyHead?: boolean }) {
  host = useHostPlatform();
  const draft = useQueryDraft();
  return <PlatformPage layout={layout} pageConditionOptions={pageOptions} contextExtension={legacyHead ? <span>legacy editor</span> : undefined} queryBarExtension={legacyHead ? { pageSummary: [{ key: 'legacy', label: '기존 조건', value: 'kept' }], appliedPageSummary: [{ key: 'legacy', label: '기존 조건', value: 'kept' }], issues: [] } : undefined}><button onClick={() => draft.setDraftGlobal({ roomNames: ['PHOTO'] })}>outside</button><p>results</p></PlatformPage>;
}
function mount({ mode = 'apply', query = '', required = false, pane = false, layout = 'flow', bar = false, legacyHead = false, tree = false, pendingDefault }: { pendingDefault?: ReturnType<typeof createFakeSavedViewStore>; tree?: boolean; mode?: 'apply' | 'live'; query?: string; required?: boolean; pane?: boolean; layout?: 'flow' | 'fill'; bar?: boolean; legacyHead?: boolean } = {}) {
  window.history.replaceState(null, '', '/' + (pendingDefault ? '' : period + query));
  const registry = createRegistry({ spaces: [testSpace()], groups: [{ id: groupId('overview'), label: label('개요'), icon: House, space: spaceId('mars') }], menus: [{
    id: 'home', primary: true, group: groupId('overview'), label: label('홈'), description: label(''), path: '/', icon: House, permission: 'platform:view', requiresScope: false,
    pageType: 'analysis', context: contextCapabilities({ time: 'apply', roomNames: 'apply' }), savedViewSupport: pendingDefault ? { menuId: 'home', menuSchemaVersion: 1, contextKeys: ['time'], pageKeys: ['q'] } : undefined, features: { export: false, savedView: pendingDefault !== undefined, annotate: false, compare: false, board: true },
    query: mode === 'apply' ? { mode, autoApplyDefault: pendingDefault ? true : undefined } : undefined, pageKeys: ['choice', 'q', 'many', 'start', 'end', 'legacy', ...(tree ? ['tree'] : [])], repeatedPageKeys: ['many', ...(tree ? ['tree'] : [])], pageConditions: { ...declaration, categories: [...declaration.categories, ...(tree ? [{ id: 'tree', label: label('계층'), kind: { type: 'tree' as const, key: 'tree', source: 'tree', value: 'nodes' as const } }] : [])].map(category => required && category.id === 'query' ? { ...category, required: true } : category) },
  }], endpoints: tree ? [{ id: 'tree', menuId: 'home' }] : [] });
  const session = testSession(['platform:view']);
  return render(<I18nProvider><PlatformProvider registry={registry} savedViews={pendingDefault} adapter={testAdapter({ session: () => session })} slots={bar ? { contextBar: <TestBar /> } : undefined}>
    {pane ? <PaneScreenProvider paneId="pane-one" screen={{ menuId: 'home', params: {}, query: period + query }} onChange={vi.fn()} onLeave={vi.fn()}><Page layout={layout} legacyHead={legacyHead} /></PaneScreenProvider> : <Page layout={layout} legacyHead={legacyHead} />}
  </PlatformProvider></I18nProvider>);
}
function TestBar() {
  const [expanded, setExpanded] = useState(false);
  const hint = useQueryBarExtension()?.applyHint;
  useReportQueryBarStatus({ folded: !expanded, editing: false, reasonKeys: [] });
  // The shell bar registers its own opener; the layer never searches this markup.
  useRegisterContextEditorFocus(() => { if (!expanded) setExpanded(true); });
  return <section role="region" aria-label="조회 조건" data-query-bar>
    {/* Mirrors the live Context bar: an inert, invisible measuring copy renders before the real controls. */}
    <div inert aria-hidden className="invisible"><div data-context-measuring><button type="button" aria-expanded="false" aria-controls="test-measure-editor">조회 조건 측정</button></div></div>
    <button aria-expanded={expanded} aria-controls="test-query-editor" onClick={() => setExpanded(!expanded)}>조회 조건 바꾸기</button>
    <button type="button" disabled={hint !== undefined} title={hint}>조회 적용</button>
    <div id="test-query-editor" hidden={!expanded}>global editor</div>
    {!expanded && <WorkspaceQueryBarRow />}
  </section>;
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); pageOptions = undefined; });
const trigger = () => screen.getByRole('button', { name: '페이지 조건' });
const dialog = () => screen.getByRole('dialog', { name: '페이지 조건' });

describe('Page condition layer (#2339)', () => {
  it('blocks the trigger and required-condition layer until the first-entry default is decided', async () => {
    const store = createFakeSavedViewStore();
    let release = () => {};
    const held = new Promise<null>(resolve => { release = () => resolve(null); });
    const lookup = vi.spyOn(store, 'getDefaultId').mockReturnValueOnce(held);
    mount({ required: true, pendingDefault: store });
    await waitFor(() => expect(lookup).toHaveBeenCalledTimes(1));
    expect(trigger()).toBeDisabled();
    expect(screen.queryByRole('dialog')).toBeNull();
    await act(async () => release());
    expect(trigger()).toBeEnabled();
    expect(within(dialog()).getByRole('searchbox', { name: '검색' })).toBeEnabled();
  });
  it('keeps the layer closed when the first-entry default supplies the required condition', async () => {
    const store = createFakeSavedViewStore([testSavedView({
      id: 'default', kind: 'menu-view', menuId: 'home', menuSchemaVersion: 1, page: [['q', 'saved']],
      context: { from: '2026-09-25T09:00:00', to: '2026-09-26T09:00:00' },
    })]);
    let release = () => {};
    const held = new Promise<string>(resolve => { release = () => resolve('default'); });
    const lookup = vi.spyOn(store, 'getDefaultId').mockReturnValueOnce(held);
    mount({ required: true, pendingDefault: store });
    await waitFor(() => expect(lookup).toHaveBeenCalledTimes(1));
    await act(async () => release());
    expect(host.pageParam('q')).toBe('saved');
    expect(trigger()).toBeEnabled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('starts closed, exposes a labelled non-modal dialog, ignores outside clicks and returns focus on Escape', async () => {
    mount();
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    expect(document.getElementById(trigger().getAttribute('aria-controls')!)).toHaveAttribute('hidden');
    fireEvent.click(trigger());
    expect(dialog()).toHaveAttribute('aria-modal', 'false');
    expect(within(dialog()).getByRole('heading', { name: '페이지 조건' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'outside' }));
    expect(dialog()).toBeVisible();
    expect(screen.getByText('results').closest('[inert]')).toBeNull();
    fireEvent.keyDown(screen.getByRole('button', { name: 'outside' }), { key: 'Escape' });
    expect(dialog()).toBeVisible();
    fireEvent.keyDown(within(dialog()).getByRole('heading', { name: '페이지 조건' }), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(trigger()).toHaveFocus();
    await waitFor(() => expect(trigger()).toHaveAttribute('aria-expanded', 'false'));
  });
  it('toggles: pressing the trigger of an open layer closes it and returns focus; the page body is an isolated stacking context', () => {
    mount();
    fireEvent.click(trigger());
    expect(dialog()).toBeVisible();
    expect(screen.getByText('results').closest('[data-platform-page-content]')).toHaveClass('isolate');
    fireEvent.click(trigger());
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    expect(trigger()).toHaveFocus();
  });
  it('renders one wrapping chip per active category and clears only its draft keys, then all layer keys', () => {
    mount({ query: '&q=find&many=a&start=2026-09-25T01:00:00&end=2026-09-25T02:00:00' });
    const chips = document.querySelector('[data-page-condition-triggers]')!;
    expect(chips.querySelectorAll('[data-page-condition-chip]')).toHaveLength(3);
    expect(chips.textContent).toContain('검색: find');
    expect(chips.textContent).not.toMatch(/\+\d/);
    fireEvent.click(within(chips as HTMLElement).getByRole('button', { name: '기간 지우기' }));
    expect(host.queryDraft.draft.page.map(([key]) => key)).not.toContain('start');
    expect(host.pageParams('start')).toEqual(['2026-09-25T01:00:00']);
    expect(screen.getByText('미적용 변경 있음')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '모두 지우기' }));
    expect(host.queryDraft.draft.page).toEqual([]);
    expect(host.global.from).toBe('2026-09-25T09:00:00');
  });
  it.each([{ required: true }, { query: '&start=invalid' }])('automatically opens for missing required categories or codec issues: %j', async options => {
    mount(options);
    expect(await screen.findByRole('dialog')).toBeVisible();
    expect(within(dialog()).getByRole('heading', { name: options.required ? '검색' : '기간' })).toHaveFocus();
    fireEvent.click(within(dialog()).getByRole('button', { name: '페이지 조건 닫기' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('hands treeSources from the page options to a declared tree category and shows its S2-style header', async () => {
    pageOptions = { loadOptions: async () => { throw new Error('unused'); }, inputsKey: 'k', treeSources: { tree: createSyntheticHierarchySource() } };
    mount({ tree: true });
    fireEvent.click(trigger());
    const heading = within(dialog()).getByRole('heading', { name: '계층' });
    expect(heading).toHaveAttribute('tabindex', '-1');
    expect(within(heading.parentElement!).getByText('제약 없음')).toBeVisible();
    expect(await within(dialog()).findByRole('tree', { name: '계층' })).toBeVisible();
  });
  it('uses the same global + page draft, applies once, and reverts with the shared action', async () => {
    mount();
    const push = vi.spyOn(window.history, 'pushState');
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole('button', { name: 'outside' }));
    fireEvent.change(within(dialog()).getByRole('searchbox', { name: '검색' }), { target: { value: 'find' } });
    fireEvent.blur(within(dialog()).getByRole('searchbox', { name: '검색' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: '적용' }));
    expect(push).toHaveBeenCalledTimes(1);
    expect(host.pageParam('q')).toBe('find');
    expect(host.global.roomNames).toEqual(['PHOTO']);
    fireEvent.change(within(dialog()).getByRole('searchbox', { name: '검색' }), { target: { value: 'discard' } });
    fireEvent.blur(within(dialog()).getByRole('searchbox', { name: '검색' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: '되돌리기' }));
    await waitFor(() => expect(within(dialog()).getByRole('searchbox')).toHaveValue('find'));
  });
  it('live check toggles write through, record one history entry per opening, and keep explicit empty', () => {
    mount({ mode: 'live' });
    const push = vi.spyOn(window.history, 'pushState');
    const replace = vi.spyOn(window.history, 'replaceState');
    fireEvent.click(trigger());
    expect(within(dialog()).queryByRole('button', { name: '적용' })).toBeNull();
    fireEvent.click(within(dialog()).getByRole('checkbox', { name: 'Alpha' }));
    replace.mockClear(); // The first push also saves the browser's prior scroll position.
    fireEvent.click(within(dialog()).getByRole('checkbox', { name: 'Beta' }));
    expect(host.pageParams('many')).toEqual(['a', 'b']);
    expect(push).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledTimes(1);
    fireEvent.click(within(dialog()).getByRole('checkbox', { name: 'Alpha' }));
    fireEvent.click(within(dialog()).getByRole('checkbox', { name: 'Beta' }));
    expect(host.pageParam('many')).toBe('~none');
    expect(within(dialog()).getByText('선택한 항목 없음')).toBeVisible();
  });
  it('lets an inner Select take the first Escape before the layer closes', async () => {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
    mount();
    const user = userEvent.setup();
    fireEvent.click(trigger());
    const select = within(dialog()).getByRole('combobox', { name: '분류' });
    select.focus();
    await user.keyboard('{ArrowDown}');
    expect(await screen.findByRole('listbox')).toBeVisible();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(dialog()).toBeVisible();
    expect(select).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('clears one malformed category while retaining another malformed category for recovery', () => {
    mount({ query: '&q=~invalid&start=invalid' });
    fireEvent.click(within(dialog()).getByRole('button', { name: '기간 지우기' }));
    expect(host.queryDraft.draft.page).toEqual([['q', '~invalid']]);
    expect(host.queryDraft.canApply).toBe(false);
    fireEvent.click(within(dialog()).getByRole('button', { name: '검색 지우기' }));
    expect(host.queryDraft.draft.page).toEqual([]);
    expect(host.queryDraft.canApply).toBe(true);
  });
  it.each(['flow', 'fill'] as const)('contains the overlay in the page body of a board pane (%s)', layout => {
    mount({ pane: true, layout });
    fireEvent.click(trigger());
    expect(dialog().closest('[data-platform-page-body]')).not.toBeNull();
    expect(dialog().closest('[data-page-condition-region]')).not.toBeNull();
  });
  it('announces applied summary changes only while closed, and never the opening or closing', () => {
    mount({ mode: 'live' });
    const live = document.querySelector('[data-page-condition-announcement]')!;
    expect(live.textContent).toBe('');
    act(() => host.setPage({ q: 'one' }));
    expect(live.textContent).toContain('one');
    fireEvent.click(trigger());
    expect(live.textContent).toBe('');
    fireEvent.change(within(dialog()).getByRole('searchbox'), { target: { value: 'two' } });
    expect(live.textContent).toBe('');
    fireEvent.click(within(dialog()).getByRole('button', { name: '페이지 조건 닫기' }));
    expect(live.textContent).toBe('');
  });
  it('offers one Apply while the layer is open: the query row Apply is disabled with a hint, and enabled again when closed', () => {
    mount({ layout: 'fill', bar: true });
    expect(screen.getByRole('button', { name: '조회 적용' })).toBeEnabled();
    fireEvent.click(trigger());
    expect(screen.getByRole('button', { name: '조회 적용' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '조회 적용' })).toHaveAttribute('title', '페이지 조건 층의 «적용»으로 함께 적용합니다.');
    fireEvent.click(within(dialog()).getByRole('button', { name: '페이지 조건 닫기' }));
    expect(screen.getByRole('button', { name: '조회 적용' })).toBeEnabled();
  });
  it('uses the existing folded workspace summary spot and sends Context editing to its existing control', () => {
    mount({ layout: 'fill', bar: true });
    const announcement = document.querySelector('[data-page-condition-announcement]');
    const bar = screen.getByRole('region', { name: '조회 조건' });
    expect(within(bar).getByRole('button', { name: '페이지 조건' })).toBe(trigger());
    fireEvent.click(trigger());
    expect(bar.contains(dialog())).toBe(false);
    fireEvent.click(within(dialog()).getByRole('button', { name: '조회 조건에서 바꾸기' }));
    expect(screen.getByText('global editor')).toBeVisible();
    expect(document.querySelector('[data-page-condition-announcement]')).toBe(announcement);
    expect(dialog()).toBeVisible();
  });
  it('keeps legacy summaries separate so declared values have only one summary and announcement owner', () => {
    mount({ layout: 'fill', legacyHead: true, query: '&q=one&legacy=kept' });
    const head = document.querySelector('[data-page-head-line]')!;
    expect(head).toHaveTextContent('기존 조건 kept');
    expect(head).not.toHaveTextContent('one');
    expect(document.querySelector('[data-page-condition-triggers]')).toHaveTextContent('검색: one');
  });
  it('opens for a newly arrived codec issue once and does not reopen an acknowledged issue on an unrelated edit', () => {
    mount({ mode: 'live' });
    act(() => host.setPage({ start: 'invalid' }));
    expect(dialog()).toBeVisible();
    expect(within(dialog()).getByRole('heading', { name: '기간' })).toHaveFocus();
    fireEvent.click(within(dialog()).getByRole('button', { name: '페이지 조건 닫기' }));
    act(() => host.setPage({ q: 'unrelated' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

});
