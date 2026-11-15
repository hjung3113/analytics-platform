import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LifecycleApi, Presentation, ReadState, ScreenProps, TableParts } from '../contracts';
import { LifecycleHost } from '../host';
import { LifecycleForm } from '../forms';
import { ModelsScreen } from '../ModelsScreen';

// #2243: Safari sends the Enter that confirms a Korean composition right after `compositionend` with `isComposing` false.
// The form-level guard cancels that Enter's implicit submit; the next plain Enter submits as before.
const run = vi.fn().mockResolvedValue({ outcome: 'ok', data: {}, fieldErrors: [], version: '2' });
function Table<T extends { id: string }>(p: TableParts<T>) { return <table aria-label={p.title}><tbody>{p.rows.map(r => <tr key={r.id}>{p.columns.map(c => <td key={c.id}>{c.cell(r)}</td>)}</tr>)}</tbody></table>; }
const ui: Presentation = { page: p => p.children, table: Table, drawer: p => <section role="dialog" aria-label={String(p.title)}>{p.body}</section>, timeline: () => null, trust: () => null };
function props(data: Record<string, unknown> = {}): ScreenProps {
  const api: LifecycleApi = { useRead: <T,>(name: string): ReadState<T> => ({ status: 'done', data: (data[name] ?? null) as T | null, retry: vi.fn() }) as ReadState<T>, useAction: () => ({ pending: false, run }) };
  return { api, ui, canProject: true, canRound: true, actorId: 'a', setSelection: vi.fn() };
}
afterEach(() => { cleanup(); run.mockClear(); });
/** Safari's order: composition ends, then the Enter keydown. Returns whether that keydown was cancelled. */
function safariEnter(field: Element) {
  fireEvent.compositionStart(field); fireEvent.compositionEnd(field);
  return !fireEvent.keyDown(field, { key: 'Enter' });
}

describe('form-level IME Enter guard', () => {
  it('LifecycleForm cancels the composition Enter and keeps a plain Enter', () => {
    render(<LifecycleHost navigate={vi.fn()}><LifecycleForm {...props()} name="roundOpen" title="Round 열기" initial={{ projectId: 'p', sourceOwner: '' }} onClose={vi.fn()} /></LifecycleHost>);
    const field = screen.getByLabelText('원본 소유자 (필수)');
    fireEvent.change(field, { target: { value: '설비팀' } });
    expect(safariEnter(field)).toBe(true);
    expect(fireEvent.keyDown(field, { key: 'Enter' })).toBe(true);
  });
  it('the model search form cancels the composition Enter and keeps a plain Enter', () => {
    render(<LifecycleHost navigate={vi.fn()}><ModelsScreen {...props({ models: { rows: [], total: 0 } })} /></LifecycleHost>);
    const field = screen.getByRole('searchbox', { name: '모델 코드·이름 검색' });
    fireEvent.change(field, { target: { value: '식각' } });
    expect(safariEnter(field)).toBe(true);
    expect(fireEvent.keyDown(field, { key: 'Enter' })).toBe(true);
  });
});
