import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SavedViewEntry, SavedViewListItem, ViewApproval, ViewCapabilities } from '@ap/contracts';
import { I18nProvider, diagnoseSavedView } from '@ap/kernel';
import { ViewManagement, type ViewManagementProps } from './ViewManagement';
import type { ViewDiagnosis } from './viewInfo';

afterEach(cleanup);

const CAPS: ViewCapabilities = { canView: true, canCopy: true, canEdit: false, canShare: false, canApprove: false, canRevoke: false };
const entry = (id: string, approval: ViewApproval, caps: Partial<ViewCapabilities> = {}, name = `뷰 ${id}`): SavedViewEntry => ({
  view: { id, schemaVersion: 1, kind: 'condition-set', name, ownerId: 'owner', version: 2, updatedAt: Date.UTC(2026, 9, 20), context: { from: '2026-10-01T00:00:00', to: '2026-10-07T00:00:00' }, visibility: { kind: 'private' }, approval },
  capabilities: { ...CAPS, ...caps },
});
const denied = { id: 'hidden', denied: true as const, reason: '이 Scope를 볼 권한이 없습니다' };

function Host(props: Partial<ViewManagementProps> & { entries: readonly SavedViewListItem[] }) {
  const [open, setOpen] = useState(false);
  return <I18nProvider>
    <ViewManagement open={open} onOpenChange={setOpen} currentUserId="approver" trigger={<button type="button">뷰 관리 열기</button>} {...props} />
  </I18nProvider>;
}
const open = async () => { const trigger = screen.getByRole('button', { name: '뷰 관리 열기' }); await userEvent.click(trigger); return trigger; };

