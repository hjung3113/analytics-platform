import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import type { GroupMember, ViewGroupEntry } from '@ap/contracts';
import { ShareTargetPicker, type ShareGroupsState, type ShareTargetDraft, type ShareTargetPickerProps } from './ShareTargetPicker';

afterEach(cleanup);

const kim1: GroupMember = { userId: 'u1', displayName: '김민수', affiliation: '포토 1공정' };
const kim2: GroupMember = { userId: 'u2', displayName: '김민수', affiliation: '식각 2공정' };
const group = (id: string, name: string, kind: 'org-team' | 'custom'): ViewGroupEntry => ({
  group: { id, kind, name, memberCount: 3, managerIds: ['me'] },
  members: [],
  capabilities: { canView: true, canEditMembers: kind === 'custom', canRename: kind === 'custom', canDelete: kind === 'custom' },
});
const ready = (entries: ViewGroupEntry[]): ShareGroupsState => ({ status: 'ready', entries, retry: () => {} });
const base: ShareTargetDraft = { mode: 'groups', people: [], groupIds: [] };

function Harness({ value = base, groups = ready([group('t1', '포토팀', 'org-team'), group('c1', '내 교대조', 'custom')]), ...extra }: Partial<ShareTargetPickerProps>) {
  const [open, setOpen] = useState(true);
  return <>
    <button type="button" onClick={() => setOpen(true)}>열기</button>
    <ShareTargetPicker open={open} onOpenChange={setOpen} value={value} groups={groups} currentUserId="me"
      searchPeople={async () => [kim1, kim2]}
      onCreateGroup={async input => ({ ok: true, value: group('new', input.name, 'custom') })}
      onUpdateGroup={async () => ({ ok: false, reason: 'invalid' })}
      onConfirm={() => {}} {...extra} />
  </>;
}

it('lists org teams and custom groups in two blocks, marking org-team members as not editable', () => {
  render(<Harness />);
  const org = screen.getByRole('region', { name: '조직 팀' });
  const custom = screen.getByRole('region', { name: '내 커스텀 그룹' });
  expect(within(org).getByText('포토팀')).toBeTruthy();
  expect(within(org).getByText('멤버 편집 불가')).toBeTruthy();
  expect(within(custom).getByText('내 교대조')).toBeTruthy();
  expect(within(custom).queryByText('멤버 편집 불가')).toBeNull();
});

it('filters groups by search and says so when nothing matches', async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.type(screen.getByLabelText('그룹 검색'), '교대');
  expect(screen.queryByText('포토팀')).toBeNull();
  expect(screen.getByText('내 교대조')).toBeTruthy();
  await user.clear(screen.getByLabelText('그룹 검색'));
  await user.type(screen.getByLabelText('그룹 검색'), 'zzz');
  expect(screen.getByText('검색 결과가 없습니다.')).toBeTruthy();
});

it.each([
  ['loading', '그룹을 불러오는 중…'],
  ['error', '그룹을 불러오지 못했습니다.'],
] as const)('shows the %s state of the group list', (status, text) => {
  render(<Harness groups={{ status, entries: [], retry: () => {} }} />);
  expect(screen.getByText(text, { exact: false })).toBeTruthy();
});

it('retries a failed group list', async () => {
  const retry = vi.fn();
  render(<Harness groups={{ status: 'error', entries: [], retry }} />);
  await userEvent.click(screen.getByRole('button', { name: '다시 시도' }));
  expect(retry).toHaveBeenCalled();
});

it('summarises the selection', async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByLabelText('포토팀 (3명)'));
  await user.click(screen.getByLabelText('내 교대조 (3명)'));
  expect(screen.getByRole('status', { name: '선택 요약' }).textContent).toBe('그룹 2개 선택: 포토팀, 내 교대조');
});

