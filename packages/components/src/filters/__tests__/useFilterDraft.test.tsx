import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@ap/kernel';
import { useFilterDraft, useManagementFilters } from '../useFilterDraft';

const setPage = vi.fn();
vi.mock('@ap/kernel', async importOriginal => ({ ...await importOriginal<typeof import('@ap/kernel')>(), usePlatform: () => ({ setPage }) }));

afterEach(() => { cleanup(); setPage.mockClear(); });

const mount = (applied: Record<string, string>, identity?: string) =>
  renderHook((props: { applied: Record<string, string>; identity?: string }) => useFilterDraft(props.applied, props.identity), { initialProps: { applied, identity } });

describe('useFilterDraft', () => {
  it('starts clean and counts a field once however many keystrokes it took', () => {
    const view = mount({ q: '', status: 'active' });
    expect(view.result.current).toMatchObject({ changedCount: 0, values: { q: '', status: 'active' } });
    act(() => view.result.current.set('q', 'a'));
    act(() => view.result.current.set('q', 'ab'));
    expect(view.result.current).toMatchObject({ changedCount: 1 });
    act(() => view.result.current.set('q', ''));
    expect(view.result.current.changedCount).toBe(0);
  });

  it('counts clearing an applied field and ignores a draft equal to the applied value', () => {
    const view = mount({ q: 'x', status: 'active' });
    act(() => view.result.current.set('status', ''));
    expect(view.result.current.changedCount).toBe(1);
    act(() => view.result.current.set('q', 'x'));
    expect(view.result.current.changedCount).toBe(1);
  });

  it('patches every field with empty drafts as null', () => {
    const view = mount({ q: 'x', status: '' });
    act(() => view.result.current.set('q', ''));
    act(() => view.result.current.set('status', 'idle'));
    expect(view.result.current.patch()).toEqual({ q: null, status: 'idle' });
  });

  it('rebases onto changed applied values but not while the user edits an unchanged applied value', () => {
    const view = mount({ q: '', status: '' });
    act(() => view.result.current.set('q', 'draft'));
    view.rerender({ applied: { q: '', status: '' }, identity: undefined });
    expect(view.result.current.values.q).toBe('draft');

    view.rerender({ applied: { q: 'new', status: '' }, identity: undefined });
    expect(view.result.current).toMatchObject({ values: { q: 'new', status: '' }, changedCount: 0 });
  });

  it('rebases when only the explicit identity changes (same displayed text, different source)', () => {
    const view = mount({ fromAt: '2026-09-26 11:00:00' }, 'raw-a');
    act(() => view.result.current.set('fromAt', 'typed'));
    view.rerender({ applied: { fromAt: '2026-09-26 11:00:00' }, identity: 'raw-a' });
    expect(view.result.current.values.fromAt).toBe('typed');
    view.rerender({ applied: { fromAt: '2026-09-26 11:00:00' }, identity: 'raw-b' });
    expect(view.result.current).toMatchObject({ values: { fromAt: '2026-09-26 11:00:00' }, changedCount: 0 });
  });

  it('reset drops the edits, or sets an explicit all-empty draft', () => {
    const view = mount({ q: 'x', status: 'idle' });
    act(() => view.result.current.set('q', 'y'));
    act(() => view.result.current.reset());
    expect(view.result.current).toMatchObject({ values: { q: 'x', status: 'idle' }, changedCount: 0 });
    act(() => view.result.current.reset({}));
    expect(view.result.current).toMatchObject({ values: { q: '', status: '' }, changedCount: 2 });
  });
});

type Props = { applied: Record<string, string>; identity?: string; toPatch?: (p: Record<string, string | null>) => Record<string, string | null> | null; onRebase?: () => void };
const wrapper = ({ children }: { children: ReactNode }) => <I18nProvider>{children}</I18nProvider>;
const mountManagement = (initial: Props) =>
  renderHook((props: Props) => useManagementFilters({ ...props, clearKeys: ['q', 'status'] }), { initialProps: initial, wrapper });

