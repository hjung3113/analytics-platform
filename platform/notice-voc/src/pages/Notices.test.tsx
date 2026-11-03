import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useLayoutEffect } from 'react';
import { createRegistry, I18nProvider, useI18n, PlatformProvider, type MenuEntry } from '@ap/kernel';
import { settleQueries, testAdapter, testSpace, testSession, ToastProbe } from '@ap/kernel/testing';
import { contextCapabilities, groupId, NO_FEATURES, spaceId, type ActionResponse, type ApiResponse, type Notice, type NoticeListPage, type Permission } from '@ap/contracts';
import { House } from 'lucide-react';
import { manifests } from '../index';
import { NoticesScreen } from './Notices';

const NOW = '2026-11-03T12:00:00';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const notice = (id: string, until: string, over: Partial<Notice> = {}): Notice => ({ id, title: { ko: `제목 ${id}`, en: `Title ${id}` }, content: { ko: `내용 ${id}`, en: `Body ${id}` }, scopeId: null, until, version: 'v1', ...over });
const NOTICES = [notice('n-old', '2026-10-01T00:00:00'), notice('n-soon', '2026-11-05T00:00:00'), notice('n-late', '2026-12-01T00:00:00'), notice('n-edge', NOW)];

const opsHome: MenuEntry = {
  id: 'ops-home', primary: true, group: groupId('ops'), label: { ko: '운영 홈', en: 'Ops home' }, description: { ko: '', en: '' }, path: '/ops/home', icon: House,
  permission: 'notice:view', requiresScope: false, pageType: 'management', context: contextCapabilities(), features: NO_FEATURES, pageKeys: [],
};
const registry = createRegistry({
  permissions: [], spaces: [testSpace({ id: spaceId('ops'), homeMenuId: 'ops-home' })],
  groups: [{ id: groupId('noticeVoc'), label: { ko: '소통', en: 'Communication' }, icon: House, space: null }, { id: groupId('ops'), label: { ko: '운영', en: 'Ops' }, icon: House, space: spaceId('ops') }],
  // The space needs one home menu of its own; the notices menu stays in the global group.
  menus: [...manifests, opsHome],
});
const axes = [{ id: 'stgroup', label: { ko: 'StGroup', en: 'StGroup' }, membershipHistory: false }];
const list = (items: readonly Notice[]): ApiResponse<NoticeListPage> => items.length === 0
  ? { outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'f' }
  : { outcome: 'ok', data: { items }, assessments: [], trust: null, correlationId: 'f' };
const action = <T,>(over: Partial<ActionResponse<T>>): ActionResponse<T> => ({ outcome: 'ok', data: null, version: null, fieldErrors: [], replayed: false, correlationId: 'f', ...over });

/** Switches the UI language through the Kernel setter (menu code never touches storage). */
function UseLang({ lang }: { lang: 'en' }) {
  const i18n = useI18n();
  useLayoutEffect(() => { i18n.setLang(lang); }, []); // eslint-disable-line react-hooks/exhaustive-deps -- once, on mount
  return null;
}

type Over = { lang?: 'en'; items?: readonly Notice[]; save?: (input: unknown) => Promise<ActionResponse<Notice>>; del?: (input: unknown) => Promise<ActionResponse<{ id: string }>> };
function mount(permissions: Permission[], path = '/notices', over: Over = {}) {
  window.history.replaceState(null, '', path);
  // session() is a store snapshot: a new object (and a notification) per change.
  let session = testSession(permissions);
  const listeners = new Set<() => void>();
  const setPermissions = (next: Permission[]) => { session = testSession(next); listeners.forEach(l => l()); };
  const listNotices = vi.fn(async () => list(over.items ?? NOTICES));
  const saveNotice = vi.fn(over.save ?? (async () => action<Notice>({})));
  const deleteNotice = vi.fn(over.del ?? (async () => action<{ id: string }>({})));
  const adapter = testAdapter({ session: () => session, subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, listNotices, saveNotice: saveNotice as never, deleteNotice: deleteNotice as never });
  const view = render(<I18nProvider><PlatformProvider equipmentAxes={axes} adapter={adapter} registry={registry}>{over.lang && <UseLang lang={over.lang} />}<NoticesScreen clock={() => NOW} /><ToastProbe /></PlatformProvider></I18nProvider>);
  return { listNotices, saveNotice, deleteNotice, setPermissions, unmount: view.unmount };
}
const focus = () => new URLSearchParams(window.location.search).get('focus');
const ADMIN: Permission[] = ['notice:view', 'console:access'];