it('shows affiliation for same-named people in the people search', async () => {
  const user = userEvent.setup();
  render(<Harness value={{ mode: 'people', people: [], groupIds: [] }} />);
  await user.type(screen.getByLabelText('사람 검색'), '김');
  expect(await screen.findByLabelText('김민수 (포토 1공정)')).toBeTruthy();
  expect(screen.getByLabelText('김민수 (식각 2공정)')).toBeTruthy();
});

it('saving a people list as a group selects the group, keeps earlier groups, and shares nothing until the final save', async () => {
  const user = userEvent.setup();
  const onConfirm = vi.fn();
  render(<Harness value={{ mode: 'people', people: [kim1], groupIds: ['t1'] }} onConfirm={onConfirm} />);
  await user.click(screen.getByRole('button', { name: '사람 목록을 그룹으로 저장' }));
  await user.type(screen.getByLabelText('그룹 이름'), '새 교대');
  await user.click(screen.getByRole('button', { name: '그룹 만들기' }));
  await waitFor(() => expect(screen.getByRole('status', { name: '선택 요약' }).textContent).toBe('그룹 2개 선택: 포토팀, 새 교대'));
  expect(onConfirm).not.toHaveBeenCalled();
  expect(screen.getByText(/취소해도 그룹은 남습니다/)).toBeTruthy();
  await user.click(screen.getByRole('button', { name: '공유 대상 저장' }));
  expect(onConfirm).toHaveBeenCalledTimes(1);
  expect(onConfirm.mock.calls[0]?.[0]).toMatchObject({ mode: 'groups', groupIds: ['t1', 'new'] });
});

it('after creating a group it scrolls the new row into view and keeps it checked even when a search had hidden it', async () => {
  const user = userEvent.setup();
  const scroll = vi.fn();
  Element.prototype.scrollIntoView = scroll;
  render(<Harness />);
  await user.type(screen.getByLabelText('그룹 검색'), '포토');
  await user.click(screen.getByRole('button', { name: '새 그룹 만들기' }));
  await user.type(screen.getByLabelText('그룹 이름'), '야간조');
  await user.click(screen.getByRole('button', { name: '그룹 만들기' }));
  const box = await screen.findByLabelText('야간조 (3명)');
  expect(box.getAttribute('aria-checked')).toBe('true');
  expect((screen.getByLabelText('그룹 검색') as HTMLInputElement).value).toBe('');
  expect(scroll).toHaveBeenCalled();
  expect(scroll.mock.contexts.some(el => (el as HTMLElement).textContent?.includes('야간조'))).toBe(true);
});

it('closes nested dialogs one Escape at a time without focusing a closed parent', async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole('button', { name: '새 그룹 만들기' }));
  expect(screen.getByRole('dialog', { name: '새 그룹 만들기' })).toBeTruthy();
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog', { name: '새 그룹 만들기' })).toBeNull();
  expect(screen.getByRole('dialog', { name: '공유 대상' })).toBeTruthy();
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: '새 그룹 만들기' })));
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('asks for official approval without changing who can see the view', async () => {
  const user = userEvent.setup();
  const onConfirm = vi.fn();
  render(<Harness onConfirm={onConfirm} />);
  await user.click(screen.getByRole('radio', { name: '공식 신청' }));
  expect(screen.getByRole('status', { name: '선택 요약' }).textContent).toContain('지금 보는 사람은 바뀌지 않습니다');
  await user.click(screen.getByRole('button', { name: '공유 대상 저장' }));
  expect(onConfirm.mock.calls[0]?.[0]).toMatchObject({ mode: 'official' });
});

it('does not allow saving an empty people or group choice', async () => {
  render(<Harness />);
  expect((screen.getByRole('button', { name: '공유 대상 저장' }) as HTMLButtonElement).disabled).toBe(true);
});

// ---- FIX1 regression tests (C1–C5) ----
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

