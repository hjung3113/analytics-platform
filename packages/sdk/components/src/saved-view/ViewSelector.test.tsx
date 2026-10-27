import { useRef, useState } from 'react';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@ap/kernel';
import type { SavedView, SavedViewEntry, SavedViewListItem, ViewCapabilities } from '@ap/contracts';
import { ViewSelector, type ViewSelectorProps } from './ViewSelector';
import { SaveViewDialog } from './SaveViewDialog';

afterEach(cleanup);

const caps = (over: Partial<ViewCapabilities> = {}): ViewCapabilities => ({ canView: true, canCopy: true, canEdit: true, canShare: true, canApprove: false, canRevoke: false, ...over });
const entry = (id: string, name: string, over: Partial<SavedView> = {}, c: Partial<ViewCapabilities> = {}): SavedViewEntry => ({
  view: { id, schemaVersion: 1, kind: 'condition-set', name, ownerId: 'me', version: 1, updatedAt: 0, context: { relativePeriod: { hours: 24 }, roomNames: ['a'] }, visibility: { kind: 'private' }, approval: 'none', ...over } as SavedView,
  capabilities: caps(c),
});
const VIEWS: SavedViewListItem[] = [
  entry('a', 'Alpha'),
  entry('b', 'Beta shared', { ownerId: 'other', visibility: { kind: 'groups', groupIds: ['g1', 'g2'] } }, { canEdit: false, reason: '소유자만 수정할 수 있습니다' }),
  entry('c', 'Gamma lead', { ownerId: 'other', visibility: { kind: 'official' }, approval: 'approved' }, { canEdit: false }),
];

function Harness(over: Partial<ViewSelectorProps> = {}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ViewSelectorProps['filter']>('all');
  return <I18nProvider><ViewSelector views={VIEWS} currentId="a" defaultId="c" state="clean" userId="me" groups={[{ id: 'g1', name: 'Team One' }, { id: 'g2', name: 'Team Two' }]} query={query} onQuery={setQuery} filter={filter} onFilter={setFilter} onSelect={vi.fn()} {...over} /></I18nProvider>;
}
const row = (n: string) => ({ name: new RegExp(`^${n}(?! 동작)`) });
const open = async (user = userEvent.setup()) => { await user.click(screen.getByRole('button', { name: /저장된 뷰/ })); return user; };

