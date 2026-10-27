import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import type { GroupMember, ViewGroupEntry } from '@ap/contracts';
import { GroupEditor, type GroupEditorProps } from './GroupEditor';

afterEach(cleanup);

const kim1: GroupMember = { userId: 'u1', displayName: '김민수', affiliation: '포토 1공정' };
const kim2: GroupMember = { userId: 'u2', displayName: '김민수', affiliation: '식각 2공정' };
const me: GroupMember = { userId: 'me', displayName: '나', affiliation: '포토 1공정' };
const entryOf = (name: string, members: GroupMember[], kind: 'custom' | 'org-team' = 'custom'): ViewGroupEntry => ({
  group: { id: 'g1', kind, name, memberCount: members.length, managerIds: ['me'] },
  members,
  capabilities: { canView: true, canEditMembers: kind === 'custom', canRename: kind === 'custom', canDelete: kind === 'custom' },
});

function Harness(extra: Partial<GroupEditorProps>) {
  const [open, setOpen] = useState(true);
  return <GroupEditor open={open} onOpenChange={setOpen} currentUserId="me" searchPeople={async () => [kim1, kim2]}
    onCreate={async input => ({ ok: true, value: entryOf(input.name, []) })} onUpdate={async (_id, patch) => ({ ok: true, value: entryOf(patch.name ?? 'x', []) })} onDone={() => {}} {...extra} />;
}

it('starts a new group with no members chosen and tells manager apart from member', () => {
  render(<Harness />);
  expect(screen.getByText('아직 고른 멤버가 없습니다.')).toBeTruthy();
  expect(screen.getByTestId('group-role').textContent).toContain('관리 권한: 있음');
  expect(screen.getByTestId('group-role').textContent).toContain('멤버: 포함 안 됨');
});

it('shows affiliation for same-named people and gives chip remove buttons a name and a 24px+ target', async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.type(screen.getByLabelText('멤버 검색'), '김');
  expect(await screen.findByLabelText('김민수 (포토 1공정)')).toBeTruthy();
  expect(screen.getByLabelText('김민수 (식각 2공정)')).toBeTruthy();
  await user.click(screen.getByLabelText('김민수 (포토 1공정)'));
  const remove = screen.getByRole('button', { name: '김민수 (포토 1공정) 제거' });
  expect(remove.className).toMatch(/\bw-7\b/);
  expect(remove.className).toMatch(/\bh-7\b/);
});

it('creates with only the explicitly chosen members and reports it as created', async () => {
  const user = userEvent.setup();
  const onCreate = vi.fn(async (input: { name: string; memberIds: string[] }) => ({ ok: true as const, value: entryOf(input.name, [kim1]) }));
  const onDone = vi.fn();
  render(<Harness onCreate={onCreate} onDone={onDone} />);
  await user.type(screen.getByLabelText('그룹 이름'), '교대조');
  await user.type(screen.getByLabelText('멤버 검색'), '김');
  await user.click(await screen.findByLabelText('김민수 (포토 1공정)'));
  await user.click(screen.getByRole('button', { name: '그룹 만들기' }));
  await waitFor(() => expect(onDone).toHaveBeenCalled());
  expect(onCreate).toHaveBeenCalledWith({ name: '교대조', memberIds: ['u1'] });
  expect(onDone.mock.calls[0]?.[1]).toBe('created');
});

it('keeps the typed name and members when the save fails', async () => {
  const user = userEvent.setup();
  render(<Harness initialMembers={[kim1]} onCreate={async () => ({ ok: false, reason: 'unavailable' })} />);
  await user.type(screen.getByLabelText('그룹 이름'), '교대조');
  await user.click(screen.getByRole('button', { name: '그룹 만들기' }));
  expect((await screen.findByRole('alert')).textContent).toContain('저장하지 못했습니다');
  expect((screen.getByLabelText('그룹 이름') as HTMLInputElement).value).toBe('교대조');
  expect(screen.getByText('김민수 (포토 1공정)')).toBeTruthy();
});

it('edits an existing group by sending only the rename and the member diff', async () => {
  const user = userEvent.setup();
  const onUpdate = vi.fn(async (_id: string, _patch: object) => ({ ok: true as const, value: entryOf('새 이름', [kim2]) }));
  render(<Harness entry={entryOf('교대조', [kim1])} onUpdate={onUpdate} />);
  const name = screen.getByLabelText('그룹 이름');
  await user.clear(name);
  await user.type(name, '새 이름');
  await user.click(screen.getByRole('button', { name: '김민수 (포토 1공정) 제거' }));
  await user.type(screen.getByLabelText('멤버 검색'), '김');
  await user.click(await screen.findByLabelText('김민수 (식각 2공정)'));
  await user.click(screen.getByRole('button', { name: '변경 저장' }));
  await waitFor(() => expect(onUpdate).toHaveBeenCalled());
  expect(onUpdate.mock.calls[0]).toEqual(['g1', { name: '새 이름', addMembers: ['u2'], removeMembers: ['u1'] }]);
});

it('does not let anyone edit the members of an org team', () => {
  render(<Harness entry={entryOf('포토팀', [kim1], 'org-team')} />);
  expect(screen.getByText('조직 팀은 멤버를 편집할 수 없습니다.')).toBeTruthy();
  expect(screen.queryByLabelText('멤버 검색')).toBeNull();
  expect(screen.queryByRole('button', { name: /제거$/ })).toBeNull();
});

// ---- FIX1 regression test (C3) ----
it('treats a rejected save as a failure: shows it, keeps the input and lets the save be retried', async () => {
  const user = userEvent.setup();
  let calls = 0;
  const onCreate = vi.fn(async (input: { name: string; memberIds: string[] }) => { if (++calls === 1) throw new Error('network'); return { ok: true as const, value: entryOf(input.name, []) }; });
  const onDone = vi.fn();
  render(<Harness onCreate={onCreate} onDone={onDone} />);
  await user.type(screen.getByLabelText('그룹 이름'), '교대조');
  await user.click(screen.getByRole('button', { name: '그룹 만들기' }));
  expect((await screen.findByRole('alert')).textContent).toContain('저장하지 못했습니다');
  expect((screen.getByLabelText('그룹 이름') as HTMLInputElement).value).toBe('교대조');
  const save = screen.getByRole('button', { name: '그룹 만들기' }) as HTMLButtonElement;
  expect(save.disabled).toBe(false);
  await user.click(save);
  await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
});