describe('the request-opened surface', () => {
  it('is closed until asked and lists views with owner, time and status', async () => {
    render(<Host entries={[entry('a', 'approved')]} personName={id => `이름:${id}`} formatTime={ms => `T${ms}`} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    await open();
    const dialog = screen.getByRole('dialog', { name: '뷰 관리' });
    const row = within(dialog).getByRole('button', { name: /뷰 a/ });
    expect(row).toHaveTextContent('승인됨');
    expect(row).toHaveTextContent('이름:owner');
    expect(row).toHaveTextContent(`T${Date.UTC(2026, 9, 20)}`);
  });

  it('opens straight on the awaiting-approval filter when asked', async () => {
    render(<Host initialFilter="pending" entries={[entry('p', 'pending', { canApprove: true }), entry('a', 'approved')]} />);
    await open();
    expect(screen.getByRole('radio', { name: '승인 대기' })).toBeChecked();
    expect(screen.getByRole('list', { name: '승인 요청 목록' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /뷰 a/ })).toBeNull();
  });

  it('the awaiting-approval chip switches to the queue and back', async () => {
    render(<Host entries={[entry('p', 'pending', { canApprove: true })]} />);
    await open();
    await userEvent.click(screen.getByRole('radio', { name: '승인 대기' }));
    expect(screen.getByRole('list', { name: '승인 요청 목록' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: '전체' }));
    expect(screen.getByRole('list', { name: '저장한 뷰' })).toBeInTheDocument();
  });

  it('a decision reports plainly and does not claim an audit record', async () => {
    const onDecide = vi.fn().mockResolvedValue({ ok: true, value: null });
    render(<Host initialFilter="pending" entries={[entry('p', 'pending', { canApprove: true })]} onDecide={onDecide} />);
    await open();
    await userEvent.click(screen.getByRole('button', { name: /뷰 p/ }));
    await userEvent.click(screen.getByRole('button', { name: '승인' }));
    await waitFor(() => expect(screen.getByRole('dialog')).toHaveTextContent('뷰 p: 승인했습니다.'));
    expect(screen.getByRole('dialog').textContent).not.toMatch(/감사/);
  });
});

describe('stale and denied entries', () => {
  it('open their reason from the keyboard without any apply control; a denied entry shows no name', async () => {
    const diagnoses: Record<string, ViewDiagnosis> = { s: { status: 'stale', reasons: ['지표 버전이 올라갔습니다'] } };
    render(<Host entries={[entry('s', 'none'), denied]} diagnoses={diagnoses} />);
    await open();
    expect(screen.queryByText('hidden')).toBeNull();
    expect(screen.queryByRole('button', { name: /적용/ })).toBeNull();
    const toggles = screen.getAllByRole('button', { name: '이유 보기' });
    expect(toggles).toHaveLength(2);
    toggles[1]!.focus();
    await userEvent.keyboard('{Enter}');
    expect(screen.getByText('이 Scope를 볼 권한이 없습니다')).toBeInTheDocument();
    toggles[0]!.focus();
    await userEvent.keyboard(' ');
    expect(screen.getByText('지표 버전이 올라갔습니다')).toBeInTheDocument();
    expect(toggles[0]).toHaveAttribute('aria-expanded', 'true');
  });

  it('the attention filter keeps only stale and denied entries', async () => {
    render(<Host entries={[entry('ok', 'none'), entry('s', 'none'), denied]} diagnoses={{ s: { status: 'stale', reasons: ['낡음'] } }} />);
    await open();
    await userEvent.click(screen.getByRole('radio', { name: '낡음·권한 부족' }));
    const list = screen.getByRole('list', { name: '저장한 뷰' });
    expect(within(list).queryByRole('button', { name: /뷰 ok/ })).toBeNull();
    expect(within(list).getByRole('button', { name: /뷰 s/ })).toBeInTheDocument();
    expect(within(list).getAllByRole('button', { name: '이유 보기' })).toHaveLength(2);
  });
});

describe('Escape closes one step at a time and returns to the trigger', () => {
  it('reason → detail → dialog, focus back on the row and then the trigger', async () => {
    render(<Host entries={[entry('s', 'none')]} diagnoses={{ s: { status: 'stale', reasons: ['낡음'] } }} />);
    const trigger = await open();
    const row = screen.getByRole('button', { name: /뷰 s/ });
    await userEvent.click(row);
    await userEvent.click(screen.getAllByRole('button', { name: '이유 보기' })[0]!);
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '이유 닫기' })).toBeNull();
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '뷰 s' })).toBeNull();
    await waitFor(() => expect(row).toHaveFocus());
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(trigger).toHaveFocus();
  });

  it('in the queue a detail closes before the dialog does', async () => {
    render(<Host initialFilter="pending" entries={[entry('p', 'pending', { canApprove: true })]} />);
    const trigger = await open();
    await userEvent.click(screen.getByRole('button', { name: /뷰 p/ }));
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '뷰 p' })).toBeNull();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(trigger).toHaveFocus();
  });
});

describe('list of 50', () => {
  it('searches by name or owner', async () => {
    const many = Array.from({ length: 50 }, (_, i) => entry(`v${i}`, 'none', {}, `보고 ${String(i).padStart(2, '0')}`));
    render(<Host entries={many} />);
    await open();
    expect(within(screen.getByRole('list', { name: '저장한 뷰' })).getAllByRole('button')).toHaveLength(50);
    await userEvent.type(screen.getByRole('searchbox'), '보고 33');
    expect(within(screen.getByRole('list', { name: '저장한 뷰' })).getAllByRole('button')).toHaveLength(1);
  });
});

