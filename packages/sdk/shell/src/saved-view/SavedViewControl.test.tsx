import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { groupId, spaceId, type SavedViewSupport } from '@ap/contracts';
import { I18nProvider, PlatformProvider, createRegistry, diagnoseSavedView, useSavedViewSupport } from '@ap/kernel';
import { PaneQueryDraftProvider, PaneScreenProvider, useHostPlatform } from '@ap/kernel/host';
import { ToastProbe, createFakeSavedViewStore as createFakeViewStore, memoryStorage, noContext, testAdapter, testSavedView as viewOf, testSession, testSpace, testViewCapabilities as ALL, type FakeSavedViewStore as FakeViewStore } from '@ap/kernel/testing';
import { GlobalContextBar } from '../context/GlobalContextBar';

// Passes through to the real diagnosis; one test swaps in a stale view whose migration throws when applied.
vi.mock('@ap/kernel', async importOriginal => {
  const actual = await importOriginal<typeof import('@ap/kernel')>();
  return { ...actual, diagnoseSavedView: vi.fn(actual.diagnoseSavedView) };
});

// One declaration of menu keys: capture, restore and diagnose all read it the same way.
const baseSupport: SavedViewSupport = { menuId: 'home', menuSchemaVersion: 1, contextKeys: ['time', 'roomNames'], pageKeys: [] };
let support: SavedViewSupport = baseSupport;
const period = 'from=2026-09-25T09:00:00&to=2026-09-26T09:00:00';
const menu = (id: string, path: string, over: Record<string, unknown> = {}) => ({ id, group: groupId('overview'), primary: id === 'home', label: { ko: id, en: id }, description: { ko: '', en: '' }, path, icon: House, permission: 'platform:view' as const, requiresScope: true, context: { ...noContext, time: 'apply' as const, roomNames: 'apply' as const }, query: { mode: 'apply' as const, required: { context: ['time' as const] } }, pageKeys: [], pageType: 'analysis' as const, features: { export: false, savedView: true, annotate: false, compare: false }, ...over });
const registry = createRegistry({
  spaces: [testSpace()], groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }],
  menus: [menu('home', '/'), menu('live', '/live', { query: undefined, primary: false })],
});
const session = testSession(['platform:view']);
let platform: ReturnType<typeof useHostPlatform>;
function Probe() { useSavedViewSupport(support); platform = useHostPlatform(); return null; }
const L1 = viewOf({ id: 'l1', name: '포토 뷰', kind: 'menu-view', menuId: 'home', menuSchemaVersion: 1, page: [], chartOptions: {}, layout: null, panels: [{ id: 'p' }], context: { from: '2026-09-25T09:00:00', to: '2026-09-26T09:00:00', roomNames: ['PHOTO'] } } as never);

function mount(store: FakeViewStore | undefined, url = '/', body = <GlobalContextBar />) {
  window.history.replaceState(null, '', `/${url.replace(/^\//, '')}`);
  return render(<I18nProvider><PlatformProvider registry={registry} adapter={testAdapter({ session: () => session })} savedViews={store}><Probe />{body}<ToastProbe /></PlatformProvider></I18nProvider>);
}
const row = (name: string) => ({ name: new RegExp(`^${name}(?! 동작)`) });
// Switching away from unsaved conditions asks first; the tests drop them.
async function pick(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(await screen.findByRole('button', row(name)));
  const drop = screen.queryByRole('button', { name: '버리고 이동' });
  if (drop) await user.click(drop);
}
const selector = () => screen.getByRole('button', { name: /^저장된 뷰:/, hidden: true });
const toasts = () => Array.from(screen.getByRole('list', { name: 'toasts', hidden: true }).querySelectorAll('li'), li => li.textContent);
beforeEach(() => { support = baseSupport; vi.stubGlobal('localStorage', memoryStorage()); vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }); window.sessionStorage.clear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