beforeEach(() => { window.history.replaceState(null, '', '/notices'); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.history.replaceState(null, '', '/'); });

describe('Notices list and reading pane', () => {
  it('lists active notices by until descending and keeps expired ones in a collapsed 종료됨 group', async () => {
    mount(['notice:view']);
    const active = await screen.findByRole('list', { name: '진행 중인 공지' });
    expect(within(active).getAllByRole('button').map(b => b.textContent)).toEqual([expect.stringContaining('제목 n-late'), expect.stringContaining('제목 n-soon')]);
    const toggle = screen.getByRole('button', { name: /종료됨 2/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText(/제목 n-old/)).toBeNull();
    fireEvent.click(toggle);
    const ended = screen.getByRole('list', { name: '종료된 공지' });
    // equality with now is expired; ended group is until descending too.
    expect(within(ended).getAllByRole('button').map(b => b.textContent)).toEqual([expect.stringContaining('제목 n-edge'), expect.stringContaining('제목 n-old')]);
  });

  it('shows the empty-active state and opens the expired group on demand', async () => {
    mount(['notice:view'], '/notices', { items: [notice('n-old', '2026-10-01T00:00:00')] });
    expect(await screen.findByText('진행 중인 공지가 없습니다.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /종료됨 1/ }));
    expect(screen.getByText('제목 n-old')).toBeTruthy();
  });

  it('round-trips focus through the address and renders title, content, site and period end', async () => {
    mount(['notice:view']);
    fireEvent.click(await screen.findByRole('button', { name: /제목 n-soon/ }));
    expect(focus()).toBe('n-soon');
    const pane = screen.getByRole('region', { name: '공지 내용' });
    expect(within(pane).getByText('제목 n-soon')).toBeTruthy();
    expect(within(pane).getByText('내용 n-soon')).toBeTruthy();
    expect(pane.textContent).toContain('전체');
    expect(pane.textContent).toContain('2026-11-05 00:00');
  });

  it('opens a focused notice from the address, expanding 종료됨 when it is expired', async () => {
    mount(['notice:view'], '/notices?focus=n-old');
    const pane = await screen.findByRole('region', { name: '공지 내용' });
    expect(within(pane).getByText('내용 n-old')).toBeTruthy();
    expect(screen.getByRole('button', { name: /종료됨 2/ }).getAttribute('aria-expanded')).toBe('true');
  });

  it('rejects an unknown focus value, keeps it in the address and clears only on request', async () => {
    mount(['notice:view'], '/notices?focus=nope');
    expect(await screen.findByText('찾을 수 없는 공지입니다')).toBeTruthy();
    expect(focus()).toBe('nope');
    fireEvent.click(screen.getByRole('button', { name: '값 지우기' }));
    expect(focus()).toBeNull();
  });

  it('falls back to ko when the English text is empty', async () => {
    mount(['notice:view'], '/notices?focus=n-late', { lang: 'en', items: [notice('n-late', '2026-12-01T00:00:00', { title: { ko: '한국어 제목', en: '' }, content: { ko: '한국어 내용', en: '' } })] });
    // English is really active: the English labels render, not the Korean ones.
    const pane = await screen.findByRole('region', { name: 'Notice content' });
    expect(screen.queryByRole('region', { name: '공지 내용' })).toBeNull();
    expect(within(pane).getByText('한국어 제목')).toBeTruthy();
    expect(within(pane).getByText('한국어 내용')).toBeTruthy();
    expect(within(screen.getByRole('list', { name: 'Active notices' })).getByText('한국어 제목')).toBeTruthy();
  });

  it('rejects an empty focus value on a populated list', async () => {
    mount(['notice:view'], '/notices?focus=');
    expect(await screen.findByText('찾을 수 없는 공지입니다')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '값 지우기' }));
    expect(focus()).toBeNull();
  });

  it('rejects an unknown focus value when the list is empty and keeps it until cleared', async () => {
    mount(['notice:view'], '/notices?focus=gone', { items: [] });
    expect(await screen.findByText('찾을 수 없는 공지입니다')).toBeTruthy();
    expect(focus()).toBe('gone');
    fireEvent.click(screen.getByRole('button', { name: '값 지우기' }));
    expect(focus()).toBeNull();
  });

  it('puts the list and the reading pane side by side from the md breakpoint', async () => {
    mount(['notice:view']);
    const pane = await screen.findByRole('region', { name: '공지 내용' });
    expect(pane.parentElement!.className).toContain('md:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)]');
    expect(pane.parentElement!.className).toContain('grid-cols-1');
  });
});

describe('write controls are gated by console:access', () => {
  it('shows no write control to a viewer', async () => {
    mount(['notice:view'], '/notices?focus=n-soon');
    await screen.findByText('내용 n-soon');
    expect(screen.queryByRole('button', { name: /공지 작성/ })).toBeNull();
    expect(screen.queryByRole('button', { name: '수정' })).toBeNull();
    expect(screen.queryByRole('button', { name: '삭제' })).toBeNull();
  });

  it('shows 공지 작성, 수정 and 삭제 to a console user', async () => {
    mount(ADMIN, '/notices?focus=n-soon');
    await screen.findByText('내용 n-soon');
    expect(screen.getByRole('button', { name: /공지 작성/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: '수정' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '삭제' })).toBeTruthy();
  });
});

async function fillCreate() {
  fireEvent.click(await screen.findByRole('button', { name: /공지 작성/ }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText('제목 (한국어)'), { target: { value: '새 공지' } });
  fireEvent.change(within(dialog).getByLabelText('내용 (한국어)'), { target: { value: '새 내용' } });
  fireEvent.change(within(dialog).getByLabelText(/종료 일시/), { target: { value: '2026-12-31T09:30' } });
  return dialog;
}
const submit = (dialog: HTMLElement) => fireEvent.click(within(dialog).getByRole('button', { name: '저장' }));

describe('save', () => {
  it('creates with the exact wire payload and a UUID key, then refetches and focuses the new notice', async () => {
    const saved = notice('n-new', '2026-12-31T09:30:00');
    const m = mount(ADMIN, '/notices', { save: async () => action<Notice>({ data: saved, version: 'v1' }) });
    const dialog = await fillCreate();
    submit(dialog);
    await waitFor(() => expect(m.saveNotice).toHaveBeenCalledTimes(1));
    const sent = m.saveNotice.mock.calls[0]![0] as Record<string, unknown>;
    expect(sent).toEqual({ title: { ko: '새 공지', en: '' }, content: { ko: '새 내용', en: '' }, scopeId: null, until: '2026-12-31T09:30:00', idempotencyKey: expect.stringMatching(UUID) });
    await waitFor(() => expect(m.listNotices).toHaveBeenCalledTimes(2));
    expect(focus()).toBe('n-new');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('treats a replayed ok as success', async () => {
    const m = mount(ADMIN, '/notices', { save: async () => action<Notice>({ data: notice('n-new', '2026-12-31T09:30:00'), replayed: true }) });
    submit(await fillCreate());
    await waitFor(() => expect(focus()).toBe('n-new'));
    expect(screen.getByLabelText('toasts').textContent).toContain('공지를 저장했습니다');
    expect(m.saveNotice).toHaveBeenCalledTimes(1);
  });

  it('sends expectedVersion on edit and, on conflict, asks to reload without overwriting', async () => {
    const m = mount(ADMIN, '/notices?focus=n-soon', { save: async () => action<Notice>({ outcome: 'conflict', version: 'v2' }) });
    fireEvent.click(await screen.findByRole('button', { name: '수정' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('제목 (한국어)'), { target: { value: '고친 제목' } });
    submit(dialog);
    expect(await within(dialog).findByText('다른 곳에서 먼저 바뀌었습니다')).toBeTruthy();
    expect(m.saveNotice.mock.calls[0]![0]).toMatchObject({ id: 'n-soon', expectedVersion: 'v1' });
    expect(m.saveNotice).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: '다시 시도' })).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: '최신 내용 불러오기' }));
    await waitFor(() => expect(m.listNotices).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('maps an invalid answer to the field and keeps the dialog open', async () => {
    mount(ADMIN, '/notices', { save: async () => action<Notice>({ outcome: 'invalid', fieldErrors: [{ path: ['until'], code: 'invalid' }] }) });
    const dialog = await fillCreate();
    submit(dialog);
    expect(await within(dialog).findByText('입력을 확인하세요')).toBeTruthy();
    expect(within(dialog).getByText('올바른 값이 아닙니다.')).toBeTruthy();
  });

  it('shows a forbidden answer as a message and changes nothing', async () => {
    const m = mount(ADMIN, '/notices', { save: async () => action<Notice>({ outcome: 'forbidden' }) });
    const dialog = await fillCreate();
    submit(dialog);
    expect(await within(dialog).findByText('공지를 관리할 권한이 없습니다')).toBeTruthy();
    expect(m.listNotices).toHaveBeenCalledTimes(1);
  });

  it('retries an uncertain answer with the identical input and key, and a changed input gets a new key', async () => {
    let calls = 0;
    const m = mount(ADMIN, '/notices', { save: async () => (++calls < 3 ? action<Notice>({ outcome: 'unknown' }) : action<Notice>({ data: notice('n-new', '2026-12-31T09:30:00') })) });
    const dialog = await fillCreate();
    submit(dialog);
    fireEvent.click(await within(dialog).findByRole('button', { name: '다시 시도' }));
    await waitFor(() => expect(m.saveNotice).toHaveBeenCalledTimes(2));
    const [first, second] = m.saveNotice.mock.calls.map(c => c[0] as { idempotencyKey: string });
    expect(second).toEqual(first);
    // Change the input: a new operation gets a new key.
    fireEvent.change(within(dialog).getByLabelText('제목 (한국어)'), { target: { value: '다른 제목' } });
    submit(dialog);
    await waitFor(() => expect(m.saveNotice).toHaveBeenCalledTimes(3));
    const third = m.saveNotice.mock.calls[2]![0] as { idempotencyKey: string };
    expect(third.idempotencyKey).not.toBe(first!.idempotencyKey);
    expect(third.idempotencyKey).toMatch(UUID);
  });

  it('blocks an empty title client-side without calling the port', async () => {
    const m = mount(ADMIN);
    fireEvent.click(await screen.findByRole('button', { name: /공지 작성/ }));
    const dialog = await screen.findByRole('dialog');
    submit(dialog);
    expect(await within(dialog).findAllByText('필수 항목입니다.')).not.toHaveLength(0);
    expect(m.saveNotice).not.toHaveBeenCalled();
    const title = within(dialog).getByLabelText('제목 (한국어)');
    expect(title.getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById(title.getAttribute('aria-describedby')!)!.textContent).toBe('필수 항목입니다.');
    // A field without an error carries neither attribute.
    expect(within(dialog).getByLabelText('제목 (English)').getAttribute('aria-invalid')).toBeNull();
  });
});

describe('delete', () => {
  it('deletes with expectedVersion and a UUID key, then refetches and clears focus', async () => {
    const m = mount(ADMIN, '/notices?focus=n-soon');
    fireEvent.click(await screen.findByRole('button', { name: '삭제' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: '삭제' }));
    await waitFor(() => expect(m.deleteNotice).toHaveBeenCalledTimes(1));
    expect(m.deleteNotice.mock.calls[0]![0]).toEqual({ id: 'n-soon', expectedVersion: 'v1', idempotencyKey: expect.stringMatching(UUID) });
    await waitFor(() => expect(m.listNotices).toHaveBeenCalledTimes(2));
    expect(focus()).toBeNull();
  });

  it('asks to reload on a delete conflict and does not claim success', async () => {
    const m = mount(ADMIN, '/notices?focus=n-soon', { del: async () => action<{ id: string }>({ outcome: 'conflict', version: 'v2' }) });
    fireEvent.click(await screen.findByRole('button', { name: '삭제' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: '삭제' }));
    expect(await within(dialog).findByText('다른 곳에서 먼저 바뀌었습니다')).toBeTruthy();
    expect(focus()).toBe('n-soon');
    expect(m.listNotices).toHaveBeenCalledTimes(1);
    await settleQueries();
  });
});

describe('delete focus', () => {
  const deleteSelected = async () => {
    fireEvent.click(await screen.findByRole('button', { name: '삭제' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: '삭제' }));
  };

  it('moves focus to the next list item after a delete', async () => {
    mount(ADMIN, '/notices?focus=n-late');
    await deleteSelected();
    await waitFor(() => expect(document.activeElement?.textContent).toContain('제목 n-soon'));
  });

  it('moves focus to the list heading when no next item exists', async () => {
    mount(ADMIN, '/notices?focus=n-soon');
    await deleteSelected();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: '공지 목록' })));
  });
});