/** Host that starts closed with its own opener, and keeps created groups in a store like the real host. */
function StoreHarness({ value = base, onConfirm = () => {}, searchPeople }: { value?: ShareTargetDraft; onConfirm?: (draft: ShareTargetDraft) => void; searchPeople?: ShareTargetPickerProps['searchPeople'] }) {
  const [open, setOpen] = useState(false);
  const [stored, setStored] = useState<ViewGroupEntry[]>([]);
  return <>
    <button type="button" onClick={() => setOpen(true)}>열기</button>
    <ShareTargetPicker open={open} onOpenChange={setOpen} value={value} groups={ready([group('t1', '포토팀', 'org-team'), group('c1', '내 교대조', 'custom'), ...stored])} currentUserId="me"
      searchPeople={searchPeople ?? (async () => [kim1, kim2])}
      onCreateGroup={async input => { const entry = group(`new-${input.name}`, input.name, 'custom'); setStored(list => [...list, entry]); return { ok: true, value: entry }; }}
      onUpdateGroup={async () => ({ ok: false, reason: 'invalid' })}
      onConfirm={onConfirm} />
  </>;
}

it.each([
  ['Escape', async (user: ReturnType<typeof userEvent.setup>) => { await user.keyboard('{Escape}'); }],
  ['취소', async (user: ReturnType<typeof userEvent.setup>) => { await user.click(screen.getByRole('button', { name: '취소' })); }],
  ['저장', async (user: ReturnType<typeof userEvent.setup>) => { await user.click(screen.getByLabelText('포토팀 (3명)')); await user.click(screen.getByRole('button', { name: '공유 대상 저장' })); }],
] as const)('returns focus to the control that opened the picker after %s', async (_name, close) => {
  const user = userEvent.setup();
  render(<StoreHarness />);
  const opener = screen.getByRole('button', { name: '열기' });
  await user.click(opener);
  await user.click(screen.getByRole('radio', { name: '그룹' }));
  await close(user);
  expect(screen.queryByRole('dialog')).toBeNull();
  await waitFor(() => expect(document.activeElement).toBe(opener));
});

it('puts focus on the new group row when the editor was opened from a people list that no longer exists', async () => {
  const user = userEvent.setup();
  render(<StoreHarness value={{ mode: 'people', people: [kim1], groupIds: [] }} />);
  await user.click(screen.getByRole('button', { name: '열기' }));
  await user.click(screen.getByRole('button', { name: '사람 목록을 그룹으로 저장' }));
  await user.type(screen.getByLabelText('그룹 이름'), '야간조');
  await user.click(screen.getByRole('button', { name: '그룹 만들기' }));
  const box = await screen.findByLabelText('야간조 (3명)');
  await waitFor(() => expect(document.activeElement).toBe(box));
});

it.each([
  ['rename only', { canEditMembers: false, canRename: true }, true, false],
  ['members only', { canEditMembers: true, canRename: false }, false, true],
] as const)('opens the editor for a custom group with %s and limits it to that capability', async (_name, caps, nameEnabled, membersEnabled) => {
  const user = userEvent.setup();
  const entry = { ...group('c9', '권한조', 'custom'), capabilities: { canView: true, canDelete: false, ...caps } };
  render(<Harness groups={ready([entry])} />);
  await user.click(screen.getByRole('button', { name: '권한조 편집' }));
  expect((screen.getByLabelText('그룹 이름') as HTMLInputElement).disabled).toBe(!nameEnabled);
  expect(screen.queryByLabelText('멤버 검색') !== null).toBe(membersEnabled);
});

it('offers no editor for a group that can neither be renamed nor have members edited', () => {
  const entry = { ...group('c9', '잠금조', 'custom'), capabilities: { canView: true, canEditMembers: false, canRename: false, canDelete: false } };
  render(<Harness groups={ready([entry])} />);
  expect(screen.queryByRole('button', { name: '잠금조 편집' })).toBeNull();
});