describe('SavedViewControl in the query tool row', () => {
  it('puts the selector in the existing tool-row group, with the save menu, and no extra row', async () => {
    mount(createFakeViewStore([L1]), `/?scopeId=MEM&${period}`);
    const actions = await screen.findByRole('group', { name: '조회 조건 동작' });
    expect(within(actions).getByRole('button', { name: /^저장된 뷰:/ })).toBeTruthy();
    expect(within(actions).getByRole('button', { name: '저장' })).toBeTruthy();
    expect(screen.getAllByRole('group', { name: '조회 조건 동작' })).toHaveLength(1);
  });

  it('keeps the selector and 수정됨 in the collapsed summary row, and a view pick does not expand it', async () => {
    const user = userEvent.setup();
    mount(createFakeViewStore([L1]), `/?scopeId=MEM&${period}&roomNames=PHOTO`);
    await waitFor(() => expect(platform.scope.status).toBe('valid'));
    await user.click(screen.getByRole('button', { name: '조회 조건 접기' }));
    const region = screen.getByRole('region', { name: '조회 조건' });
    expect(region).toHaveAttribute('data-query-bar-collapsed');
    await user.click(selector());
    await pick(user, '포토 뷰');
    await waitFor(() => expect(selector()).toHaveAccessibleName('저장된 뷰: 포토 뷰'));
    expect(region).toHaveAttribute('data-query-bar-collapsed');
    act(() => platform.setGlobal({ roomNames: ['ETCH'] }));
    await waitFor(() => expect(within(region).getByText('수정됨')).toBeTruthy());
    expect(region).toHaveAttribute('data-query-bar-collapsed');
    expect(within(region).getByRole('button', { name: /^저장된 뷰:/ })).toBeTruthy();
  });

  it.each([
    ['no store injected', () => mount(undefined, `/?scopeId=MEM&${period}`)],
    ['a menu that is not an Apply menu', () => mount(createFakeViewStore([L1]), `/live?scopeId=MEM&${period}`)],
    ['a board pane', () => {
      const screens = { p1: { menuId: 'home', params: {}, query: `?scopeId=MEM&${period}` } };
      return mount(createFakeViewStore([L1]), '/?scopeId=MEM', <PaneQueryDraftProvider screens={screens}><PaneScreenProvider paneId="p1" screen={screens.p1} onChange={() => {}} onLeave={() => {}}><GlobalContextBar /></PaneScreenProvider></PaneQueryDraftProvider>);
    }],
  ])('draws no selector for %s', async (_name, run) => {
    run();
    await act(async () => {});
    expect(screen.queryByRole('button', { name: /^저장된 뷰:/ })).toBeNull();
    expect(screen.queryByRole('button', { name: '저장' })).toBeNull();
  });

  it('names what each reset-like control acts on, and keeps revert-to-saved in the save menu', async () => {
    const user = userEvent.setup();
    mount(createFakeViewStore([L1]), `/?scopeId=MEM&${period}&roomNames=PHOTO`);
    await waitFor(() => expect(platform.scope.status).toBe('valid'));
    expect(screen.getByRole('button', { name: '초안 되돌리기' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '조건 초기화' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '초기화' })).toBeNull();
    expect(screen.queryByRole('button', { name: '되돌리기' })).toBeNull();
    await user.click(selector());
    await pick(user, '포토 뷰');
    await waitFor(() => expect(selector()).toHaveAccessibleName('저장된 뷰: 포토 뷰'));
    act(() => platform.setGlobal({ roomNames: ['ETCH'] }));
    await user.click(screen.getByRole('button', { name: '저장' }));
    expect(await screen.findByRole('menuitem', { name: '저장본으로 되돌리기' })).toBeTruthy();
  });

  it('keeps recent conditions apart from the saved view list', async () => {
    const user = userEvent.setup();
    mount(createFakeViewStore([L1]), `/?scopeId=MEM&${period}`);
    await user.click(await screen.findByRole('button', { name: /^저장된 뷰:/ }));
    const list = await screen.findByRole('list', { name: '뷰 목록' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(within(screen.getByRole('dialog')).queryByText(/최근 조건/)).toBeNull();
  });

  it('shows what a restore left out as read-only text', async () => {
    const user = userEvent.setup();
    const other = viewOf({ id: 'l2', name: '라인 뷰', kind: 'menu-view', menuId: 'home', menuSchemaVersion: 1, page: [], chartOptions: {}, layout: null, panels: null, context: { from: '2026-09-25T09:00:00', to: '2026-09-26T09:00:00', lineNames: ['L1'] } } as never);
    mount(createFakeViewStore([L1, other]), `/?scopeId=MEM&${period}`);
    await user.click(await screen.findByRole('button', { name: /^저장된 뷰:/ }));
    await pick(user, '라인 뷰');
    await waitFor(() => expect(screen.getByText(/제외된 조건: line/)).toBeTruthy());
    expect(screen.getByText(/제외된 조건: line/).closest('button, input')).toBeNull();
  });

  it('changes nothing when the store refuses the save, and reports it', async () => {
    const user = userEvent.setup();
    const store = createFakeViewStore([]);
    store.failSave = true;
    mount(store, `/?scopeId=MEM&${period}&roomNames=PHOTO`);
    await user.click(await screen.findByRole('button', { name: '저장' }));
    await user.click(await screen.findByRole('menuitem', { name: '새 뷰로 저장' }));
    await user.type(await screen.findByLabelText('뷰 이름'), '새 뷰');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '저장' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(selector()).toHaveAccessibleName('저장된 뷰: 저장하지 않은 조건');
    expect(store.rows.size).toBe(0);
  });

  it('lists out-of-date views with their reason in 뷰 관리', async () => {
    const user = userEvent.setup();
    const stale = viewOf({ id: 'l3', name: '낡은 뷰', kind: 'menu-view', menuId: 'home', menuSchemaVersion: 1, page: [], chartOptions: {}, layout: null, panels: null, context: { condition: { gone: ['x'] } } } as never);
    mount(createFakeViewStore([L1, stale]), `/?scopeId=MEM&${period}`);
    await user.click(await screen.findByRole('button', { name: /^저장된 뷰:/ }));
    await user.click(await screen.findByRole('button', { name: '뷰 관리' }));
    const dialog = await screen.findByRole('dialog', { name: '뷰 관리' });
    await user.click(within(dialog).getByRole('radio', { name: /낡음·권한 부족/ }));
    expect(within(dialog).getByText(/낡은 뷰/)).toBeTruthy();
    expect(within(dialog).queryByText(/포토 뷰/)).toBeNull();
  });

  it('closes 저장 → 공유 대상 → 새 그룹 one Escape at a time and returns focus to the save button', async () => {
    const user = userEvent.setup();
    const store = createFakeViewStore([]);
    mount(store, `/?scopeId=MEM&${period}&roomNames=PHOTO`);
    const save = await screen.findByRole('button', { name: '저장' });
    await user.click(save);
    await user.click(await screen.findByRole('menuitem', { name: '새 뷰로 저장' }));
    await user.type(await screen.findByLabelText('뷰 이름'), '공유 뷰');
    await user.click(screen.getByRole('radio', { name: /공유 대상 지정/ }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '저장' }));
    const picker = await screen.findByRole('dialog', { name: '공유 대상' });
    expect(store.rows.size).toBe(0);
    await user.click(within(picker).getByRole('button', { name: '새 그룹 만들기' }));
    expect(screen.getByRole('dialog', { name: '새 그룹 만들기' })).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: '새 그룹 만들기' })).toBeNull();
    expect(screen.getByRole('dialog', { name: '공유 대상' })).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: '새 그룹 만들기' })));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(save));
    expect(store.rows.size).toBe(0);
  });

  it('saves and shares only after 공유 대상 저장, and changes nothing before the store answers', async () => {
    const user = userEvent.setup();
    const store = createFakeViewStore([]);
    store.groups = [{ group: { id: 'g1', kind: 'custom', name: '야간조', memberCount: 2 }, members: [], capabilities: { canView: true, canEditMembers: true, canRename: true, canDelete: true } }];
    mount(store, `/?scopeId=MEM&${period}&roomNames=PHOTO`);
    await user.click(await screen.findByRole('button', { name: '저장' }));
    await user.click(await screen.findByRole('menuitem', { name: '새 뷰로 저장' }));
    await user.type(await screen.findByLabelText('뷰 이름'), '공유 뷰');
    await user.click(screen.getByRole('radio', { name: /공유 대상 지정/ }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '저장' }));
    const picker = await screen.findByRole('dialog', { name: '공유 대상' });
    await user.click(await within(picker).findByRole('checkbox', { name: '야간조 (2명)' }));
    expect(store.calls).toEqual([]);
    await user.click(within(picker).getByRole('button', { name: '공유 대상 저장' }));
    await waitFor(() => expect(toasts().join(' ')).toContain('공유 대상을 정했습니다'));
    expect([...store.rows.values()][0]?.visibility).toEqual({ kind: 'groups', groupIds: ['g1'] });
    expect(store.calls).toEqual(['save', 'setVisibility']);
  });
});

