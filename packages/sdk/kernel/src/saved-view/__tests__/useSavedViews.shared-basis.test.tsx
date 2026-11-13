import { act, cleanup, render, waitFor } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { groupId, spaceId, type SavedViewContext, type SavedViewSupport } from '@ap/contracts';
import { I18nProvider, PlatformProvider, createRegistry, useSavedViewSupport } from '../../index';
import { useHostPlatform, useSavedViews, type SavedViews } from '../../host';
import { createFakeSavedViewStore as createFakeStore, noContext, testAdapter, testSavedView as viewOf, testSession, testSpace } from '../../testing';

/** #2031 C1: `membershipBasis` is shared by `condition` and `prcGroups`; 현재 뷰에 저장 never recasts the basis of an owner this menu does not support. */
const base = { group: groupId('overview'), primary: true, icon: House, label: { ko: '조회', en: 'Query' }, description: { ko: '', en: '' }, permission: 'platform:view' as const, requiresScope: false, context: { ...noContext, time: 'apply' as const }, pageType: 'analysis' as const, pageKeys: [], query: { mode: 'apply' as const } };
const registry = createRegistry({ spaces: [testSpace()], groups: [{ id: groupId('overview'), label: base.label, icon: House, space: spaceId('mars') }], menus: [{ ...base, id: 'home', path: '/', features: { export: false, savedView: true, annotate: false, compare: false, board: false } }] });
const period = { from: '2026-09-01T00:00:00', to: '2026-09-02T00:00:00' };
const session = testSession(['platform:view']);
const supportOf = (owner: 'prcGroup' | 'condition'): SavedViewSupport => ({ menuId: 'home', menuSchemaVersion: 1, contextKeys: ['time', 'line', owner], pageKeys: [] });

let support: SavedViewSupport; let views: SavedViews; let host: ReturnType<typeof useHostPlatform>;
function Probe() { useSavedViewSupport(support); views = useSavedViews(); host = useHostPlatform(); return <p>{views.status}</p>; }
beforeEach(() => window.sessionStorage.clear());
afterEach(() => { cleanup(); window.history.replaceState(null, '', '/'); });

/** Selects the stored set, applies `change`, saves to it; returns the stored context and whether the view still reads 수정됨. */
async function save(owner: 'prcGroup' | 'condition', context: SavedViewContext, change: () => void) {
  support = supportOf(owner);
  const store = createFakeStore([viewOf({ id: 'cs', context })]);
  window.history.replaceState(null, '', '/');
  render(<I18nProvider><PlatformProvider registry={registry} adapter={testAdapter({ session: () => session })} savedViews={store}><Probe /></PlatformProvider></I18nProvider>);
  await waitFor(() => expect(views.status).toBe('ready'));
  await act(async () => { await views.select('cs'); });
  expect(views.state.modified).toBe(false);
  act(change);
  await waitFor(() => expect(views.state.modified).toBe(true));
  let result: Awaited<ReturnType<SavedViews['saveToSelected']>> | undefined;
  await act(async () => { result = await views.saveToSelected(); });
  expect(result?.ok).toBe(true);
  await act(async () => {});
  return { context: store.rows.get('cs')?.context, modified: views.state.modified };
}

it.each<[string, 'prcGroup' | 'condition', SavedViewContext]>([
  ['a hidden Condition, PRC groups supported', 'prcGroup', { condition: { fab: ['F1'] } }],
  ['hidden PRC groups, Condition supported', 'condition', { prcGroups: ['P1'] }],
])('an unrelated change keeps the stored basis of %s (the address drops a basis with no owner)', async (_name, owner, hidden) => {
  const stored = { ...period, ...hidden, membershipBasis: 'asOf' as const, lineNames: ['L1'] };
  const saved = await save(owner, stored, () => host.setGlobal({ lineNames: ['L2'] }));
  expect(saved).toEqual({ context: { ...stored, lineNames: ['L2'] }, modified: false });
});

it('with no hidden owner, an explicit basis edit of the supported owner is saved', async () => {
  const saved = await save('prcGroup', { ...period, prcGroups: ['P1'], lineNames: ['L1'] }, () => host.setGlobal({ membershipBasis: 'asOf' }));
  expect(saved).toEqual({ context: { ...period, prcGroups: ['P1'], membershipBasis: 'asOf', lineNames: ['L1'] }, modified: false });
});

it('an explicit basis edit of the supported owner is not saved while a hidden owner shares the basis; the rest is, and the view still reads 수정됨', async () => {
  const stored = { ...period, condition: { fab: ['F1'] }, prcGroups: ['P1'], membershipBasis: 'asOf' as const, lineNames: ['L1'] };
  const saved = await save('prcGroup', stored, () => host.setGlobal({ membershipBasis: null, lineNames: ['L2'] }));
  expect(saved).toEqual({ context: { ...stored, lineNames: ['L2'] }, modified: true });
});