describe('late completion and access changes', () => {
  const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; };

  it('ignores a save that finishes after the screen was left', async () => {
    const gate = deferred<ActionResponse<Notice>>();
    const m = mount(ADMIN, '/notices?focus=n-soon', { save: () => gate.promise });
    fireEvent.click(await screen.findByRole('button', { name: '수정' }));
    submit(await screen.findByRole('dialog'));
    await waitFor(() => expect(m.saveNotice).toHaveBeenCalledTimes(1));
    m.unmount();
    window.history.replaceState(null, '', '/elsewhere');
    gate.resolve(action<Notice>({ data: notice('n-new', '2026-12-31T09:30:00') }));
    await settleQueries();
    expect(window.location.pathname).toBe('/elsewhere');
    expect(focus()).toBeNull();
    expect(m.listNotices).toHaveBeenCalledTimes(1);
  });

  it('ignores a delete that finishes after the screen was left', async () => {
    const gate = deferred<ActionResponse<{ id: string }>>();
    const m = mount(ADMIN, '/notices?focus=n-soon', { del: () => gate.promise });
    fireEvent.click(await screen.findByRole('button', { name: '삭제' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '삭제' }));
    await waitFor(() => expect(m.deleteNotice).toHaveBeenCalledTimes(1));
    m.unmount();
    window.history.replaceState(null, '', '/elsewhere?focus=keep');
    gate.resolve(action<{ id: string }>({}));
    await settleQueries();
    expect(focus()).toBe('keep');
    expect(m.listNotices).toHaveBeenCalledTimes(1);
  });

  it('closes an open form dialog when write access is revoked and ignores its late save', async () => {
    const gate = deferred<ActionResponse<Notice>>();
    const m = mount(ADMIN, '/notices?focus=n-soon', { save: () => gate.promise });
    fireEvent.click(await screen.findByRole('button', { name: '수정' }));
    submit(await screen.findByRole('dialog'));
    await waitFor(() => expect(m.saveNotice).toHaveBeenCalledTimes(1));
    act(() => m.setPermissions(['notice:view']));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByRole('button', { name: '수정' })).toBeNull();
    gate.resolve(action<Notice>({ data: notice('n-new', '2026-12-31T09:30:00') }));
    await settleQueries();
    expect(focus()).toBe('n-soon');
  });

  it('closes an open delete dialog when write access is revoked', async () => {
    const m = mount(ADMIN, '/notices?focus=n-soon');
    fireEvent.click(await screen.findByRole('button', { name: '삭제' }));
    await screen.findByRole('dialog');
    act(() => m.setPermissions(['notice:view']));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(m.deleteNotice).not.toHaveBeenCalled();
  });
});
