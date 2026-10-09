import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { I18nProvider } from '@ap/kernel';
import { PageFilterBar, type PageFilterBarProps } from './index';

const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
beforeAll(() => { HTMLElement.prototype.scrollIntoView = vi.fn(); });
afterAll(() => {
  if (originalScrollIntoView) HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  else delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
});
afterEach(cleanup);

describe('PageFilterBar', () => {
  it('keeps the column legend accessible without fieldset borders and gives fields full width', () => {
    render(<PageFilterBar orientation="column" label="Column filters" fields={[
      { kind: 'text', key: 'actor', label: 'Actor', value: '', onValueChange: vi.fn() },
      { kind: 'select', key: 'status', label: 'Status', value: '', options: [], onValueChange: vi.fn() },
    ]} actions={<button>Apply</button>} />);
    const bar = screen.getByRole('group', { name: 'Column filters' });
    expect(bar).not.toHaveClass('border', 'border-border-subtle');
    expect(screen.getByText('Column filters')).toHaveClass('sr-only');
    expect(screen.getByRole('textbox', { name: 'Actor' }).parentElement).toHaveClass('w-full');
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveClass('w-full');
    expect(screen.getByRole('button', { name: 'Apply' }).parentElement).toHaveClass('sticky', 'bottom-0', 'border-t', 'bg-surface-card');
  });

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

const collapsibleProps = {
  label: '페이지 필터',
  collapsible: true,
  preferenceKey: 'cycle-time',
  fields: [
    { kind: 'select', key: 'percentile', label: '느린 실행 기준', value: 'p95', options: [{ value: 'p95', label: '≥ P95' }], onValueChange: vi.fn() },
    { kind: 'search', key: 'q', label: '검색', value: '', onValueChange: vi.fn() },
  ],
  summaryItems: [
    { key: 'granularity', label: '집계', value: '시간' },
    { key: 'percentile', label: '느린 실행 기준', value: '≥ P95' },
    { key: 'sort', label: '정렬', value: '사이클타임 내림차순' },
  ],
  actions: <button type="button">페이지 조건 기본값</button>,
  collapsedActions: <button type="button">페이지 조건 기본값</button>,
} satisfies PageFilterBarProps;

function Harness({ preferenceKey }: { preferenceKey: string }) {
  return <PageFilterBar {...collapsibleProps} preferenceKey={preferenceKey} />;
}

describe('PageFilterBar collapsible', () => {
  let storage: Map<string, string>;
  const mountBar = (props: PageFilterBarProps = collapsibleProps) =>
    render(<I18nProvider><PageFilterBar {...props} /></I18nProvider>);

  beforeEach(() => {
    storage = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value); },
      removeItem: (key: string) => storage.delete(key),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('stays expanded by default and keeps the page-filter-bar testid and fieldset group', () => {
    mountBar();
    const bar = screen.getByTestId('page-filter-bar');
    expect(bar).toBeVisible();
    expect(screen.getByRole('group', { name: '페이지 필터' })).toBe(bar);
    expect(screen.getByText('페이지 필터')).not.toHaveClass('sr-only');
    expect(screen.getByRole('combobox', { name: '느린 실행 기준' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '페이지 조건 기본값' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '페이지 필터 접기' })).toBeInTheDocument();
    expect(document.activeElement).toBe(document.body);

    render(<PageFilterBar label="레일 필터" orientation="column" fields={[{ kind: 'text', key: 'actor', label: 'Actor', value: '', onValueChange: vi.fn() }]} />);
    expect(screen.getAllByTestId('page-filter-bar')).toHaveLength(2);
  });

  it('collapses to the full summary, removes the inputs, and hands focus to the expand button', () => {
    mountBar();
    const bar = screen.getByTestId('page-filter-bar');
    fireEvent.click(screen.getByRole('button', { name: '페이지 필터 접기' }));

    const expand = screen.getByRole('button', { name: '페이지 필터 펼치기' });
    expect(expand).toHaveFocus();
    expect(screen.getByTestId('page-filter-bar')).toBe(bar);
    expect(screen.getByText('페이지 필터')).toHaveClass('sr-only');
    expect(screen.queryByRole('combobox', { name: '느린 실행 기준' })).toBeNull();
    expect(screen.queryByRole('searchbox', { name: '검색' })).toBeNull();
    const summary = document.getElementById(expand.getAttribute('aria-describedby')!);
    expect(summary).toHaveTextContent('집계');
    expect(summary).toHaveTextContent('시간');
    expect(summary).toHaveTextContent('느린 실행 기준');
    expect(summary).toHaveTextContent('≥ P95');
    expect(summary).toHaveTextContent('정렬');
    expect(summary).toHaveTextContent('사이클타임 내림차순');
    expect(storage.get('platform:page-filter-collapsed:cycle-time')).toBe('true');

    fireEvent.click(expand);
    expect(screen.getByRole('button', { name: '페이지 필터 접기' })).toHaveFocus();
    expect(screen.getByRole('combobox', { name: '느린 실행 기준' })).toBeInTheDocument();
  });

  it.each([
    { collapsed: false, toggleName: '페이지 필터 접기', expanded: 'true' },
    { collapsed: true, toggleName: '페이지 필터 펼치기', expanded: 'false' },
  ])('declares aria-expanded="$expanded" on "$toggleName" and points aria-controls at the input panel', ({ collapsed, toggleName, expanded }) => {
    if (collapsed) storage.set('platform:page-filter-collapsed:cycle-time', 'true');
    mountBar();
    const toggle = screen.getByRole('button', { name: toggleName });
    expect(toggle).toHaveAttribute('aria-expanded', expanded);
    const panelId = toggle.getAttribute('aria-controls');
    expect(panelId).toBeTruthy();
    if (collapsed) {
      expect(document.getElementById(panelId!)).toBeNull();
      expect(screen.queryByRole('combobox', { name: '느린 실행 기준' })).toBeNull();
    } else {
      const panel = document.getElementById(panelId!);
      expect(panel).not.toBeNull();
      expect(panel!.contains(screen.getByRole('combobox', { name: '느린 실행 기준' }))).toBe(true);
    }
  });

  it('restores the collapsed preference across remount', () => {
    const view = mountBar();
    fireEvent.click(screen.getByRole('button', { name: '페이지 필터 접기' }));
    view.unmount();

    mountBar();
    expect(screen.getByRole('button', { name: '페이지 필터 펼치기' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: '느린 실행 기준' })).toBeNull();
  });

  it('re-reads the stored preference when preferenceKey changes', () => {
    const view = render(<I18nProvider><Harness preferenceKey="cycle-time" /></I18nProvider>);
    fireEvent.click(screen.getByRole('button', { name: '페이지 필터 접기' }));
    view.rerender(<I18nProvider><Harness preferenceKey="other-menu" /></I18nProvider>);

    expect(screen.getByRole('button', { name: '페이지 필터 접기' })).toBeInTheDocument();
    expect(storage.get('platform:page-filter-collapsed:cycle-time')).toBe('true');
    expect(storage.has('platform:page-filter-collapsed:other-menu')).toBe(false);
  });

  it('keeps the collapsed state when a collapsedAction fires', () => {
    const onReset = vi.fn();
    storage.set('platform:page-filter-collapsed:cycle-time', 'true');
    mountBar({ ...collapsibleProps, collapsedActions: <button type="button" onClick={onReset}>페이지 조건 기본값</button> });

    fireEvent.click(screen.getByRole('button', { name: '페이지 조건 기본값' }));
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: '페이지 필터 펼치기' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: '느린 실행 기준' })).toBeNull();
  });

  it.each(['getItem', 'setItem'] as const)('stays usable when localStorage.%s throws', method => {
    vi.stubGlobal('localStorage', {
      getItem: method === 'getItem' ? () => { throw new DOMException('blocked'); } : (key: string) => storage.get(key) ?? null,
      setItem: method === 'setItem' ? () => { throw new DOMException('blocked'); } : (key: string, value: string) => { storage.set(key, value); },
      removeItem: (key: string) => storage.delete(key),
    });
    mountBar();
    fireEvent.click(screen.getByRole('button', { name: '페이지 필터 접기' }));
    expect(screen.getByRole('button', { name: '페이지 필터 펼치기' })).toHaveFocus();
  });

  it('runs the collapsible row when a column orientation is wrongly passed (the union rejects the combination at type level)', () => {
    render(<I18nProvider><PageFilterBar
      {...collapsibleProps}
      // @ts-expect-error — column rails own their own collapse; collapsible is row-only
      orientation="column"
    /></I18nProvider>);

    expect(screen.getByTestId('page-filter-bar')).not.toHaveClass('w-full');
    expect(screen.getByRole('combobox', { name: '느린 실행 기준' })).toBeInTheDocument();
  });

  it('never truncates: a long value keeps its full text and the toggle stays a plain button', () => {
    const longValue = 'VERY-LONG-EQUIPMENT-IDENTIFIER-'.repeat(5);
    storage.set('platform:page-filter-collapsed:cycle-time', 'true');
    mountBar({ ...collapsibleProps, summaryItems: [{ key: 'q', label: '검색', value: longValue }] });

    expect(screen.getByText(longValue)).toBeInTheDocument();
    expect(screen.getByText(longValue)).not.toHaveClass('truncate');
    expect(screen.getByRole('button', { name: '페이지 필터 펼치기' })).not.toHaveAttribute('title');
  });

  it('marks unapplied changes at the end of the collapsed summary', () => {
    storage.set('platform:page-filter-collapsed:cycle-time', 'true');
    mountBar({ ...collapsibleProps, hasPendingChanges: true });

    const summary = document.getElementById(screen.getByRole('button', { name: '페이지 필터 펼치기' }).getAttribute('aria-describedby')!);
    expect(summary).toHaveTextContent('미적용 변경 있음');
    expect(screen.getByTestId('page-filter-bar').querySelector('[aria-live="polite"]')!.textContent).toContain('미적용 변경 있음');
  });

  it('announces collapsed-summary changes through an always mounted polite live region', () => {
    mountBar();
    const live = screen.getByTestId('page-filter-bar').querySelector('[aria-live="polite"]');
    expect(live).not.toBeNull();
    expect(live!.textContent).toBe('');

    fireEvent.click(screen.getByRole('button', { name: '페이지 필터 접기' }));
    expect(live!.textContent).toContain('느린 실행 기준 ≥ P95');
  });
});