describe('ViewSelector', () => {
  it('marks the current view and my default separately', async () => {
    render(<Harness />);
    await open();
    const alpha = screen.getByRole('button', row('Alpha'));
    const gamma = screen.getByRole('button', row('Gamma lead'));
    expect(alpha).toHaveAttribute('aria-current', 'true');
    expect(alpha).not.toHaveTextContent('내 기본');
    expect(gamma).not.toHaveAttribute('aria-current');
    expect(gamma).toHaveTextContent('내 기본');
  });

  it.each([
    ['search miss', { query: 'zzz' }, '조건에 맞는 뷰가 없습니다.', 'status'],
    ['empty list', { views: [] }, '저장된 뷰가 없습니다', 'status'],
    ['loading', { loading: true }, '뷰 목록을 불러오는 중', 'status'],
    ['failure', { error: true }, '뷰 목록을 불러오지 못했습니다.', 'alert'],
  ] as const)('shows the %s state', async (_n, over, text, role) => {
    render(<Harness {...(over as Partial<ViewSelectorProps>)} />);
    await open();
    expect(screen.getByRole(role)).toHaveTextContent(text);
  });

  it('filters by name and by group, and the group filter is named by the group', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await open(user);
    await user.type(screen.getByRole('searchbox', { name: '뷰 이름 검색' }), 'beta');
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    await user.clear(screen.getByRole('searchbox'));
    await user.click(screen.getByRole('button', { name: 'Team Two' }));
    expect(screen.getByRole('button', { name: 'Team Two' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', row('Beta shared'))).toBeVisible();
    expect(screen.queryByRole('button', row('Alpha'))).toBeNull();
  });

  it('separates save actions and allows a new view before any edit', async () => {
    const user = userEvent.setup();
    const onSaveAs = vi.fn();
    render(<Harness onSaveAs={onSaveAs} />);
    await user.click(screen.getByRole('button', { name: '저장' }));
    expect(screen.getByRole('menuitem', { name: '현재 뷰에 저장' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryByRole('menuitem', { name: '저장본으로 되돌리기' })).toBeNull();
    await user.click(screen.getByRole('menuitem', { name: '새 뷰로 저장' }));
    expect(onSaveAs).toHaveBeenCalledTimes(1);
  });

  it('offers save, new and revert when the view is modified', async () => {
    const user = userEvent.setup();
    render(<Harness state="modified" />);
    await user.click(screen.getByRole('button', { name: '저장' }));
    expect(screen.getByRole('menuitem', { name: '현재 뷰에 저장' })).not.toHaveAttribute('aria-disabled');
    expect(screen.getByRole('menuitem', { name: '새 뷰로 저장' })).toBeVisible();
    expect(screen.getByRole('menuitem', { name: '저장본으로 되돌리기' })).toBeVisible();
  });

  it('for a view I cannot edit, only my-copy saving is offered and the reason is read', async () => {
    const user = userEvent.setup();
    render(<Harness currentId="b" state="modified" />);
    await user.click(screen.getByRole('button', { name: '저장' }));
    expect(screen.queryByRole('menuitem', { name: '현재 뷰에 저장' })).toBeNull();
    expect(screen.getByRole('menuitem', { name: '내 복사본으로 저장' })).toBeVisible();
    expect(screen.getByText('소유자만 수정할 수 있습니다')).toBeVisible();
  });

  it('asks save / discard / cancel before leaving modified changes', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn(); const onSave = vi.fn().mockResolvedValue(undefined);
    render(<Harness state="modified" onSelect={onSelect} onSave={onSave} />);
    await open(user);
    await user.click(screen.getByRole('button', row('Beta shared')));
    const dialog = screen.getByRole('dialog');
    expect(onSelect).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: '취소' }));
    expect(onSelect).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole('button', { name: /저장된 뷰/ })).toHaveFocus());
    await open(user);
    await user.click(screen.getByRole('button', row('Beta shared')));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '버리고 이동' }));
    expect(onSelect).toHaveBeenCalledWith('b');
    expect(onSave).not.toHaveBeenCalled();
    await open(user);
    await user.click(screen.getByRole('button', row('Gamma lead')));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '저장하고 이동' }));
    await waitFor(() => expect(onSelect).toHaveBeenLastCalledWith('c'));
    expect(onSave).toHaveBeenCalled();
  });

  it('does not switch when the save before switching fails', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Harness state="modified" onSelect={onSelect} onSave={() => false} />);
    await open(user);
    await user.click(screen.getByRole('button', row('Beta shared')));
    await user.click(screen.getByRole('button', { name: '저장하고 이동' }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('walks search → rows by arrow keys, row and ⋯ are separate stops, Escape returns to the trigger', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    await open(user);
    const search = screen.getByRole('searchbox');
    search.focus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('button', row('Alpha'))).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('button', row('Beta shared'))).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Beta shared 동작' })).toHaveFocus();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('searchbox')).toBeNull());
    expect(screen.getByRole('button', { name: /저장된 뷰/ })).toHaveFocus();
  });

  it('Escape in the row menu closes only the menu', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await open(user);
    await user.click(screen.getByRole('button', { name: 'Alpha 동작' }));
    expect(screen.getByRole('menu')).toBeVisible();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(screen.getByRole('searchbox')).toBeVisible();
  });

  it('details show the full name and every group, and return focus to the row menu', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await open(user);
    await user.click(screen.getByRole('button', { name: 'Beta shared 동작' }));
    await user.click(screen.getByRole('menuitem', { name: '자세히 보기' }));
    const region = screen.getByRole('region', { name: '자세히 보기' });
    expect(within(region).getByText('Team One, Team Two')).toBeVisible();
    expect(within(region).getByText('Beta shared')).toBeVisible();
    await waitFor(() => expect(within(region).getByRole('button', { name: '목록으로' })).toHaveFocus());
    await user.click(within(region).getByRole('button', { name: '목록으로' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Beta shared 동작' })).toHaveFocus());
  });

  it('keeps focus on a row after the focused view is removed', async () => {
    const user = userEvent.setup();
    function Removable() {
      const [views, setViews] = useState(VIEWS);
      return <I18nProvider><ViewSelector views={views} currentId="c" defaultId={null} state="clean" userId="me" query="" onQuery={vi.fn()} filter="all" onFilter={vi.fn()} onSelect={vi.fn()} onDelete={id => setViews(v => v.filter(x => x.denied || x.view.id !== id))} /></I18nProvider>;
    }
    render(<Removable />);
    await open(user);
    await user.click(screen.getByRole('button', { name: 'Alpha 동작' }));
    await user.click(screen.getByRole('menuitem', { name: '삭제' }));
    await waitFor(() => expect(screen.queryByRole('button', row('Alpha'))).toBeNull());
    await waitFor(() => expect(screen.getByRole('button', row('Beta shared'))).toHaveFocus());
  });

  it('shows only the actions a view allows', async () => {
    const user = userEvent.setup();
    render(<Harness onMakeDefault={vi.fn()} onDelete={vi.fn()} />);
    await open(user);
    await user.click(screen.getByRole('button', { name: 'Beta shared 동작' }));
    expect(screen.queryByRole('menuitem', { name: '삭제' })).toBeNull();
    expect(screen.getByRole('menuitem', { name: '내 기본으로 지정' })).toBeVisible();
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Gamma lead 동작' }));
    expect(screen.getByRole('menuitem', { name: '내 기본 해제' })).toBeVisible();
  });

  it('uses user wording: no enum values or design labels, group audience, panel count and room as 공정', async () => {
    const user = userEvent.setup();
    const panelCount = (v: SavedView) => (v.id === 'a' ? 3 : 0);
    const { container } = render(<Harness panelCount={panelCount} />);
    await open(user);
    const text = document.body.textContent ?? '';
    for (const bad of ['condition-set', 'menu-view', 'private', 'official', 'pending', 'approved', 'groups']) expect(text).not.toContain(bad);
    expect(screen.getByText('Team One 외 1')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Alpha 동작' }));
    await user.click(screen.getByRole('menuitem', { name: '자세히 보기' }));
    expect(screen.getByText('패널 조건 3')).toBeVisible();
    expect(screen.getByText(/최근 24h \(상대 기간\) · 공정 1/)).toBeVisible();
    expect(container).toBeTruthy();
  });

  it('a denied view shows only the reason', async () => {
    render(<Harness views={[{ id: 'x', denied: true, reason: '권한 없음' }, ...VIEWS]} />);
    await open();
    expect(screen.getByText(/볼 수 없는 뷰 — 권한 없음/)).toBeVisible();
  });
});

describe('ViewSelector list marks (UX-2, UX-5, UX-6)', () => {
  it('marks a stale view in the list before it is picked, with text', async () => {
    render(<Harness staleIds={new Set(['b'])} />);
    await open();
    expect(screen.getByRole('button', row('Beta shared'))).toHaveTextContent('낡음');
    expect(screen.getByRole('button', row('Alpha'))).not.toHaveTextContent('낡음');
  });

  it('names the owner on rows other people own, and by name in the details', async () => {
    const user = userEvent.setup();
    render(<Harness ownerLabel={id => (id === 'other' ? '한지우' : id)} />);
    await open(user);
    expect(screen.getByRole('button', row('Beta shared'))).toHaveTextContent('한지우');
    expect(screen.getByRole('button', row('Alpha'))).not.toHaveTextContent('한지우');
    await user.click(screen.getByRole('button', { name: 'Beta shared 동작' }));
    await user.click(screen.getByRole('menuitem', { name: '자세히 보기' }));
    expect(screen.getByRole('region', { name: '자세히 보기' })).toHaveTextContent('한지우');
  });

  it('says unsaved conditions once, in the label, not again as a badge', () => {
    render(<Harness currentId={null} state="unsaved" />);
    const trigger = screen.getByRole('button', { name: /저장된 뷰/ });
    expect(trigger).toHaveTextContent('저장하지 않은 조건');
    expect(trigger).not.toHaveTextContent('저장 안 됨');
  });
});

describe('ViewSelector fix round', () => {
  const switchTo = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
    await open(user);
    await user.click(screen.getByRole('button', row(name)));
  };

  it.each([
    ['unapplied', { state: 'unapplied' }],
    ['unsaved conditions', { state: 'unsaved', currentId: null }],
    ['clean shown but changes would be lost', { state: 'clean', discardsChanges: true }],
  ] as const)('asks before leaving %s and switches only after discard', async (_n, over) => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Harness {...(over as Partial<ViewSelectorProps>)} onSelect={onSelect} />);
    await switchTo(user, 'Beta shared');
    expect(onSelect).not.toHaveBeenCalled();
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '버리고 이동' }));
    expect(onSelect).toHaveBeenCalledWith('b');
  });

  it('switches without asking when nothing would be lost', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    await switchTo(user, 'Beta shared');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onSelect).toHaveBeenCalledWith('b');
  });

  it.each([
    ['saves to the view I can edit', 'a', '저장하고 이동'],
    ['saves my copy when I can only copy', 'b', '내 복사본으로 저장하고 이동'],
    ['saves a new view when no view is current', null, '새 뷰로 저장하고 이동'],
  ] as const)('the switch confirmation %s', async (_n, currentId, label) => {
    const user = userEvent.setup();
    const onSelect = vi.fn(); const onSave = vi.fn().mockResolvedValue(undefined); const onSaveAs = vi.fn().mockResolvedValue(true);
    render(<Harness currentId={currentId} state={currentId ? 'modified' : 'unsaved'} onSelect={onSelect} onSave={onSave} onSaveAs={onSaveAs} />);
    await switchTo(user, 'Gamma lead');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: label }));
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith('c'));
    expect(onSave).toHaveBeenCalledTimes(currentId === 'a' ? 1 : 0);
    expect(onSaveAs).toHaveBeenCalledTimes(currentId === 'a' ? 0 : 1);
  });

  it('does not switch when saving my copy is cancelled, and a view I cannot save offers only discard', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const { unmount } = render(<Harness currentId="b" state="modified" onSelect={onSelect} onSaveAs={() => Promise.resolve(false)} />);
    await switchTo(user, 'Gamma lead');
    await user.click(screen.getByRole('button', { name: '내 복사본으로 저장하고 이동' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /저장된 뷰/ })).toHaveFocus());
    expect(onSelect).not.toHaveBeenCalled();
    unmount();
    const none = [entry('a', 'Alpha', {}, { canEdit: false, canCopy: false }), entry('c', 'Gamma lead')];
    render(<Harness views={none} currentId="a" state="modified" onSaveAs={vi.fn()} />);
    await switchTo(user, 'Gamma lead');
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: '버리고 이동' })).toBeVisible();
    expect(within(dialog).queryByRole('button', { name: /저장하고 이동/ })).toBeNull();
  });

  it.each([
    [true, true, ['현재 뷰에 저장', '새 뷰로 저장']],
    [true, false, ['현재 뷰에 저장']],
    [false, true, ['내 복사본으로 저장']],
    [false, false, []],
  ] as const)('canEdit=%s canCopy=%s shows only %j', async (canEdit, canCopy, shown) => {
    const user = userEvent.setup();
    const onSaveAs = vi.fn();
    render(<Harness views={[entry('a', 'Alpha', {}, { canEdit, canCopy })]} state="modified" onSaveAs={onSaveAs} />);
    await user.click(screen.getByRole('button', { name: '저장' }));
    const labels = ['현재 뷰에 저장', '새 뷰로 저장', '내 복사본으로 저장'];
    for (const l of labels) {
      if (shown.includes(l as never)) expect(screen.getByRole('menuitem', { name: l })).toBeVisible();
      else expect(screen.queryByRole('menuitem', { name: l })).toBeNull();
    }
  });

  it('after a delayed delete that follows a parent re-render, focus lands on the next row', async () => {
    const user = userEvent.setup();
    let finish: () => void = () => {};
    function Delayed() {
      const [views, setViews] = useState(VIEWS);
      const [, setBusy] = useState(false);
      return <I18nProvider><ViewSelector views={views} currentId="c" defaultId={null} state="clean" userId="me" query="" onQuery={vi.fn()} filter="all" onFilter={vi.fn()} onSelect={vi.fn()} onDelete={id => { setBusy(true); finish = () => setViews(v => v.filter(x => x.denied || x.view.id !== id)); }} /></I18nProvider>;
    }
    render(<Delayed />);
    await open(user);
    await user.click(screen.getByRole('button', { name: 'Alpha 동작' }));
    await user.click(screen.getByRole('menuitem', { name: '삭제' }));
    act(() => finish());
    await waitFor(() => expect(screen.queryByRole('button', row('Alpha'))).toBeNull());
    await waitFor(() => expect(screen.getByRole('button', row('Beta shared'))).toHaveFocus());
  });

  it('when a filter update removes the focused row, focus moves to a remaining row, and to search when none remain', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Harness />);
    await open(user);
    act(() => screen.getByRole('button', row('Alpha')).focus());
    rerender(<Harness query="beta" />);
    await waitFor(() => expect(screen.getByRole('button', row('Beta shared'))).toHaveFocus());
    rerender(<Harness query="beta" views={[entry('a', 'Alpha')]} />);
    await waitFor(() => expect(screen.getByRole('searchbox')).toHaveFocus());
  });

  it('does not take focus from the search box when a row disappears', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Harness />);
    await open(user);
    act(() => screen.getByRole('button', row('Alpha')).focus());
    act(() => screen.getByRole('searchbox').focus());
    rerender(<Harness views={VIEWS.slice(1)} />);
    expect(screen.getByRole('searchbox')).toHaveFocus();
  });

  it('opens with the search box focused and Enter / Space run row and ⋯ actions', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn(); const onMakeDefault = vi.fn();
    render(<Harness onSelect={onSelect} onMakeDefault={onMakeDefault} />);
    await open(user);
    await waitFor(() => expect(screen.getByRole('searchbox')).toHaveFocus());
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(onSelect).toHaveBeenCalledWith('b');
    await open(user);
    act(() => screen.getByRole('button', { name: 'Beta shared 동작' }).focus());
    await user.keyboard(' ');
    await user.keyboard('{Enter}');
    expect(screen.getByRole('region', { name: '자세히 보기' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: '목록으로' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Beta shared 동작' })).toHaveFocus());
    await user.keyboard('{Enter}');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onMakeDefault).toHaveBeenCalledWith('b');
  });

  it('retry leaves the failure, shows loading, then the list', async () => {
    const user = userEvent.setup();
    function Retry() {
      const [phase, setPhase] = useState<'error' | 'loading' | 'ready'>('error');
      return <I18nProvider><ViewSelector views={phase === 'ready' ? VIEWS : []} currentId={null} defaultId={null} state="clean" userId="me" query="" onQuery={vi.fn()} filter="all" onFilter={vi.fn()} onSelect={vi.fn()} error={phase === 'error'} loading={phase === 'loading'} onRetry={() => { setPhase('loading'); setTimeout(() => setPhase('ready'), 0); }} /></I18nProvider>;
    }
    render(<Retry />);
    await open(user);
    expect(screen.getByRole('alert')).toBeVisible();
    await user.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(screen.queryByRole('alert')).toBeNull();
    await waitFor(() => expect(screen.getByRole('button', row('Alpha'))).toBeVisible());
  });

  it('a long name and a 7-day relative or fixed period are read in full from the keyboard details', async () => {
    const user = userEvent.setup();
    const long = 'L'.repeat(120);
    const views = [entry('l', long, { context: { relativePeriod: { hours: 168 } } }), entry('f', 'Fixed', { context: { from: '2026-09-19T09:00:00', to: '2026-09-26T09:00:00' } })];
    render(<Harness views={views} currentId="l" />);
    await open(user);
    act(() => screen.getByRole('button', { name: `${long} 동작` }).focus());
    await user.keyboard('{Enter}{Enter}');
    const region = screen.getByRole('region', { name: '자세히 보기' });
    expect(within(region).getAllByText(long).length).toBeGreaterThan(0);
    expect(region).toHaveTextContent('최근 7일 (상대 기간)');
    await user.click(within(region).getByRole('button', { name: '목록으로' }));
    await waitFor(() => expect(screen.getByRole('button', { name: `${long} 동작` })).toHaveFocus());
    await user.keyboard('{Tab}{Tab}{Enter}{Enter}');
    expect(screen.getByRole('region', { name: '자세히 보기' })).toHaveTextContent(/고정 기간 .*\(7일\)/);
  });

  it('save-as opens the parent surface with the applied conditions and focus returns to the save button', async () => {
    const user = userEvent.setup();
    function Parent() {
      const [dialog, setDialog] = useState(false);
      const saveTrigger = useRef<HTMLButtonElement>(null);
      return <I18nProvider>
        <ViewSelector views={VIEWS} currentId="a" defaultId={null} state="modified" userId="me" query="" onQuery={vi.fn()} filter="all" onFilter={vi.fn()} onSelect={vi.fn()} saveTriggerRef={saveTrigger} onSaveAs={() => setDialog(true)} />
        <SaveViewDialog open={dialog} onOpenChange={setDialog} units={['condition-set']} context={{ relativePeriod: { hours: 24 } }} returnFocusRef={saveTrigger} onSubmit={vi.fn().mockResolvedValue({ ok: true, value: null })} />
      </I18nProvider>;
    }
    render(<Parent />);
    await user.click(screen.getByRole('button', { name: '저장' }));
    await user.click(screen.getByRole('menuitem', { name: '새 뷰로 저장' }));
    expect(await screen.findByText(/최근 24h \(상대 기간\)/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: '취소' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '저장' })).toHaveFocus());
  });
});
