import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useFilterDraft } from './useFilterDraft';

afterEach(cleanup);

const mount = (applied: Record<string, string>, identity?: string) =>
  renderHook((props: { applied: Record<string, string>; identity?: string }) => useFilterDraft(props.applied, props.identity), { initialProps: { applied, identity } });

describe('useFilterDraft', () => {
  it('starts clean and counts a field once however many keystrokes it took', () => {
    const view = mount({ q: '', status: 'active' });
    expect(view.result.current).toMatchObject({ changedCount: 0, dirty: false, values: { q: '', status: 'active' } });
    act(() => view.result.current.set('q', 'a'));
    act(() => view.result.current.set('q', 'ab'));
    expect(view.result.current).toMatchObject({ changedCount: 1, dirty: true });
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
