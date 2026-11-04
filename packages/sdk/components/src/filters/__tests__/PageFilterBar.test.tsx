import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@ap/kernel';
import { PageFilterBar, type PageFilterBarProps } from '../../index';

const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
beforeAll(() => { HTMLElement.prototype.scrollIntoView = vi.fn(); });
afterAll(() => {
  if (originalScrollIntoView) HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  else delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
});
afterEach(cleanup);

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

    render(<I18nProvider><PageFilterBar {...collapsibleProps} label="두 번째 필터" preferenceKey="other-menu" /></I18nProvider>);
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
      const panel = document.getElementById(panelId!);
      expect(panel).not.toBeNull();
      expect(panel).toHaveAttribute('hidden');
      expect(screen.queryByRole('combobox', { name: '느린 실행 기준' })).toBeNull();
      expect(screen.queryByRole('searchbox', { name: '검색' })).toBeNull();
    } else {
      const panel = document.getElementById(panelId!);
      expect(panel).not.toBeNull();
      expect(panel).not.toHaveAttribute('hidden');
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

  it('has no `orientation` prop any more (the column rail form is removed, node 1217f)', () => {
    // @ts-expect-error — orientation was only for the removed filter rail
    const rejected: PageFilterBarProps = { ...collapsibleProps, orientation: 'column' };
    expect(rejected.collapsible).toBe(true);
  });

  it('keeps every summary value as DOM text (no truncate class or title); layout clipping is covered by E2E (#278)', () => {
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
  });

  it('keeps the live region silent on toggles and announces only real summary changes while collapsed', () => {
    const view = mountBar();
    const live = () => screen.getByTestId('page-filter-bar').querySelector('[aria-live="polite"]')!;
    expect(live().textContent).toBe('');

    fireEvent.click(screen.getByRole('button', { name: '페이지 필터 접기' }));
    expect(live().textContent).toBe('');

    view.rerender(<I18nProvider><PageFilterBar {...collapsibleProps} summaryItems={[{ key: 'percentile', label: '느린 실행 기준', value: '≥ P50' }]} /></I18nProvider>);
    expect(live().textContent).toContain('느린 실행 기준 ≥ P50');

    view.rerender(<I18nProvider><PageFilterBar {...collapsibleProps} summaryItems={[{ key: 'percentile', label: '느린 실행 기준', value: '≥ P50' }]} /></I18nProvider>);
    expect(live().textContent).toContain('느린 실행 기준 ≥ P50');

    fireEvent.click(screen.getByRole('button', { name: '페이지 필터 펼치기' }));
    expect(live().textContent).toBe('');
    fireEvent.click(screen.getByRole('button', { name: '페이지 필터 접기' }));
    expect(live().textContent).toBe('');
  });

  it('focuses text controls and Select triggers when their visible labels are clicked, without opening the Select', async () => {
    mountBar();

    const search = screen.getByRole('searchbox', { name: '검색' });
    const searchLabel = screen.getByText('검색') as HTMLLabelElement;
    expect(searchLabel.control).toBe(search);
    searchLabel.click();
    expect(search).toHaveFocus();

    const percentile = screen.getByRole('combobox', { name: '느린 실행 기준' });
    const percentileLabel = screen.getByText('느린 실행 기준') as HTMLLabelElement;
    expect(percentileLabel.control).toBe(percentile);
    const notPrevented = fireEvent.click(percentileLabel);
    expect(notPrevented).toBe(false);
    expect(percentile).toHaveFocus();
    expect(percentile).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('the bar has no form of its own, so a draft Enter never dispatches an apply', () => {
    mountBar();
    const search = screen.getByRole('searchbox', { name: '검색' });
    fireEvent.change(search, { target: { value: 'x' } });
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(document.querySelector('form')).toBeNull();
  });

  it('keeps the original DOM when applied chips are absent or empty', () => {
    const view = mountBar();
    const bar = screen.getByTestId('page-filter-bar');
    const before = bar.outerHTML;
    expect([...bar.children].map(child => child.tagName)).toEqual(['LEGEND', 'DIV', 'DIV']);
    view.rerender(<I18nProvider><PageFilterBar {...collapsibleProps} appliedChips={[]} /></I18nProvider>);
    expect(bar.outerHTML).toBe(before);
    expect(screen.queryByRole('group', { name: '적용된 조건' })).toBeNull();
  });

  it.each([false, true])('shows applied parameters and removable narrowing on one row (collapsed=%s)', collapsed => {
    if (collapsed) storage.set('platform:page-filter-collapsed:cycle-time', 'true');
    const onClear = vi.fn();
    mountBar({ ...collapsibleProps, appliedChips: [
      { key: 'grain', label: '집계', value: '시간' },
      { key: 'bucket', label: '버킷', value: '2026-09-26 05:00 → 06:00', onClear, clearLabel: '버킷 필터 해제' },
    ] });
    const row = screen.getByRole('group', { name: '적용된 조건' });
    expect(row).toBeVisible();
    expect(within(row).getByText('적용됨')).toBeInTheDocument();
    expect(within(row).getByRole('group', { name: '집계 시간' })).toHaveClass('h-6', 'rounded-md', 'border-border-subtle', 'bg-accent-primary-soft');
    expect(within(row).getAllByRole('button')).toHaveLength(1);
    fireEvent.click(within(row).getByRole('button', { name: '버킷 필터 해제' }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('caps only the value, with the complete text in the title and accessible name', () => {
    const value = 'LONG-BUCKET-VALUE-'.repeat(8);
    mountBar({ ...collapsibleProps, appliedChips: [{ key: 'bucket', label: '버킷', value }] });
    const chip = screen.getByRole('group', { name: `버킷 ${value}` });
    expect(chip).toHaveAttribute('title', `버킷 ${value}`);
    expect(within(chip).getByText(value)).toHaveClass('max-w-[28ch]', 'truncate');
    expect(within(chip).getByText('버킷')).toHaveClass('shrink-0');
  });

  it('accepts a title and supplies a localized clear name when none is provided', () => {
    mountBar({ ...collapsibleProps, appliedChips: [{ key: 'bucket', label: '버킷', value: '전체 값', title: '전체 버킷 범위', onClear: vi.fn() }] });
    expect(screen.getByRole('group', { name: '버킷 전체 값' })).toHaveAttribute('title', '전체 버킷 범위');
    expect(screen.getByRole('button', { name: '버킷 필터 지우기' })).toBeInTheDocument();
  });

  it('localizes the applied row and default clear name in English', () => {
    storage.set('platform:lang', 'en');
    mountBar({ ...collapsibleProps, appliedChips: [{ key: 'bucket', label: 'Bucket', value: 'full value', onClear: vi.fn() }] });
    expect(within(screen.getByRole('group', { name: 'Applied conditions' })).getByText('Applied')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear Bucket filter' })).toBeInTheDocument();
  });

  it.each([false, true])('keeps keyboard focus on the next clear action, then the bar toggle (collapsed=%s)', async collapsed => {
    if (collapsed) storage.set('platform:page-filter-collapsed:cycle-time', 'true');
    function ClearHarness() {
      const [bucket, setBucket] = useState(true);
      const [bin, setBin] = useState(true);
      return <PageFilterBar {...collapsibleProps} appliedChips={[
        { key: 'grain', label: '집계', value: '시간' },
        ...(bucket ? [{ key: 'bucket', label: '버킷', value: '선택', onClear: () => setBucket(false), clearLabel: '버킷 필터 해제' }] : []),
        ...(bin ? [{ key: 'bin', label: '분포 구간', value: '45-60', onClear: () => setBin(false), clearLabel: '분포 필터 해제' }] : []),
      ]} />;
    }
    const user = userEvent.setup();
    render(<I18nProvider><ClearHarness /></I18nProvider>);
    screen.getByRole('button', { name: '버킷 필터 해제' }).focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: '분포 필터 해제' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: collapsed ? '페이지 필터 펼치기' : '페이지 필터 접기' })).toHaveFocus();
  });

  it.each([false, true])('tabs through the bar before the clear buttons, skipping fixed chips (collapsed=%s)', async collapsed => {
    if (collapsed) storage.set('platform:page-filter-collapsed:cycle-time', 'true');
    const user = userEvent.setup();
    mountBar({ ...collapsibleProps, appliedChips: [
      { key: 'grain', label: '집계', value: '시간' },
      { key: 'bucket', label: '버킷', value: '선택', onClear: vi.fn(), clearLabel: '버킷 필터 해제' },
      { key: 'bin', label: '분포 구간', value: '45-60', onClear: vi.fn(), clearLabel: '분포 필터 해제' },
    ] });
    const stops = collapsed
      ? [screen.getByRole('button', { name: '페이지 필터 펼치기' }), screen.getByRole('button', { name: '페이지 조건 기본값' })]
      : [screen.getByRole('combobox', { name: '느린 실행 기준' }), screen.getByRole('searchbox', { name: '검색' }), screen.getByRole('button', { name: '페이지 조건 기본값' }), screen.getByRole('button', { name: '페이지 필터 접기' })];
    stops.push(screen.getByRole('button', { name: '버킷 필터 해제' }), screen.getByRole('button', { name: '분포 필터 해제' }));
    for (const stop of stops) { await user.tab(); expect(stop).toHaveFocus(); }
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: '버킷 필터 해제' })).toHaveFocus();
  });
});
