import { useRef, useState } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@ap/kernel';
import type { Result } from '@ap/contracts';
import { SaveViewDialog, type SaveViewDialogProps } from './SaveViewDialog';

afterEach(cleanup);
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };

const base: SaveViewDialogProps = { open: true, onOpenChange: vi.fn(), units: ['condition-set', 'menu-view'], context: { from: '2026-09-25T09:00:00', to: '2026-09-26T09:00:00', roomNames: ['x'] }, onSubmit: vi.fn() };
const view = (over: Partial<SaveViewDialogProps> = {}) => render(<I18nProvider><SaveViewDialog {...base} {...over} /></I18nProvider>);
const fail = (reason: 'conflict' | 'forbidden' | 'unavailable' | 'invalid'): Result<unknown> => ({ ok: false, reason });

describe('SaveViewDialog', () => {
  it('shows the apply-then-save notice only when a draft exists', () => {
    view({ hasDraft: true });
    expect(screen.getByRole('note')).toHaveTextContent('적용 뒤 저장');
    cleanup();
    view();
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('summarizes applied conditions with fixed-period and 공정 wording, panels and exclusions read-only', () => {
    view({ panels: { count: 2, excluded: ['설비 A'] }, units: ['menu-view'] });
    expect(screen.getByText(/09-25 09:00 → 09-26 09:00 \(24h\) \(고정 기간\)/)).toBeVisible();
    expect(screen.getByText('공정 1')).toBeVisible();
    expect(screen.getByText(/패널 조건 2/)).toBeVisible();
    expect(screen.getByText(/제외값: 설비 A/)).toBeVisible();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('requires a name and offers the unit choice', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    view({ onSubmit });
    expect(screen.getByRole('radio', { name: /조건 세트/ })).toBeChecked();
    await user.click(screen.getByRole('button', { name: '저장' }));
    expect(screen.getByRole('alert')).toHaveTextContent('이름을 입력하세요.');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it.each([['conflict', '다른 곳에서 먼저 바뀌었습니다'], ['forbidden', '저장할 권한이 없습니다'], ['unavailable', '지금은 저장할 수 없습니다'], ['invalid', '저장할 수 없는 내용입니다']] as const)('keeps the input after a %s failure', async (reason, text) => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    view({ onSubmit: vi.fn().mockResolvedValue(fail(reason)), onOpenChange });
    await user.click(screen.getByRole('radio', { name: /메뉴 뷰/ }));
    await user.type(screen.getByRole('textbox', { name: '뷰 이름' }), '내 뷰');
    await user.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(text));
    expect(screen.getByRole('textbox', { name: '뷰 이름' })).toHaveValue('내 뷰');
    expect(screen.getByRole('radio', { name: /메뉴 뷰/ })).toBeChecked();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('closes on success and sends the unit, name and chosen audience only on the final save', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue({ ok: true, value: null });
    const onOpenChange = vi.fn();
    view({ onSubmit, onOpenChange, visibilityOptions: [{ value: 'private', label: '나만' }, { value: 'team', label: '팀' }] });
    await user.type(screen.getByRole('textbox', { name: '뷰 이름' }), '  뷰1 ');
    await user.click(screen.getByRole('radio', { name: '팀' }));
    expect(onSubmit).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(onSubmit).toHaveBeenCalledWith({ mode: 'new', unit: 'condition-set', name: '뷰1', visibility: 'team' });
  });

  it('updates the current view without a name field', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue({ ok: true, value: null });
    view({ onSubmit, updatable: { name: 'Alpha' }, units: ['menu-view'] });
    expect(screen.queryByRole('textbox', { name: '뷰 이름' })).toBeNull();
    await user.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ mode: 'update', unit: 'menu-view', name: 'Alpha', visibility: '' }));
  });
});

describe('SaveViewDialog fix round', () => {
  it('includes panels only for a menu view, following the chosen unit', async () => {
    const user = userEvent.setup();
    view({ panels: { count: 2, excluded: ['설비 A'] } });
    expect(screen.queryByText(/패널 조건 2/)).toBeNull();
    expect(screen.queryByText(/제외값/)).toBeNull();
    await user.click(screen.getByRole('radio', { name: /메뉴 뷰/ }));
    expect(screen.getByText(/패널 조건 2/)).toBeVisible();
    expect(screen.getByText(/제외값: 설비 A/)).toBeVisible();
    await user.click(screen.getByRole('radio', { name: /조건 세트/ }));
    expect(screen.queryByText(/패널 조건 2/)).toBeNull();
  });

  it('updating follows the updated view unit', () => {
    view({ panels: { count: 2 }, updatable: { name: 'Alpha', unit: 'condition-set' }, units: ['menu-view'] });
    expect(screen.queryByText(/패널 조건 2/)).toBeNull();
  });

  it('error text uses the danger label token', async () => {
    const user = userEvent.setup();
    view({ onSubmit: vi.fn().mockResolvedValue(fail('invalid')) });
    await user.click(screen.getByRole('button', { name: '저장' }));
    expect(screen.getByRole('alert')).toHaveClass('text-text-danger-label');
    await user.type(screen.getByRole('textbox', { name: '뷰 이름' }), 'x');
    await user.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveClass('text-text-danger-label'));
  });

  function Host({ ref: useRefTarget, ok = true }: { ref?: boolean; ok?: boolean }) {
    const [open, setOpen] = useState(false);
    const target = useRef<HTMLButtonElement>(null);
    return <I18nProvider>
      <button type="button" ref={target}>트리거</button>
      <button type="button" onClick={() => setOpen(true)}>열기</button>
      <SaveViewDialog {...base} open={open} onOpenChange={setOpen} returnFocusRef={useRefTarget ? target : undefined} onSubmit={vi.fn().mockResolvedValue(ok ? { ok: true, value: null } : fail('invalid'))} />
    </I18nProvider>;
  }

  it.each([
    ['cancel', async (u: ReturnType<typeof userEvent.setup>) => { await u.click(screen.getByRole('button', { name: '취소' })); }],
    ['Escape', async (u: ReturnType<typeof userEvent.setup>) => { await u.keyboard('{Escape}'); }],
    ['success', async (u: ReturnType<typeof userEvent.setup>) => { await u.type(screen.getByRole('textbox', { name: '뷰 이름' }), 'n'); await u.click(screen.getByRole('button', { name: '저장' })); }],
  ])('closing by %s returns focus to the opener, or to the given return target', async (_n, close) => {
    const user = userEvent.setup();
    const { unmount } = render(<Host />);
    await user.click(screen.getByRole('button', { name: '열기' }));
    await close(user);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('button', { name: '열기' })).toHaveFocus();
    unmount();
    render(<Host ref />);
    await user.click(screen.getByRole('button', { name: '열기' }));
    await close(user);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('button', { name: '트리거' })).toHaveFocus();
  });
});