describe('review round: layers closed from anywhere in the surface', () => {
  it('Escape with focus outside the queue still closes the open detail first, then the dialog', async () => {
    render(<Host initialFilter="pending" entries={[entry('p', 'pending', { canApprove: true })]} />);
    const trigger = await open();
    await userEvent.click(screen.getByRole('button', { name: /뷰 p/ }));
    screen.getByRole('radio', { name: '승인 대기' }).focus();
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '뷰 p' })).toBeNull();
    await waitFor(() => expect(screen.getByRole('button', { name: /뷰 p/ })).toHaveFocus());
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(trigger).toHaveFocus();
  });

  it('Escape with focus outside the queue closes an open reason before the detail', async () => {
    render(<Host initialFilter="pending" entries={[entry('p', 'pending', { canApprove: true })]} diagnoses={{ p: { status: 'stale', reasons: ['낡음'] } }} />);
    await open();
    await userEvent.click(screen.getByRole('button', { name: /뷰 p/ }));
    await userEvent.click(screen.getAllByRole('button', { name: '이유 보기' })[0]!);
    screen.getByRole('radio', { name: '승인 대기' }).focus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('button', { name: '이유 닫기' })).toBeNull();
    expect(screen.getByRole('region', { name: '뷰 p' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('region', { name: '뷰 p' })).toBeNull();
  });
});

describe('review round: a list that changes under an open detail', () => {
  const stale = (id: string): ViewDiagnosis => ({ status: 'stale', reasons: ['낡음'], migration: { preview: [{ key: 'page.sort', before: 'a', after: 'b' }] } });
  function Refreshing() {
    const [open, setOpen] = useState(true);
    const [diagnoses, setDiagnoses] = useState<Record<string, ViewDiagnosis>>({ s1: stale('s1'), s2: stale('s2') });
    return <I18nProvider>
      <ViewManagement
        open={open} onOpenChange={setOpen} currentUserId="approver" initialFilter="attention" entries={[entry('s1', 'none'), entry('s2', 'none')]}
        diagnoses={diagnoses} onMigrate={id => setDiagnoses(current => ({ ...current, [id]: { status: 'ok', reasons: [] } }))} />
      {!open && <p>닫힘</p>}
    </I18nProvider>;
  }
  it('drops the vanished detail, moves focus to a remaining row, and one Escape then closes the dialog', async () => {
    render(<Refreshing />);
    await userEvent.click(screen.getByRole('button', { name: /뷰 s1/ }));
    await userEvent.click(screen.getAllByRole('button', { name: '미리 본 내용으로 갱신' })[0]!);
    await waitFor(() => expect(screen.queryByRole('button', { name: /뷰 s1/ })).toBeNull());
    expect(screen.queryByRole('region', { name: '뷰 s1' })).toBeNull();
    await waitFor(() => expect(screen.getByRole('button', { name: /뷰 s2/ })).toHaveFocus());
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.getByText('닫힘')).toBeInTheDocument());
  });
});

