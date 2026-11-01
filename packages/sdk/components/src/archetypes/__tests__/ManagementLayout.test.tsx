import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@ap/kernel';
import { ManagementLayout } from '../ManagementLayout';
import { PageDensityProvider } from '../../pageDensity';

afterEach(cleanup);

describe('ManagementLayout without a filter rail (node 1217f, ADR-0105)', () => {
  it('calls table() with no argument when the page passes no search', () => {
    const table = vi.fn(() => <section aria-label="표"><p>표 내용</p></section>);
    render(<I18nProvider><ManagementLayout table={table} /></I18nProvider>);
    expect(table).toHaveBeenLastCalledWith();
    expect(screen.getByText('표 내용')).toBeInTheDocument();
  });

  it('hands `search` to the table as its only argument', () => {
    const search = <input aria-label="빠른 검색" />;
    const table = vi.fn((searchSlot?: React.ReactNode) => <section aria-label="표">{searchSlot}<p>표 내용</p></section>);
    render(<I18nProvider><ManagementLayout search={search} table={table} /></I18nProvider>);
    expect(table).toHaveBeenLastCalledWith(search);
    expect(within(screen.getByRole('region', { name: '표' })).getByLabelText('빠른 검색')).toBeTruthy();
  });

  it('renders the drawer after the table and shows no filter rail or filter button', () => {
    render(<I18nProvider><ManagementLayout table={() => <section aria-label="표"><p>표 내용</p></section>} drawer={<p>상세 내용</p>} /></I18nProvider>);
    const table = screen.getByRole('region', { name: '표' });
    expect(table.compareDocumentPosition(screen.getByText('상세 내용')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole('region', { name: '필터' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^필터/ })).toBeNull();
  });

  it.each(['compact', 'comfortable'] as const)('renders the same one-column structure at %s density (no rail grid)', density => {
    const { container } = render(<PageDensityProvider value={density}><I18nProvider><ManagementLayout table={() => <p>표</p>} /></I18nProvider></PageDensityProvider>);
    expect(container.querySelector('.grid')).toBeNull();
  });
});
