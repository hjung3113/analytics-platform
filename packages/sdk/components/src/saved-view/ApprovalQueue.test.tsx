import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SavedViewEntry, SavedViewListItem, ViewApproval, ViewCapabilities } from '@ap/contracts';
import { I18nProvider } from '@ap/kernel';
import { ApprovalQueue, type ApprovalQueueProps } from './ApprovalQueue';
import type { ApprovalRequestInfo, ViewDiagnosis } from './viewInfo';

afterEach(cleanup);

const NONE: ViewCapabilities = { canView: true, canCopy: true, canEdit: false, canShare: false, canApprove: false, canRevoke: false };
const entry = (id: string, approval: ViewApproval, caps: Partial<ViewCapabilities> = {}, over: { name?: string; ownerId?: string; version?: number } = {}): SavedViewEntry => ({
  view: {
    id, schemaVersion: 1, kind: 'condition-set', name: over.name ?? `뷰 ${id}`, ownerId: over.ownerId ?? 'owner', version: over.version ?? 3, updatedAt: Date.UTC(2026, 9, 20, 3, 0),
    context: { relativePeriod: { hours: 24 }, selection: ['a', 'b'] }, visibility: { kind: 'private' }, approval, ...(approval === 'rejected' ? { approvalNote: '기간이 너무 넓습니다' } : {}),
  },
  capabilities: { ...NONE, ...caps },
});
const request = (by = 'req', over: Partial<ApprovalRequestInfo> = {}): ApprovalRequestInfo => ({ requestedBy: by, requestedAt: Date.UTC(2026, 9, 21, 1, 0), targetVersion: 4, changes: ['기간 24시간 → 72시간'], ...over });

const mount = (props: Partial<ApprovalQueueProps> & { items: readonly SavedViewListItem[] }) =>
  render(<I18nProvider><ApprovalQueue currentUserId="approver" {...props} /></I18nProvider>);
const rowNames = () => within(screen.getByRole('list', { name: '승인 요청 목록' })).getAllByRole('button').map(b => b.textContent ?? '');

describe('who sees which requests', () => {
  const items = (approver: boolean) => [
    entry('mine', 'pending', {}, { ownerId: 'req' }),
    entry('theirs', 'pending', { canApprove: approver }, { ownerId: 'other' }),
    entry('foreign', 'pending', {}, { ownerId: 'other' }),
    entry('plain', 'none'),
  ];
  const requests = { mine: request('req'), theirs: request('other'), foreign: request('other') };
  it.each([
    ['신청자', 'req', false, ['뷰 mine']],
    ['승인자', 'approver', true, ['뷰 theirs']],
  ])('%s sees only %j', (_who, userId, approver, names) => {
    mount({ items: items(approver), requests, currentUserId: userId });
    expect(rowNames().map(text => names.some(name => text.startsWith(name)))).toEqual(names.map(() => true));
    expect(rowNames()).toHaveLength(names.length);
  });
  it('opens on the awaiting-approval filter and the others are one click away', async () => {
    mount({ items: [entry('p', 'pending', { canApprove: true }), entry('a', 'approved', { canRevoke: true })] });
    expect(screen.getByRole('radio', { name: '대기' })).toBeChecked();
    expect(rowNames()).toHaveLength(1);
    await userEvent.click(screen.getByRole('radio', { name: '승인됨' }));
    expect(rowNames()[0]).toContain('뷰 a');
  });
});

describe('detail', () => {
  it('shows owner, updated time, contents, target version, requester, changes and the rejection reason', async () => {
    mount({
      items: [entry('r', 'rejected', {}, { ownerId: 'approver', name: '반려된 뷰' })], requests: { r: request('approver') }, currentUserId: 'approver',
      personName: id => `이름:${id}`, formatTime: ms => `T${ms}`, defaultStatus: 'rejected',
    });
    await userEvent.click(screen.getByRole('button', { name: /반려된 뷰/ }));
    const region = screen.getByRole('region', { name: '반려된 뷰' });
    for (const text of ['소유자', '이름:approver', 'T' + Date.UTC(2026, 9, 20, 3, 0), '최근 24h (상대 기간)', '설비 2대 선택', '승인 대상 버전', 'v4', '신청자', '변경 내용', '기간 24시간 → 72시간', '반려 이유', '기간이 너무 넓습니다'])
      expect(within(region).getAllByText(text, { exact: false }).length).toBeGreaterThan(0);
  });
  it('explains a stale view and offers the preview-confirmed update, independent of any apply control', async () => {
    const onMigrate = vi.fn();
    const diagnosis: ViewDiagnosis = { status: 'stale', reasons: ['메뉴 화면 버전이 올라갔습니다'], migration: { preview: [{ key: 'page.sort', before: 'a', after: 'b' }] } };
    mount({ items: [entry('s', 'pending', { canApprove: true })], diagnoses: { s: diagnosis }, onMigrate });
    await userEvent.click(screen.getByRole('button', { name: /뷰 s/ }));
    const toggle = screen.getByRole('button', { name: '이유 보기' });
    toggle.focus();
    await userEvent.keyboard('{Enter}');
    expect(screen.getAllByText('메뉴 화면 버전이 올라갔습니다').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/page\.sort/).length).toBeGreaterThan(0);
    await userEvent.click(screen.getAllByRole('button', { name: '미리 본 내용으로 갱신' })[0]!);
    expect(onMigrate).toHaveBeenCalledWith('s');
  });
  it('without a migration it says the stored condition is kept and re-selection is needed', async () => {
    mount({ items: [entry('s', 'pending', { canApprove: true })], diagnoses: { s: { status: 'stale', reasons: ['지표 버전이 다릅니다'] } } });
    await userEvent.click(screen.getByRole('button', { name: /뷰 s/ }));
    expect(screen.getAllByText(/그대로 두었으니/).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: '미리 본 내용으로 갱신' })).toBeNull();
  });
});