describe('review round: shared-with names and saved contents', () => {
  it('lists every group and person by name in the detail', async () => {
    const view = entry('g', 'none');
    view.view.visibility = { kind: 'groups', groupIds: ['g1', 'g2'] };
    const people = entry('h', 'none');
    people.view.visibility = { kind: 'people', userIds: ['u1', 'u2'] };
    render(<Host entries={[view, people]} groupName={id => `그룹:${id}`} personName={id => `이름:${id}`} />);
    await open();
    await userEvent.click(screen.getByRole('button', { name: /뷰 g/ }));
    const region = screen.getByRole('region', { name: '뷰 g' });
    expect(within(region).getByText('그룹:g1, 그룹:g2')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /뷰 h/ }));
    const second = screen.getByRole('region', { name: '뷰 h' });
    expect(within(second).getByText('이름:u1')).toBeInTheDocument();
    expect(within(second).getByText('이름:u2')).toBeInTheDocument();
  });

  it('shows what the caller says about charts, layout and panels, so two menu views differ', async () => {
    const menu = (id: string): SavedViewEntry => {
      const base = entry(id, 'none');
      return { ...base, view: { ...base.view, kind: 'menu-view', menuId: 'm', menuSchemaVersion: 1, page: {}, chartOptions: { stack: id === 'x' }, layout: {}, panels: { id } } as never };
    };
    render(<Host entries={[menu('x'), menu('y')]} describeView={view => view.kind === 'menu-view' ? [`패널 조건 ${(view.panels as { id: string }).id}`] : []} />);
    await open();
    await userEvent.click(screen.getByRole('button', { name: /뷰 x/ }));
    expect(within(screen.getByRole('region', { name: '뷰 x' })).getByText('패널 조건 x')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /뷰 y/ }));
    expect(within(screen.getByRole('region', { name: '뷰 y' })).getByText('패널 조건 y')).toBeInTheDocument();
  });

  it('a stored date-only period renders its endpoints as written instead of throwing', async () => {
    const view = entry('d', 'none');
    view.view.context = { from: '2026-10-01', to: '2026-10-07' } as never;
    render(<Host entries={[view]} />);
    await open();
    await userEvent.click(screen.getByRole('button', { name: /뷰 d/ }));
    expect(within(screen.getByRole('region', { name: '뷰 d' })).getByText('고정 기간 2026-10-01 → 2026-10-07')).toBeInTheDocument();
  });

  it.each([
    ['24 hours', '2026-09-25T09:00:00', '2026-09-26T09:00:00', '09-25 09:00 → 09-26 09:00 (24h)'],
    ['7 days', '2026-09-25T00:00:00', '2026-10-02T00:00:00', '09-25 00:00 → 10-02 00:00 (7일)'],
    ['an open end', '2026-09-25T09:00:00', null, '09-25 09:00 → —'],
  ])('fixed period %s uses the common period rule', async (_name, from, to, text) => {
    const view = entry('f', 'none');
    view.view.context = { from, to } as never;
    render(<Host entries={[view]} />);
    await open();
    await userEvent.click(screen.getByRole('button', { name: /뷰 f/ }));
    expect(within(screen.getByRole('region', { name: '뷰 f' })).getByText(`고정 기간 ${text}`)).toBeInTheDocument();
  });
});

describe('review round: the Kernel diagnosis feeds the surface directly', () => {
  it('a real stale result reads as Korean reasons and previews its upgrade, with no object or raw code on screen', async () => {
    const base = entry('k', 'none');
    const view = { ...base.view, kind: 'menu-view', menuId: 'm', menuSchemaVersion: 1, context: { from: '2026-09-25T09:00:00', to: '2026-09-26T09:00:00', lineNames: ['L1'] }, page: { gone: ['1'] }, chartOptions: {}, layout: {}, panels: null } as never;
    const diagnosis = diagnoseSavedView(view, { menuId: 'm', menuSchemaVersion: 1, contextKeys: ['from', 'to'], pageKeys: [] }, { capabilities: { canView: true }, knownAxisIds: [] });
    expect(diagnosis.status).toBe('stale');
    render(<Host entries={[{ ...base, view }]} diagnoses={{ k: diagnosis }} />);
    await open();
    await userEvent.click(screen.getAllByRole('button', { name: '이유 보기' })[0]!);
    const text = screen.getByRole('dialog').textContent ?? '';
    expect(text).toContain('lineNames');
    expect(text).toContain('gone');
    expect(text).not.toMatch(/\[object Object\]|stale-context-key|stale-page-key/);
  });

  it('a real denied result shows the store reason', async () => {
    const base = entry('d', 'none');
    const diagnosis = diagnoseSavedView(base.view, { menuId: 'm', menuSchemaVersion: 1, contextKeys: ['from', 'to'], pageKeys: [] }, { capabilities: { canView: false, reason: '이 Scope를 볼 권한이 없습니다' }, knownAxisIds: [] });
    render(<Host entries={[base]} diagnoses={{ d: diagnosis }} />);
    await open();
    await userEvent.click(screen.getAllByRole('button', { name: '이유 보기' })[0]!);
    expect(screen.getByText('이 Scope를 볼 권한이 없습니다')).toBeInTheDocument();
  });
});
