import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@ap/kernel';
import { IntervalTable, formatDurationMs, INTERVAL_TABLE_PAGE_SIZE } from '../canvasChartTable';

// #2792: the canvas charts' `표로 보기` table — one row per interval, paged, built one page at a time.
afterEach(cleanup);

const columns = [{ label: 'Lane' }, { label: 'Start', nowrap: true }, { label: 'Length', numeric: true, nowrap: true }];
const pageRows = (selected = -1) => vi.fn((from: number, to: number) => Array.from({ length: to - from }, (_, i) => ({
  key: String(from + i), selected: from + i === selected, cells: [`L${from + i}`, `T${from + i}`, String(from + i)],
})));

describe('IntervalTable', () => {
  it('builds only the shown page and pages twenty rows at a time', () => {
    const rows = pageRows();
    let page = 0;
    const view = render(<I18nProvider><IntervalTable title="Intervals" columns={columns} count={45} rows={rows} page={page} onPage={next => { page = next; }} /></I18nProvider>);
    expect(rows).toHaveBeenLastCalledWith(0, INTERVAL_TABLE_PAGE_SIZE);
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(21);
    expect(screen.getByText('Intervals · 1/3')).toBeVisible();
    expect(screen.getByRole('button', { name: '이전 쪽' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '다음 쪽' }));
    expect(page).toBe(1);
    view.rerender(<I18nProvider><IntervalTable title="Intervals" columns={columns} count={45} rows={rows} page={2} onPage={() => {}} /></I18nProvider>);
    expect(rows).toHaveBeenLastCalledWith(40, 45);
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(6);
    expect(screen.getByRole('button', { name: '다음 쪽' })).toBeDisabled();
    // A page past the end (fewer rows after a data change) shows the last page.
    view.rerender(<I18nProvider><IntervalTable title="Intervals" columns={columns} count={5} rows={rows} page={2} onPage={() => {}} /></I18nProvider>);
    expect(screen.getByText('Intervals · 1/1')).toBeVisible();
    expect(rows).toHaveBeenLastCalledWith(0, 5);
  });

  it('names its columns, aligns numbers to the end, keeps times on one line and marks the selected row', () => {
    const rows = pageRows(1);
    render(<I18nProvider><IntervalTable title="Intervals" caption="Range" describedBy="summary" columns={columns} count={3} rows={rows} page={0} onPage={() => {}} /></I18nProvider>);
    const table = screen.getByRole('table');
    expect(table).toHaveAttribute('aria-describedby', 'summary');
    expect(within(table).getByText('Range').tagName).toBe('CAPTION');
    expect(within(table).getAllByRole('columnheader').map(cell => cell.textContent)).toEqual(['Lane', 'Start', 'Length']);
    const [, second] = within(table).getAllByRole('row').slice(1);
    const cells = within(second).getAllByRole('cell');
    expect(cells[1]).toHaveClass('whitespace-nowrap');
    expect(cells[2]).toHaveClass('text-right', 'whitespace-nowrap');
    expect(cells[0]).not.toHaveClass('whitespace-nowrap');
    expect(second).toHaveAttribute('aria-selected', 'true');
    expect(second).toHaveAttribute('aria-current', 'true');
  });
});

describe('formatDurationMs', () => {
  it.each([
    [0, 'ko', '0ms'], [0.25, 'ko', '<1ms'], [999, 'ko', '999ms'], [61_000, 'ko', '1분 1초'], [90_061_000, 'ko', '1일 1시간 1분 1초'], [3_600_500, 'en', '1h'], [-1, 'ko', '—'],
  ] as const)('%s ms in %s reads %s', (ms, lang, text) => {
    expect(formatDurationMs(ms, lang)).toBe(text);
  });
});