it('a late success from a cancelled create keeps the group but does not close or reset the editor opened afterwards', async () => {
  const user = userEvent.setup();
  const pending = deferred<{ ok: true; value: ViewGroupEntry }>();
  const calls: string[] = [];
  render(<Harness onCreateGroup={input => { calls.push(input.name); return calls.length === 1 ? pending.promise : Promise.resolve({ ok: true as const, value: group('b', input.name, 'custom') }); }} />);
  await user.click(screen.getByRole('button', { name: '새 그룹 만들기' }));
  await user.type(screen.getByLabelText('그룹 이름'), '첫째');
  await user.click(screen.getByRole('button', { name: '그룹 만들기' }));
  await user.keyboard('{Escape}');
  await user.click(screen.getByRole('button', { name: '새 그룹 만들기' }));
  await user.type(screen.getByLabelText('그룹 이름'), '둘째 입력중');
  pending.resolve({ ok: true, value: group('a', '첫째', 'custom') });
  await screen.findByLabelText('첫째 (3명)');
  expect(screen.getByRole('dialog', { name: '새 그룹 만들기' })).toBeTruthy();
  expect((screen.getByLabelText('그룹 이름') as HTMLInputElement).value).toBe('둘째 입력중');
});

it('retrying a failed group list brings the groups back', async () => {
  function Retrying() {
    const [status, setStatus] = useState<'error' | 'ready'>('error');
    return <Harness groups={{ status, entries: status === 'ready' ? [group('t1', '포토팀', 'org-team')] : [], retry: () => setStatus('ready') }} />;
  }
  render(<Retrying />);
  await userEvent.click(screen.getByRole('button', { name: '다시 시도' }));
  expect(screen.queryByText('그룹을 불러오지 못했습니다.', { exact: false })).toBeNull();
  expect(screen.getByText('포토팀')).toBeTruthy();
});

it('keeps a created group once the editor is cancelled and the picker is reopened, without sharing anything', async () => {
  const user = userEvent.setup();
  const onConfirm = vi.fn();
  render(<StoreHarness onConfirm={onConfirm} />);
  await user.click(screen.getByRole('button', { name: '열기' }));
  await user.click(screen.getByRole('radio', { name: '그룹' }));
  await user.click(screen.getByRole('button', { name: '새 그룹 만들기' }));
  await user.type(screen.getByLabelText('그룹 이름'), '야간조');
  await user.click(screen.getByRole('button', { name: '그룹 만들기' }));
  await screen.findByLabelText('야간조 (3명)');
  await user.click(screen.getByRole('button', { name: '취소' }));
  await user.click(screen.getByRole('button', { name: '열기' }));
  await user.click(screen.getByRole('radio', { name: '그룹' }));
  expect(screen.getByLabelText('야간조 (3명)')).toBeTruthy();
  expect(onConfirm).not.toHaveBeenCalled();
});

it.each([
  ['people list', { mode: 'people', people: [kim1], groupIds: ['t1', 'c1'] } as ShareTargetDraft, '사람 목록을 그룹으로 저장'],
  ['new group', { mode: 'groups', people: [], groupIds: ['t1', 'c1'] } as ShareTargetDraft, '새 그룹 만들기'],
] as const)('adds a group made from the %s to several earlier choices and shares only on the final save', async (_name, value, entry) => {
  const user = userEvent.setup();
  const onConfirm = vi.fn();
  render(<Harness value={value} onConfirm={onConfirm} />);
  await user.click(screen.getByRole('button', { name: entry }));
  await user.type(screen.getByLabelText('그룹 이름'), '야간조');
  await user.click(screen.getByRole('button', { name: '그룹 만들기' }));
  await waitFor(() => expect(screen.getByRole('status', { name: '선택 요약' }).textContent).toBe('그룹 3개 선택: 포토팀, 내 교대조, 야간조'));
  expect(onConfirm).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: '공유 대상 저장' }));
  expect(onConfirm.mock.calls[0]?.[0]).toMatchObject({ mode: 'groups', groupIds: ['t1', 'c1', 'new'] });
});

