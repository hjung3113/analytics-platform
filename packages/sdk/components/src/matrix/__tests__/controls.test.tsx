import { useState } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@ap/kernel';
import type { ColumnFilter, MatrixEmphasisRule } from '@ap/contracts';
import { MatrixLevelOrder } from '../MatrixLevelOrder';
import { MatrixEmphasisBar } from '../MatrixEmphasisBar';
import { MatrixFilters, type MatrixFilterField } from '../MatrixFilters';
import { MatrixToneLegend } from '../MatrixToneLegend';

beforeEach(() => { vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const levels = [{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Beta' }, { id: 'c', label: 'Gamma' }];
describe('MatrixLevelOrder', () => {
  it('reorders, removes, re-adds, keeps at least one level and restores the consumer default', async () => {
    const onChange = vi.fn();
    function Harness() {
      const [value, setValue] = useState(['a', 'b']);
      return <I18nProvider><MatrixLevelOrder levels={levels} value={value} defaultValue={['b', 'a']} onChange={next => { setValue(next); onChange(next); }} /></I18nProvider>;
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: '단계 순서' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Beta 위로 이동' }));
    expect(onChange).toHaveBeenLastCalledWith(['b', 'a']);
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Alpha' }));
    expect(onChange).toHaveBeenLastCalledWith(['b']);
    expect(within(dialog).getByRole('checkbox', { name: 'Beta' })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Gamma' }));
    expect(onChange).toHaveBeenLastCalledWith(['b', 'c']);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Beta 아래로 이동' }));
    expect(onChange).toHaveBeenLastCalledWith(['c', 'b']);
    fireEvent.click(within(dialog).getByRole('button', { name: '기본값으로' }));
    expect(onChange).toHaveBeenLastCalledWith(['b', 'a']);
  });
});
describe('MatrixEmphasisBar', () => {
  it('removes one rule, clears all and controls the narrowing toggle with consumer labels', () => {
    const rules: MatrixEmphasisRule[] = [{ row: 'a', match: { kind: 'values', values: ['x'] } }, { row: 'b', match: { kind: 'range', min: 0 } }];
    const onChange = vi.fn(); const toggle = vi.fn();
    render(<I18nProvider><MatrixEmphasisBar emphasis={rules} onEmphasisChange={onChange} onlyMatchingColumns={false} onOnlyMatchingColumnsChange={toggle} rowLabel={id => id.toUpperCase()} label={n => `Matches ${n}`} onlyMatchingLabel="Only these" /></I18nProvider>);
    expect(screen.getByText('Matches 2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'A 강조 지우기' }));
    expect(onChange).toHaveBeenLastCalledWith([rules[1]]);
    fireEvent.click(screen.getByRole('button', { name: 'Only these' }));
    expect(toggle).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByRole('button', { name: '모두 지우기' }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });
});
describe('MatrixFilters', () => {
  const filterFields: MatrixFilterField[] = [{ id: 'path', label: 'Path', spec: { kind: 'text', ops: ['equals'] } }, { id: 'value', label: 'Value', spec: { kind: 'number' } }];
  it('reuses the declaration, URL read, chip and editor to emit ColumnFilter[]', async () => {
    const onChange = vi.fn();
    const filters: ColumnFilter[] = [{ id: 'path', op: 'equals', value: 'a' }];
    render(<I18nProvider><MatrixFilters fields={filterFields} filterKey="conditions" filterValues={['path:equals:a']} onChange={onChange} /></I18nProvider>);
    expect(document.querySelector('[data-column-filter-chip="path"]')).toHaveTextContent('Path');
    fireEvent.click(screen.getByRole('button', { name: 'Path 같음 "a"' }));
    const dialog = await screen.findByRole('dialog', { name: 'Path' });
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'b' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '적용' }));
    expect(onChange).toHaveBeenLastCalledWith([{ ...filters[0], value: 'b' }]);
  });
  it('offers the shared + filter picker and refuses invalid URL values explicitly', () => {
    const { rerender } = render(<I18nProvider><MatrixFilters fields={filterFields} filters={[]} onChange={vi.fn()} /></I18nProvider>);
    expect(screen.getByRole('button', { name: '필터 추가' })).toBeInTheDocument();
    rerender(<I18nProvider><MatrixFilters fields={filterFields} filterValues={['value:eq:bad']} onChange={vi.fn()} /></I18nProvider>);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '필터 추가' })).toBeNull();
  });
});
it('renders only consumer-labelled tone samples including the missing hatch', () => {
  render(<MatrixToneLegend labels={{ info: 'Changed', danger: 'Outside', missing: 'Missing', muted: 'Quiet' }} />);
  expect(screen.getByText('Changed').previousElementSibling).toHaveClass('bg-accent-primary-soft');
  expect(screen.getByText('Missing').previousElementSibling).toHaveClass('surface-hatched');
});