describe('useManagementFilters', () => {
  it('applies the draft with exactly one setPage that also resets page', () => {
    const view = mountManagement({ applied: { q: '', status: 'active' } });
    act(() => view.result.current.draft.set('q', 'abc'));
    act(() => view.result.current.barProps.onApply());
    expect(setPage.mock.calls).toEqual([[{ q: 'abc', status: 'active', page: null }]]);
  });

  it('builds the patch through toPatch and sends nothing when it returns null', () => {
    const toPatch = vi.fn((p: Record<string, string | null>): Record<string, string | null> | null => (p.q === 'bad' ? null : { ...p, extra: 'x' }));
    const view = mountManagement({ applied: { q: '', status: '' }, toPatch });
    act(() => view.result.current.draft.set('q', 'bad'));
    act(() => view.result.current.barProps.onApply());
    expect(setPage).not.toHaveBeenCalled();
    act(() => view.result.current.draft.set('q', 'ok'));
    act(() => view.result.current.barProps.onApply());
    expect(setPage.mock.calls).toEqual([[{ q: 'ok', status: null, extra: 'x', page: null }]]);
  });

  it('clear nulls exactly the clear keys plus page in one call and empties the drafts', () => {
    const view = mountManagement({ applied: { q: 'x', status: 'idle' } });
    act(() => view.result.current.clear());
    expect(setPage.mock.calls).toEqual([[{ q: null, status: null, page: null }]]);
    expect(view.result.current.draft.values).toEqual({ q: '', status: '' });
  });

  it('counts applied and pending fields, and shows the footer clear only while a filter is applied', async () => {
    const empty = mountManagement({ applied: { q: '', status: '' } });
    expect(empty.result.current.layoutProps).toEqual({ activeFilterCount: 0, pendingFilterCount: 0 });
    expect(empty.result.current.clearButton).toBeNull();

    const view = mountManagement({ applied: { q: 'x', status: '' } });
    act(() => view.result.current.draft.set('status', 'idle'));
    expect(view.result.current.layoutProps).toEqual({ activeFilterCount: 1, pendingFilterCount: 1 });
    render(<I18nProvider>{view.result.current.barProps.actions}</I18nProvider>);
    expect(screen.getByRole('button', { name: '적용 (1)' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: '필터 초기화' }));
    expect(setPage.mock.calls).toEqual([[{ q: null, status: null, page: null }]]);
  });

  it('recoverButton exists with no filter applied (the footer clear does not), and a click moves focus to main, then clears', async () => {
    const view = mountManagement({ applied: { q: '', status: '' } });
    expect(view.result.current.clearButton).toBeNull();
    expect(view.result.current.recoverButton).not.toBeNull();
    render(<I18nProvider><main tabIndex={-1}>{view.result.current.recoverButton}</main></I18nProvider>);
    await userEvent.click(screen.getByRole('button', { name: '필터 초기화' }));
    expect(setPage.mock.calls).toEqual([[{ q: null, status: null, page: null }]]);
    expect(document.activeElement).toBe(screen.getByRole('main'));
  });

  it('fires onRebase once per applied/identity change, not on rerenders or edits, and not from clear itself', () => {
    const onRebase = vi.fn();
    const view = mountManagement({ applied: { q: 'x', status: '' }, onRebase });
    view.rerender({ applied: { q: 'x', status: '' }, onRebase });
    act(() => view.result.current.draft.set('q', 'typed'));
    act(() => view.result.current.clear());
    expect(onRebase).not.toHaveBeenCalled();
    view.rerender({ applied: { q: '', status: '' }, onRebase });
    expect(onRebase).toHaveBeenCalledTimes(1);
    view.rerender({ applied: { q: '', status: '' }, identity: 'raw-b', onRebase });
    expect(onRebase).toHaveBeenCalledTimes(2);
  });
});