describe('50 requests', () => {
  const many = Array.from({ length: 50 }, (_, i) => entry(`v${i}`, i % 5 === 0 ? 'approved' : 'pending', { canApprove: true, canRevoke: true }, { name: `요청 ${String(i).padStart(2, '0')}`, ownerId: i % 2 ? 'kim' : 'lee' }));
  it('searches, filters by status and keeps one scroll region', async () => {
    mount({ items: many });
    expect(rowNames()).toHaveLength(40);
    await userEvent.type(screen.getByRole('searchbox'), '요청 07');
    expect(rowNames()).toHaveLength(1);
    await userEvent.clear(screen.getByRole('searchbox'));
    await userEvent.type(screen.getByRole('searchbox'), 'lee');
    expect(rowNames().every(text => text.includes('lee'))).toBe(true);
    await userEvent.click(screen.getByRole('radio', { name: '모든 상태' }));
    await userEvent.clear(screen.getByRole('searchbox'));
    expect(rowNames()).toHaveLength(50);
    const list = screen.getByRole('list', { name: '승인 요청 목록' });
    expect(list.className).toContain('overflow-y-auto');
    list.scrollTop = 300;
    await userEvent.click(screen.getByRole('radio', { name: '승인됨' }));
    expect(rowNames()).toHaveLength(10);
  });
});

describe('50 requests: the scroll position survives', () => {
  const many = Array.from({ length: 50 }, (_, i) => entry(`v${i}`, 'pending', { canApprove: true }, { name: `요청 ${String(i).padStart(2, '0')}` }));
  it('keeps the list node and its scroll position while a lower row opens, closes and the list refreshes', async () => {
    const view = render(<I18nProvider><ApprovalQueue currentUserId="approver" items={many} /></I18nProvider>);
    const list = screen.getByRole('list', { name: '승인 요청 목록' });
    list.scrollTop = 300;
    await userEvent.click(screen.getByRole('button', { name: /요청 42/ }));
    expect(screen.getByRole('list', { name: '승인 요청 목록' })).toBe(list);
    expect(list.scrollTop).toBe(300);
    await userEvent.click(screen.getByRole('button', { name: '목록으로' }));
    view.rerender(<I18nProvider><ApprovalQueue currentUserId="approver" items={[...many]} /></I18nProvider>);
    expect(screen.getByRole('list', { name: '승인 요청 목록' })).toBe(list);
    expect(list.scrollTop).toBe(300);
    expect(rowNames()).toHaveLength(50);
    await waitFor(() => expect(screen.getByRole('button', { name: /요청 42/ })).toHaveFocus());
  });
});

