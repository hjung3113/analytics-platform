import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { I18nProvider } from '@ap/kernel';
import { FacetedSetDialog } from '../FacetedSetDialog';

// #3199: «select all found» acts on the whole queried result (here 120 rows, of which the virtualizer renders a dozen).
const facets = [{ id: 'line', label: 'Line' }];
const makeItems = (inRule: number, outside: number) => [
  ...Array.from({ length: inRule }, (_, i) => ({ id: `eq-${String(i).padStart(5, '0')}`, facets: { line: 'L1' } })),
  ...Array.from({ length: outside }, (_, i) => ({ id: `ox-${i}`, facets: { line: 'L2' } })),
];
const items = makeItems(120, 5);
const rule = { line: ['L1'] };

Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, writable: true, value() {} });
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) { return this.hasAttribute('data-faceted-results') ? 360 : 36; });
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(1100);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(360);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const open = (props: Partial<Parameters<typeof FacetedSetDialog>[0]> = {}) => {
  const apply = vi.fn();
  render(<I18nProvider><FacetedSetDialog open onOpenChange={vi.fn()} title="Choose" facets={facets} items={items} value={{ rule, fixed: null }} onApply={apply} selectAllResults {...props} /></I18nProvider>);
  return apply;
};
const header = () => screen.getByRole('checkbox', { name: '조회된 항목 120 전체 선택' });

it('selects every found row in one action, rows outside the rendered window included, and applies them as fixed', () => {
  const apply = open();
  expect(screen.getAllByRole('row').length).toBeLessThan(40);
  expect(header()).not.toBeChecked();
  fireEvent.click(header());
  expect(header()).toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: '고정 120 적용' }));
  const fixed = apply.mock.calls[0]![0].fixed as string[];
  expect(new Set(fixed)).toEqual(new Set(items.slice(0, 120).map((item) => item.id)));
  expect(fixed).toContain('eq-00119');
});

it('shows some as mixed, completes a partial selection, then unselects only the found rows and keeps fixed IDs outside the rule', () => {
  const apply = open({ value: { rule, fixed: ['eq-00003', 'ox-1'] } });
  expect(header()).toHaveAttribute('aria-checked', 'mixed');
  fireEvent.click(header());
  expect(header()).toBeChecked();
  expect(screen.getByRole('button', { name: '고정 121 적용' })).toBeEnabled();
  fireEvent.click(header());
  expect(header()).not.toBeChecked();
  expect(screen.getByRole('checkbox', { name: '조건 밖 ox-1 선택' })).toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: '고정 1 적용' }));
  expect(apply).toHaveBeenCalledExactlyOnceWith({ rule, fixed: ['ox-1'] });
});

it('«clear found» removes only the found rows; with none selected it is disabled', () => {
  const apply = open({ value: { rule, fixed: ['eq-00010', 'eq-00100', 'ox-2'] } });
  const clear = screen.getByRole('button', { name: '조회된 항목 선택 해제' });
  fireEvent.click(clear);
  expect(clear).toBeDisabled();
  expect(header()).not.toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: '고정 1 적용' }));
  expect(apply).toHaveBeenCalledExactlyOnceWith({ rule, fixed: ['ox-2'] });
});

it('blocks bulk selection while the result is stale, so an old result is never selected', () => {
  open({ value: { rule, fixed: ['eq-00001'] } });
  fireEvent.click(within(screen.getByRole('group', { name: 'Line' })).getByRole('checkbox', { name: 'L2' }));
  expect(header()).toBeDisabled();
  expect(screen.getByRole('button', { name: '조회된 항목 선택 해제' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '조회' }));
  expect(screen.getByRole('checkbox', { name: '조회된 항목 125 전체 선택' })).toBeEnabled();
});

it('keeps the facet «All» and the result «select all found» apart, and is off by default', () => {
  open();
  expect(within(screen.getByRole('group', { name: 'Line' })).getByRole('checkbox', { name: '전체' })).toBeInTheDocument();
  expect(screen.getByText('전체 선택은 지금 조회된 결과를 고정 선택으로 담습니다. 조건이 바뀌어도 따라가려면 체크하지 않고 조건으로 적용하세요.')).toBeInTheDocument();
  cleanup();
  open({ selectAllResults: undefined });
  expect(screen.queryByRole('checkbox', { name: /전체 선택/ })).toBeNull();
  expect(screen.queryByRole('button', { name: '조회된 항목 선택 해제' })).toBeNull();
  expect(screen.getByRole('columnheader', { name: '선택' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '조건 적용 · 120' })).toBeEnabled();
});

it('selects and clears 30,000 found rows within a second each (measured, jsdom)', () => {
  const large = makeItems(30_000, 0);
  open({ items: large });
  const all = screen.getByRole('checkbox', { name: '조회된 항목 30000 전체 선택' });
  let started = performance.now();
  fireEvent.click(all);
  const select = performance.now() - started;
  expect(screen.getByRole('button', { name: '고정 30000 적용' })).toBeEnabled();
  started = performance.now();
  fireEvent.click(screen.getByRole('button', { name: '조회된 항목 선택 해제' }));
  const clear = performance.now() - started;
  expect(screen.getByRole('button', { name: '조건 적용 · 30000' })).toBeEnabled();
  console.info(`#3199 30k: select all ${select.toFixed(0)} ms, clear ${clear.toFixed(0)} ms`);
  expect(select).toBeLessThan(1000);
  expect(clear).toBeLessThan(1000);
});
