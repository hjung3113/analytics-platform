import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { I18nProvider } from '@ap/kernel';
import { ManagementLayout } from '../ManagementLayout';
import { PageDensityProvider } from '../../pageDensity';

afterEach(cleanup);

describe('ManagementLayout without a filter rail (node 1217f, ADR-0105)', () => {
  it('renders the table node', () => {
    render(<I18nProvider><ManagementLayout table={<section aria-label="표"><p>표 내용</p></section>} /></I18nProvider>);
    expect(screen.getByText('표 내용')).toBeInTheDocument();
  });

  it('renders the drawer after the table and shows no filter rail or filter button', () => {
    render(<I18nProvider><ManagementLayout table={<section aria-label="표"><p>표 내용</p></section>} drawer={<p>상세 내용</p>} /></I18nProvider>);
    const table = screen.getByRole('region', { name: '표' });
    expect(table.compareDocumentPosition(screen.getByText('상세 내용')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole('region', { name: '필터' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^필터/ })).toBeNull();
  });

  it.each(['compact', 'comfortable'] as const)('renders the same one-column structure at %s density (no rail grid)', density => {
    const { container } = render(<PageDensityProvider value={density}><I18nProvider><ManagementLayout table={<p>표</p>} /></I18nProvider></PageDensityProvider>);
    expect(container.querySelector('.grid')).toBeNull();
  });
});