describe('approve / reject / revoke', () => {
  it.each<[string, ViewApproval, Partial<ViewCapabilities>, string[]]>([
    ['approve+reject only on pending with canApprove', 'pending', { canApprove: true }, ['승인', '반려']],
    ['nothing on pending without canApprove', 'pending', {}, []],
    ['revoke only on approved with canRevoke', 'approved', { canRevoke: true }, ['승인 회수']],
    ['nothing on approved without canRevoke', 'approved', { canApprove: true }, []],
    ['nothing on rejected', 'rejected', { canApprove: true, canRevoke: true }, []],
  ])('%s', async (_name, approval, caps, buttons) => {
    mount({ items: [entry('x', approval, caps)], requests: { x: request('approver') }, defaultStatus: 'all', onDecide: vi.fn(), onRevoke: vi.fn() });
    await userEvent.click(screen.getByRole('button', { name: /뷰 x/ }));
    const region = screen.getByRole('region', { name: '뷰 x' });
    const actions = ['승인', '반려', '승인 회수'].filter(name => within(region).queryByRole('button', { name }));
    expect(actions).toEqual(buttons);
  });

  it('rejecting needs a reason and sends it with the version; success closes the detail and reports once', async () => {
    const onDecide = vi.fn().mockResolvedValue({ ok: true, value: null });
    const onDone = vi.fn();
    mount({ items: [entry('x', 'pending', { canApprove: true }, { version: 7 })], onDecide, onDone });
    await userEvent.click(screen.getByRole('button', { name: /뷰 x/ }));
    expect(screen.getByRole('button', { name: '반려' })).toBeDisabled();
    await userEvent.type(screen.getByRole('textbox', { name: /반려 이유/ }), '  범위 과다 ');
    await userEvent.click(screen.getByRole('button', { name: '반려' }));
    await waitFor(() => expect(screen.queryByRole('region', { name: '뷰 x' })).toBeNull());
    expect(onDecide).toHaveBeenCalledWith('x', 'reject', '범위 과다', 7);
    expect(onDone).toHaveBeenCalledWith('reject', '뷰 x');
  });

  it.each([['conflict', '다른 곳에서 먼저 바뀌었습니다'], ['forbidden', '저장할 권한이 없습니다'], ['unavailable', '지금은 저장할 수 없습니다'], ['invalid', '저장할 수 없는 내용입니다']] as const)('a %s failure keeps the typed reason and the detail, and never claims an audit', async (reason, text) => {
    const onDecide = vi.fn().mockResolvedValue({ ok: false, reason });
    const onDone = vi.fn();
    mount({ items: [entry('x', 'pending', { canApprove: true })], onDecide, onDone });
    await userEvent.click(screen.getByRole('button', { name: /뷰 x/ }));
    await userEvent.type(screen.getByRole('textbox', { name: /반려 이유/ }), '이유');
    await userEvent.click(screen.getByRole('button', { name: '반려' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(text);
    expect(screen.getByRole('textbox', { name: /반려 이유/ })).toHaveValue('이유');
    expect(screen.getByRole('button', { name: '승인' })).toBeEnabled();
    expect(onDone).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toMatch(/감사/);
  });

  it('a thrown call is an unavailable failure with the input kept', async () => {
    mount({ items: [entry('x', 'pending', { canApprove: true })], onDecide: vi.fn().mockRejectedValue(new Error('net')) });
    await userEvent.click(screen.getByRole('button', { name: /뷰 x/ }));
    await userEvent.type(screen.getByRole('textbox', { name: /반려 이유/ }), '이유');
    await userEvent.click(screen.getByRole('button', { name: '승인' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('지금은 저장할 수 없습니다');
    expect(screen.getByRole('textbox', { name: /반려 이유/ })).toHaveValue('이유');
  });

  it('a second click while the call runs does not send twice', async () => {
    let finish: (value: unknown) => void = () => {};
    const onDecide = vi.fn(() => new Promise(resolve => { finish = resolve; }));
    mount({ items: [entry('x', 'pending', { canApprove: true })], onDecide: onDecide as never });
    await userEvent.click(screen.getByRole('button', { name: /뷰 x/ }));
    const approve = screen.getByRole('button', { name: '승인' });
    fireEvent.click(approve);
    fireEvent.click(approve);
    expect(onDecide).toHaveBeenCalledTimes(1);
    finish({ ok: true, value: null });
  });

  it('after a decision removes the row, focus moves to a neighbouring row instead of the page', async () => {
    function Host() {
      const [items, setItems] = useState<SavedViewListItem[]>([entry('a', 'pending', { canApprove: true }), entry('b', 'pending', { canApprove: true }), entry('c', 'pending', { canApprove: true })]);
      return <ApprovalQueue items={items} currentUserId="approver" onDecide={async id => { setItems(list => list.filter(item => item.denied === true || item.view.id !== id)); return { ok: true, value: null }; }} />;
    }
    render(<I18nProvider><Host /></I18nProvider>);
    await userEvent.click(screen.getByRole('button', { name: /뷰 b/ }));
    await userEvent.click(screen.getByRole('button', { name: '승인' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: /뷰 b/ })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: /뷰 c/ })));
  });
});

describe('Escape', () => {
  it('closes the reason, then the detail, returning focus to the row each time', async () => {
    mount({ items: [entry('s', 'pending', { canApprove: true })], diagnoses: { s: { status: 'stale', reasons: ['낡았습니다'] } } });
    const row = screen.getByRole('button', { name: /뷰 s/ });
    await userEvent.click(row);
    const toggle = screen.getAllByRole('button', { name: '이유 보기' })[0]!;
    await userEvent.click(toggle);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('button', { name: '이유 닫기' })).toBeNull();
    expect(screen.getAllByRole('button', { name: '이유 보기' })[0]).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('region', { name: '뷰 s' })).toBeNull();
    await waitFor(() => expect(row).toHaveFocus());
  });
});

describe('no domain values in the SDK code', () => {
  it('has no MARS / PHOTO / organisation names in source', async () => {
    const { readFileSync } = await import('node:fs');
    for (const file of ['ApprovalQueue.tsx', 'ViewManagement.tsx', 'ViewParts.tsx', 'viewInfo.ts'])
      expect(readFileSync(`src/saved-view/${file}`, 'utf8')).not.toMatch(/MARS|PHOTO|org-three|HWTime/i);
  });
});