it.each([
  ['loading', '그룹을 불러오는 중…'],
  ['error', '그룹을 불러오지 못했습니다.'],
] as const)('shows a created group while the group list is %s', async (status, text) => {
  const user = userEvent.setup();
  render(<Harness groups={{ status, entries: [], retry: () => {} }} />);
  await user.click(screen.getByRole('button', { name: '새 그룹 만들기' }));
  await user.type(screen.getByLabelText('그룹 이름'), '야간조');
  await user.click(screen.getByRole('button', { name: '그룹 만들기' }));
  const box = await screen.findByLabelText('야간조 (3명)');
  expect(box.getAttribute('aria-checked')).toBe('true');
  expect(screen.getByRole('status', { name: '선택 요약' }).textContent).toBe('그룹 1개 선택: 야간조');
  expect(screen.getByText(text, { exact: false })).toBeTruthy();
});

it('shows a group saved from a people list while the group list failed to load', async () => {
  const user = userEvent.setup();
  render(<Harness value={{ mode: 'people', people: [kim1], groupIds: [] }} groups={{ status: 'error', entries: [], retry: () => {} }} />);
  await user.click(screen.getByRole('button', { name: '사람 목록을 그룹으로 저장' }));
  await user.type(screen.getByLabelText('그룹 이름'), '야간조');
  await user.click(screen.getByRole('button', { name: '그룹 만들기' }));
  expect((await screen.findByLabelText('야간조 (3명)')).getAttribute('aria-checked')).toBe('true');
  expect(screen.getByText('그룹을 불러오지 못했습니다.', { exact: false })).toBeTruthy();
});

it('people search shows loading, then a failure that can be retried', async () => {
  const user = userEvent.setup();
  const first = deferred<GroupMember[]>();
  let calls = 0;
  render(<Harness value={{ mode: 'people', people: [], groupIds: [] }} searchPeople={() => (++calls === 1 ? first.promise : Promise.resolve([kim1]))} />);
  await user.type(screen.getByLabelText('사람 검색'), '김');
  expect(await screen.findByText('검색 중…')).toBeTruthy();
  first.reject(new Error('down'));
  expect((await screen.findByRole('alert')).textContent).toContain('검색하지 못했습니다');
  await user.click(screen.getByRole('button', { name: '다시 시도' }));
  expect(await screen.findByLabelText('김민수 (포토 1공정)')).toBeTruthy();
  expect(screen.queryByRole('alert')).toBeNull();
});

it('people search ignores a late answer to an older query', async () => {
  const user = userEvent.setup();
  const older = deferred<GroupMember[]>();
  const newer = deferred<GroupMember[]>();
  render(<Harness value={{ mode: 'people', people: [], groupIds: [] }} searchPeople={query => (query === '김' ? older.promise : newer.promise)} />);
  await user.type(screen.getByLabelText('사람 검색'), '김');
  await user.type(screen.getByLabelText('사람 검색'), '민');
  newer.resolve([kim2]);
  expect(await screen.findByLabelText('김민수 (식각 2공정)')).toBeTruthy();
  older.resolve([kim1]);
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(screen.queryByLabelText('김민수 (포토 1공정)')).toBeNull();
});

it('stays open with the choice when an async confirm answers false, and closes when it answers true', async () => {
  const user = userEvent.setup();
  let answer = false;
  render(<Harness value={{ mode: 'people', people: [kim1], groupIds: [] }} confirmError="공유하지 못했습니다." onConfirm={async () => answer} />);
  await user.click(screen.getByRole('button', { name: '공유 대상 저장' }));
  await waitFor(() => expect(screen.getByRole('button', { name: '공유 대상 저장' })).toBeEnabled());
  expect(screen.getByRole('dialog', { name: '공유 대상' })).toBeTruthy();
  expect(screen.getByRole('alert')).toHaveTextContent('공유하지 못했습니다.');
  answer = true;
  await user.click(screen.getByRole('button', { name: '공유 대상 저장' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: '공유 대상' })).toBeNull());
});