const GROUPS = [
  { group: { id: 'g1', kind: 'custom' as const, name: '야간조', memberCount: 2 }, members: [{ userId: 'u7', displayName: '정하늘', affiliation: '포토' }], capabilities: { canView: true, canEditMembers: true, canRename: true, canDelete: true } },
  { group: { id: 'g2', kind: 'org-team' as const, name: '포토팀', memberCount: 5 }, members: [], capabilities: { canView: true, canEditMembers: false, canRename: false, canDelete: false } },
];
async function startShare(user: ReturnType<typeof userEvent.setup>, name = '공유 뷰') {
  await user.click(await screen.findByRole('button', { name: '저장' }));
  await user.click(await screen.findByRole('menuitem', { name: '새 뷰로 저장' }));
  await user.type(await screen.findByLabelText('뷰 이름'), name);
  await user.click(screen.getByRole('radio', { name: /공유 대상 지정/ }));
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '저장' }));
  const picker = await screen.findByRole('dialog', { name: '공유 대상' });
  await user.click(await within(picker).findByRole('checkbox', { name: '야간조 (2명)' }));
  return picker;
}

describe('sharing keeps its input until the store answers ok (C1)', () => {
  it('holds the picker open and disabled while the save is pending, then closes on ok', async () => {
    const user = userEvent.setup();
    const store = createFakeViewStore([]);
    store.groups = GROUPS;
    let release: () => void = () => {};
    const gate = new Promise<void>(resolve => { release = resolve; });
    const save = store.save;
    store.save = async input => { await gate; return save(input); };
    mount(store, `/?scopeId=MEM&${period}&roomNames=PHOTO`);
    const picker = await startShare(user);
    await user.click(within(picker).getByRole('button', { name: '공유 대상 저장' }));
    expect(screen.getByRole('dialog', { name: '공유 대상' })).toBeTruthy();
    expect(within(picker).getByRole('button', { name: '공유 대상 저장' })).toBeDisabled();
    release();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect([...store.rows.values()][0]?.visibility).toEqual({ kind: 'groups', groupIds: ['g1'] });
  });

  it('keeps the name and the chosen group when the share is refused, and retries without a second view', async () => {
    const user = userEvent.setup();
    const store = createFakeViewStore([]);
    store.groups = GROUPS;
    store.failShare = true;
    mount(store, `/?scopeId=MEM&${period}&roomNames=PHOTO`);
    const picker = await startShare(user);
    await user.click(within(picker).getByRole('button', { name: '공유 대상 저장' }));
    expect(await within(screen.getByRole('dialog', { name: '공유 대상' })).findByRole('alert')).toHaveTextContent('공유 뷰');
    expect(within(picker).getByRole('checkbox', { name: '야간조 (2명)' })).toBeChecked();
    store.failShare = false;
    await user.click(within(picker).getByRole('button', { name: '공유 대상 저장' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(store.calls.filter(c => c === 'save')).toHaveLength(1);
    expect(store.rows.size).toBe(1);
    expect([...store.rows.values()][0]?.visibility).toEqual({ kind: 'groups', groupIds: ['g1'] });
  });

  it('keeps the picker when the first save is refused and saves on the retry', async () => {
    const user = userEvent.setup();
    const store = createFakeViewStore([]);
    store.groups = GROUPS;
    store.failSave = true;
    mount(store, `/?scopeId=MEM&${period}&roomNames=PHOTO`);
    const picker = await startShare(user);
    await user.click(within(picker).getByRole('button', { name: '공유 대상 저장' }));
    expect(await within(screen.getByRole('dialog', { name: '공유 대상' })).findByRole('alert')).toBeTruthy();
    expect(store.rows.size).toBe(0);
    store.failSave = false;
    await user.click(within(picker).getByRole('button', { name: '공유 대상 저장' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(store.rows.size).toBe(1);
  });
});

describe('menu keys are declared once (C2, C3)', () => {
  it('shows a view saved with time and roomNames as up to date when only the menu keys are declared', async () => {
    const user = userEvent.setup();
    mount(createFakeViewStore([L1]), `/?scopeId=MEM&${period}`);
    await user.click(await screen.findByRole('button', { name: /^저장된 뷰:/ }));
    await user.click(await screen.findByRole('button', { name: '뷰 관리' }));
    const dialog = await screen.findByRole('dialog', { name: '뷰 관리' });
    await user.click(within(dialog).getByRole('radio', { name: /낡음·권한 부족/ }));
    expect(within(dialog).queryByText(/포토 뷰/)).toBeNull();
  });

  it('raises the menu schema version with the migrated content, so the view becomes selectable', async () => {
    const user = userEvent.setup();
    support = { ...baseSupport, menuSchemaVersion: 2, migrate: (_from, view) => ({ ok: true, view: { ...view, menuSchemaVersion: 2 }, preview: [{ key: 'menuSchemaVersion', before: 1, after: 2 }] }) };
    const store = createFakeViewStore([{ ...L1, name: '이전 뷰' } as never]);
    mount(store, `/?scopeId=MEM&${period}`);
    await user.click(await screen.findByRole('button', { name: /^저장된 뷰:/ }));
    await user.click(await screen.findByRole('button', { name: '뷰 관리' }));
    const dialog = await screen.findByRole('dialog', { name: '뷰 관리' });
    await user.click(within(dialog).getByRole('radio', { name: /낡음·권한 부족/ }));
    await user.click(within(dialog).getAllByRole('button', { name: /이전 뷰/ })[0]!);
    await user.click(await within(dialog).findByRole('button', { name: '미리 본 내용으로 갱신' }));
    await waitFor(() => expect((store.rows.get('l1') as { menuSchemaVersion: number }).menuSchemaVersion).toBe(2));
    await waitFor(() => expect(within(dialog).queryByRole('button', { name: '미리 본 내용으로 갱신' })).toBeNull());
  });
});

describe('an unapplied draft is not dropped silently (C4)', () => {
  it('says so before save-and-switch, and cancelling neither saves nor switches', async () => {
    const user = userEvent.setup();
    const L2 = viewOf({ ...L1, id: 'l2', name: '둘째 뷰' } as never);
    const store = createFakeViewStore([L1, L2]);
    mount(store, `/?scopeId=MEM&${period}&roomNames=PHOTO`);
    await waitFor(() => expect(platform.scope.status).toBe('valid'));
    await user.click(await screen.findByRole('button', { name: /^저장된 뷰:/ }));
    await pick(user, '포토 뷰');
    await waitFor(() => expect(selector()).toHaveAccessibleName('저장된 뷰: 포토 뷰'));
    act(() => platform.queryDraft.setDraftGlobal({ roomNames: ['ETCH'] }));
    await user.click(selector());
    await user.click(await screen.findByRole('button', row('둘째 뷰')));
    await user.click(await screen.findByRole('button', { name: '저장하고 이동' }));
    const ask = await screen.findByRole('dialog', { name: '적용하지 않은 변경이 있습니다' });
    expect(ask).toHaveTextContent('적용하지 않은 변경');
    expect(ask).toHaveTextContent('사라집니다');
    await user.click(within(ask).getByRole('button', { name: '취소' }));
    expect(store.calls).not.toContain('update');
    expect(selector()).toHaveAccessibleName(expect.stringContaining('포토 뷰'));
  });

  it('saves the applied conditions and switches after the user confirms', async () => {
    const user = userEvent.setup();
    const L2 = viewOf({ ...L1, id: 'l2', name: '둘째 뷰' } as never);
    const store = createFakeViewStore([L1, L2]);
    mount(store, `/?scopeId=MEM&${period}&roomNames=PHOTO`);
    await waitFor(() => expect(platform.scope.status).toBe('valid'));
    await user.click(await screen.findByRole('button', { name: /^저장된 뷰:/ }));
    await pick(user, '포토 뷰');
    await waitFor(() => expect(selector()).toHaveAccessibleName('저장된 뷰: 포토 뷰'));
    act(() => platform.queryDraft.setDraftGlobal({ roomNames: ['ETCH'] }));
    await user.click(selector());
    await user.click(await screen.findByRole('button', row('둘째 뷰')));
    await user.click(await screen.findByRole('button', { name: '저장하고 이동' }));
    await user.click(within(await screen.findByRole('dialog', { name: '적용하지 않은 변경이 있습니다' })).getByRole('button', { name: '적용된 조건만 저장하고 이동' }));
    await waitFor(() => expect(selector()).toHaveAccessibleName('저장된 뷰: 둘째 뷰'));
    expect(store.calls).toContain('update');
  });
});

describe('a switch asks only when something would be lost (UX-1)', () => {
  it('switches at once from the conditions the screen was opened with', async () => {
    const user = userEvent.setup();
    mount(createFakeViewStore([L1]), `/?scopeId=MEM&${period}&roomNames=PHOTO`);
    await waitFor(() => expect(platform.scope.status).toBe('valid'));
    await user.click(await screen.findByRole('button', { name: /^저장된 뷰:/ }));
    await user.click(await screen.findByRole('button', row('포토 뷰')));
    expect(screen.queryByRole('dialog', { name: '변경한 내용을 어떻게 할까요?' })).toBeNull();
    await waitFor(() => expect(selector()).toHaveAccessibleName('저장된 뷰: 포토 뷰'));
  });

  it('asks once the user applied other conditions without a view', async () => {
    const user = userEvent.setup();
    mount(createFakeViewStore([L1]), `/?scopeId=MEM&${period}&roomNames=ETCH`);
    await waitFor(() => expect(platform.scope.status).toBe('valid'));
    await screen.findByRole('button', { name: /^저장된 뷰:/ });
    act(() => platform.setGlobal({ roomNames: ['PHOTO'] }));
    await user.click(selector());
    await user.click(await screen.findByRole('button', row('포토 뷰')));
    expect(await screen.findByRole('dialog', { name: '변경한 내용을 어떻게 할까요?' })).toBeTruthy();
  });
});

describe('the selection survives folding the query bar (C5)', () => {
  it('keeps the edited view while folding and unfolding', async () => {
    const user = userEvent.setup();
    mount(createFakeViewStore([L1]), `/?scopeId=MEM&${period}&roomNames=PHOTO`);
    await waitFor(() => expect(platform.scope.status).toBe('valid'));
    await user.click(await screen.findByRole('button', { name: /^저장된 뷰:/ }));
    await pick(user, '포토 뷰');
    await waitFor(() => expect(selector()).toHaveAccessibleName('저장된 뷰: 포토 뷰'));
    act(() => platform.setGlobal({ roomNames: ['ETCH'] }));
    await waitFor(() => expect(screen.getByText('수정됨')).toBeTruthy());
    for (const name of ['조회 조건 접기', '조회 조건 펼치기', '조회 조건 접기']) {
      await user.click(screen.getByRole('button', { name }));
      expect(selector()).toHaveAccessibleName('저장된 뷰: 포토 뷰');
      expect(screen.getByText('수정됨')).toBeTruthy();
    }
  });
});

describe('approval detail comes from the store (C6)', () => {
  it('shows the target version, requester and change lines of a waiting request', async () => {
    const user = userEvent.setup();
    const waiting = viewOf({ id: 'p1', name: '승인 요청 뷰', kind: 'menu-view', ownerId: 'u9', approval: 'pending', menuId: 'home', menuSchemaVersion: 1, page: [], chartOptions: {}, layout: null, panels: null, context: { roomNames: ['PHOTO'] } } as never);
    const store = createFakeViewStore([waiting]);
    store.caps.set('p1', { ...ALL, canEdit: false, canShare: false, canApprove: true });
    store.requests = [{ viewId: 'p1', requestedBy: 'u9', requestedAt: Date.UTC(2026, 9, 21, 1, 0), targetVersion: 3, changes: ['기간 24시간 → 72시간'] }];
    mount(store, `/?scopeId=MEM&${period}`);
    await user.click(await screen.findByRole('button', { name: /^저장된 뷰:/ }));
    await user.click(await screen.findByRole('button', { name: '뷰 관리' }));
    const dialog = await screen.findByRole('dialog', { name: '뷰 관리' });
    await user.click(await within(dialog).findByRole('button', { name: /승인 요청 뷰/ }));
    const detail = await within(dialog).findByRole('region', { name: '승인 요청 뷰' });
    expect(detail).toHaveTextContent('v3');
    expect(detail).toHaveTextContent('기간 24시간 → 72시간');
    expect(detail).toHaveTextContent('u9');
  });
});

describe('group filters (C7)', () => {
  it('offers the groups the store allows as selector filters', async () => {
    const user = userEvent.setup();
    const store = createFakeViewStore([L1]);
    store.groups = GROUPS;
    mount(store, `/?scopeId=MEM&${period}`);
    await user.click(await screen.findByRole('button', { name: /^저장된 뷰:/ }));
    expect(await screen.findByRole('button', { name: '야간조' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: '포토팀' })).toBeTruthy();
  });
});

describe('selected view', () => {
  it('is picked only after the store answers (a denied view leaves the current one)', async () => {
    const user = userEvent.setup();
    const store = createFakeViewStore([L1]);
    mount(store, `/?scopeId=MEM&${period}`);
    await user.click(await screen.findByRole('button', { name: /^저장된 뷰:/ }));
    store.caps.set('l1', { canView: false, canCopy: false, canEdit: false, canShare: false, canApprove: false, canRevoke: false });
    await pick(user, '포토 뷰');
    await waitFor(() => expect(toasts().join(' ')).toContain('권한이 없습니다'));
    expect(selector()).toHaveAccessibleName('저장된 뷰: 저장하지 않은 조건');
  });
});

describe('store writes of the shell go through the hook and never reject', () => {
  const UNAVAILABLE = '지금은 저장할 수 없습니다';
  async function openStale(user: ReturnType<typeof userEvent.setup>, store: FakeViewStore) {
    mount(store, `/?scopeId=MEM&${period}`);
    await user.click(await screen.findByRole('button', { name: /^저장된 뷰:/ }));
    await user.click(await screen.findByRole('button', { name: '뷰 관리' }));
    const dialog = await screen.findByRole('dialog', { name: '뷰 관리' });
    await user.click(within(dialog).getByRole('radio', { name: /낡음·권한 부족/ }));
    await user.click(within(dialog).getAllByRole('button', { name: /이전 뷰/ })[0]!);
    return dialog;
  }
  const migrating = { ...baseSupport, menuSchemaVersion: 2 };

  it('reports unavailable when the migrated update throws, and shows no success', async () => {
    const user = userEvent.setup();
    support = { ...migrating, migrate: (_from, view) => ({ ok: true, view: { ...view, menuSchemaVersion: 2 }, preview: [{ key: 'menuSchemaVersion', before: 1, after: 2 }] }) };
    const store = createFakeViewStore([{ ...L1, name: '이전 뷰' } as never]);
    store.update = async () => { throw new Error('offline'); };
    const dialog = await openStale(user, store);
    await user.click(await within(dialog).findByRole('button', { name: '미리 본 내용으로 갱신' }));
    await waitFor(() => expect(toasts().join(' ')).toContain(UNAVAILABLE));
    expect(toasts().join(' ')).not.toContain('새 버전으로 갱신했습니다');
  });

  it('reports unavailable when the confirmed migration cannot be derived (apply throws), and sends no update', async () => {
    const user = userEvent.setup();
    support = migrating;
    vi.mocked(diagnoseSavedView).mockImplementation(() => ({ status: 'stale', reasons: [{ code: 'migration-unavailable' }], migration: { preview: [{ key: 'menuSchemaVersion', before: 1, after: 2 }], apply: () => { throw new Error('bad preview'); } } }) as never);
    const store = createFakeViewStore([{ ...L1, name: '이전 뷰' } as never]);
    const dialog = await openStale(user, store);
    await user.click(await within(dialog).findByRole('button', { name: '미리 본 내용으로 갱신' }));
    await waitFor(() => expect(toasts().join(' ')).toContain(UNAVAILABLE));
    expect(toasts().join(' ')).not.toContain('새 버전으로 갱신했습니다');
    expect(store.calls).not.toContain('update');
    vi.mocked(diagnoseSavedView).mockRestore();
  });

  it('keeps the picker open and retries without a second view when the share call throws', async () => {
    const user = userEvent.setup();
    const store = createFakeViewStore([]);
    store.groups = GROUPS;
    const real = store.setVisibility;
    store.setVisibility = async () => { throw new Error('offline'); };
    mount(store, `/?scopeId=MEM&${period}&roomNames=PHOTO`);
    const picker = await startShare(user);
    await user.click(within(picker).getByRole('button', { name: '공유 대상 저장' }));
    expect(await within(screen.getByRole('dialog', { name: '공유 대상' })).findByRole('alert')).toHaveTextContent('공유 뷰');
    store.setVisibility = real;
    await user.click(within(picker).getByRole('button', { name: '공유 대상 저장' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(store.calls.filter(c => c === 'save')).toHaveLength(1);
    expect([...store.rows.values()][0]?.visibility).toEqual({ kind: 'groups', groupIds: ['g1'] });
  });
});
