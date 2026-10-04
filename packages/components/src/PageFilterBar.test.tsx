import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { PageFilterBar } from './index';

const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
beforeAll(() => { HTMLElement.prototype.scrollIntoView = vi.fn(); });
afterAll(() => {
  if (originalScrollIntoView) HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  else delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
});
afterEach(cleanup);

describe('PageFilterBar', () => {
  it('renders labeled search, exact-text, categorical, and custom fields with consumer actions', async () => {
    const onSearch = vi.fn();
    const onExactId = vi.fn();
    const onDomain = vi.fn();
    render(<PageFilterBar
      label="Page filters"
      fields={[
        { kind: 'search', key: 'q', label: 'Search metrics', value: '', onValueChange: onSearch },
        { kind: 'text', key: 'id', label: 'Exact ID', value: '', onValueChange: onExactId },
        {
          kind: 'select', key: 'domain', label: 'Domain', value: 'unknown-domain',
          emptyOptionLabel: 'All domains', options: [{ value: 'equipment', label: 'Equipment' }], onValueChange: onDomain,
        },
        { kind: 'custom', key: 'grain', label: 'Grain', content: <button type="button">Hour</button> },
      ]}
      actions={<><button type="button">Reset</button><button type="button">Apply</button></>}
    />);

    const bar = screen.getByTestId('page-filter-bar');
    expect(screen.getByRole('group', { name: 'Page filters' })).toBe(bar);
    expect(screen.getByRole('searchbox', { name: 'Search metrics' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Exact ID' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Grain' })).toBeInTheDocument();
    const domain = screen.getByRole('combobox', { name: 'Domain' });
    expect(domain).toHaveTextContent('unknown-domain');
    expect(domain).toHaveClass('rounded-md', 'text-sm');
    expect(domain).not.toHaveClass('text-xs');
    expect(screen.getByRole('searchbox', { name: 'Search metrics' })).toHaveClass('rounded-md');
    expect(screen.getByRole('searchbox', { name: 'Search metrics' })).not.toHaveClass('rounded-sm');
    expect(screen.getByRole('button', { name: 'Hour' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply' })).toBeInTheDocument();
    expect(bar.querySelectorAll('[data-page-filter-search-icon]')).toHaveLength(1);

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search metrics' }), { target: { value: 'cycle' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Exact ID' }), { target: { value: 'METRIC-01' } });
    expect(onSearch).toHaveBeenCalledWith('cycle');
    expect(onExactId).toHaveBeenCalledWith('METRIC-01');

    fireEvent.keyDown(domain, { key: 'ArrowDown' });
    expect(await screen.findByRole('option', { name: 'unknown-domain' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'All domains' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: 'Equipment' }));
    expect(onDomain).toHaveBeenCalledWith('equipment');

    fireEvent.keyDown(domain, { key: 'ArrowDown' });
    fireEvent.click(await screen.findByRole('option', { name: 'All domains' }));
    expect(onDomain).toHaveBeenLastCalledWith('');
  });

  it('focuses text controls and Select triggers when their visible labels are clicked', async () => {
    render(<PageFilterBar label="Page filters" fields={[
      { kind: 'text', key: 'actor', label: 'Exact actor', value: '', onValueChange: vi.fn() },
      { kind: 'select', key: 'status', label: 'Status', value: 'active', options: [{ value: 'active', label: 'Active' }], onValueChange: vi.fn() },
    ]} />);

    const actor = screen.getByRole('textbox', { name: 'Exact actor' });
    const actorLabel = screen.getByText('Exact actor') as HTMLLabelElement;
    expect(actorLabel.control).toBe(actor);
    actorLabel.click();
    expect(actor).toHaveFocus();

    const status = screen.getByRole('combobox', { name: 'Status' });
    const statusLabel = screen.getByText('Status') as HTMLLabelElement;
    expect(statusLabel.control).toBe(status);
    statusLabel.click();
    expect(status).toHaveFocus();
    fireEvent.keyDown(status, { key: 'ArrowDown' });
    expect(await screen.findByRole('option', { name: 'Active' })).toBeInTheDocument();
  });

  it('a label click focuses the Select trigger without opening it (label activation is not forwarded)', () => {
    render(<PageFilterBar label="Page filters" fields={[
      { kind: 'select', key: 'status', label: 'Status', value: 'active', options: [{ value: 'active', label: 'Active' }], onValueChange: vi.fn() },
    ]} />);
    const status = screen.getByRole('combobox', { name: 'Status' });
    const notPrevented = fireEvent.click(screen.getByText('Status'));
    expect(notPrevented).toBe(false);
    expect(status).toHaveFocus();
    expect(status).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('keeps a Select controlled when an empty value has no empty option label', async () => {
    function ControlledHarness() {
      const [value, setValue] = useState('');
      return <>
        <PageFilterBar label="Page filters" fields={[{
          kind: 'select', key: 'percentile', label: 'Percentile', value, placeholder: 'Choose percentile',
          options: [{ value: 'p50', label: 'P50' }], onValueChange: setValue,
        }]} />
        <button type="button" onClick={() => setValue('')}>Reset selection</button>
      </>;
    }

    render(<ControlledHarness />);
    const percentile = screen.getByRole('combobox', { name: 'Percentile' });
    fireEvent.click(percentile);
    fireEvent.click(await screen.findByRole('option', { name: 'P50' }));
    expect(percentile).toHaveTextContent('P50');

    fireEvent.click(screen.getByRole('button', { name: 'Reset selection' }));
    expect(percentile).toHaveTextContent('Choose percentile');
  });
});
