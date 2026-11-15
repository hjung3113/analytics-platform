import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@ap/kernel';
import type { ColumnFilter } from '@ap/contracts';
import { FilterLine, type FilterLineProps } from '../FilterLine';
import type { TableFilterField } from '../../table/filterFields';

// #2334: the table's filter line as a public piece outside a table (06 §15, ADR-0105).
// Radix popovers measure their anchor; jsdom has no ResizeObserver.
beforeEach(() => { vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const options = [{ value: 'active', label: '사용중' }, { value: 'idle', label: '대기' }];
const fields: TableFilterField[] = [
  { id: 'status', label: { ko: '상태', en: 'Status' }, spec: { kind: 'enum', options }, pinned: true },
  { id: 'kind', label: { ko: '종류', en: 'Kind' }, spec: { kind: 'enum', options, multiple: false } },
  { id: 'target', label: { ko: '대상', en: 'Target' }, spec: { kind: 'text', requires: ['kind'] } },
];

function Harness({ initial = [], onChange, ...rest }: Partial<FilterLineProps> & { initial?: ColumnFilter[] }) {
  const [filters, setFilters] = useState<ColumnFilter[]>(initial);
  return <I18nProvider><FilterLine fields={fields} filters={filters} onChange={next => { onChange?.(next); setFilters(next); }} {...rest} /></I18nProvider>;
}

describe('FilterLine (#2334)', () => {
  it('edits through the same editor and reports the next whole list', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const line = screen.getByRole('group', { name: '필터' });
    expect(line.querySelector('[data-filter-scope]')).toBeNull();
    fireEvent.click(within(line).getByRole('button', { name: '상태' }));
    const dialog = await screen.findByRole('dialog', { name: '상태' });
    fireEvent.click(within(dialog).getByRole('checkbox', { name: '대기' }));
    fireEvent.click(within(dialog).getByRole('button', { name: '적용' }));
    expect(onChange).toHaveBeenLastCalledWith([{ id: 'status', op: 'in', value: ['idle'] }]);
    await waitFor(() => expect(line.querySelector('[data-column-filter-chip="status"]')?.textContent).toContain('대기'));
  });

  it('shows the scope marker first and takes the accessible name', () => {
    render(<Harness scopeLabel={{ ko: '이 패널만', en: 'This panel only' }} aria-label="패널 필터" />);
    const line = screen.getByRole('group', { name: '패널 필터' });
    expect(line.firstElementChild?.hasAttribute('data-filter-scope')).toBe(true);
    expect(line.firstElementChild?.textContent).toBe('이 패널만');
  });

  it('removing a required condition drops its dependants and says so', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} initial={[{ id: 'kind', op: 'in', value: ['active'] }, { id: 'target', op: 'contains', value: 'PM1' }]} />);
    fireEvent.click(screen.getByRole('button', { name: '종류 필터 지우기' }));
    expect(onChange).toHaveBeenLastCalledWith([]);
    await waitFor(() => expect(document.querySelector('[data-filter-dropped]')?.textContent).toContain('대상'));
  });

  it('an external replacement of the list clears a stale removal note; the line\'s own removal keeps it', async () => {
    const saved: ColumnFilter[] = [{ id: 'kind', op: 'in', value: ['active'] }, { id: 'target', op: 'contains', value: 'PM1' }];
    function Restorable() {
      const [filters, setFilters] = useState<ColumnFilter[]>(saved);
      return <I18nProvider><button type="button" onClick={() => setFilters(saved.slice())}>복원</button><FilterLine fields={fields} filters={filters} onChange={setFilters} /></I18nProvider>;
    }
    render(<Restorable />);
    fireEvent.click(screen.getByRole('button', { name: '종류 필터 지우기' }));
    await waitFor(() => expect(document.querySelector('[data-filter-dropped]')?.textContent).toContain('대상'));
    fireEvent.click(screen.getByRole('button', { name: '복원' }));
    await waitFor(() => expect(document.querySelector('[data-column-filter-chip="target"]')).not.toBeNull());
    expect(document.querySelector('[data-filter-dropped]')?.textContent ?? '').toBe('');
  });

  it('모두 지우기 reports an empty list', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} initial={[{ id: 'status', op: 'in', value: ['idle'] }]} />);
    fireEvent.click(screen.getByRole('button', { name: '모두 지우기' }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('refuses a draft the page validate rejects, inline, without calling onChange', async () => {
    const onChange = vi.fn();
    const validate = (f: ColumnFilter) => (f.op === 'in' && f.value.includes('idle') ? { ko: '대기는 고를 수 없습니다', en: 'Idle is not allowed' } : null);
    render(<Harness onChange={onChange} validate={validate} />);
    fireEvent.click(screen.getByRole('button', { name: '상태' }));
    const dialog = await screen.findByRole('dialog', { name: '상태' });
    fireEvent.click(within(dialog).getByRole('checkbox', { name: '대기' }));
    expect(within(dialog).getByText('대기는 고를 수 없습니다')).toBeTruthy();
    expect((within(dialog).getByRole('button', { name: '적용' }) as HTMLButtonElement).disabled).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('a duplicate field id throws under its own name', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<I18nProvider><FilterLine fields={[fields[0], fields[0]]} filters={[]} onChange={() => {}} /></I18nProvider>)).toThrow('FilterLine: filter field id "status" is declared twice');
  });
});
