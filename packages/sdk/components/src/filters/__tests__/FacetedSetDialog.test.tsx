import { useState } from 'react';
import { act, waitFor, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { I18nProvider } from '@ap/kernel';
import { FacetedSetDialog } from '../FacetedSetDialog';

const facets = [{ id: 'color', label: 'Color' }, { id: 'size', label: 'Size' }];
const items = [
  { id: 'one', facets: { color: 'red', size: 'S' } },
  { id: 'two', facets: { color: 'blue', size: 'L' } },
];
Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, writable: true, value() {} });
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) { return this.hasAttribute('data-faceted-results') ? 360 : 36; });
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(1100);
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(1_080_000);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(360);
  vi.spyOn(HTMLElement.prototype, 'scrollTo').mockImplementation(function (this: HTMLElement, options: ScrollToOptions | number, y?: number) {
    const top = typeof options === 'object' ? options.top ?? 0 : y ?? 0;
    if (this.scrollTop === top) return;
    this.scrollTop = top; this.dispatchEvent(new Event('scroll'));
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('opens absent facets with all values checked and applies universe minus the unchecked value without Search', () => {
  const apply = vi.fn();
  render(<I18nProvider><FacetedSetDialog open onOpenChange={vi.fn()} title="Choose" facets={facets} items={items} value={{ rule: {}, fixed: null }} onApply={apply} /></I18nProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Color 전체' }));
  const color = within(screen.getByRole('group', { name: 'Color' }));
  expect(color.getByRole('checkbox', { name: '전체' })).toBeChecked();
  expect(color.getByRole('checkbox', { name: 'red' })).toBeChecked();
  expect(color.getByRole('checkbox', { name: 'blue' })).toBeChecked();
  fireEvent.click(color.getByRole('checkbox', { name: 'red' }));
  expect(color.getByRole('checkbox', { name: '전체' })).toHaveAttribute('aria-checked', 'mixed');
  fireEvent.click(screen.getByRole('button', { name: '조건 적용 · 1' }));
  expect(apply).toHaveBeenCalledExactlyOnceWith({ rule: { color: ['blue'] }, fixed: null });
});
it('keeps only one value through a keyboard-reachable action', async () => {
  const apply = vi.fn(); const user = userEvent.setup();
  render(<I18nProvider><FacetedSetDialog open onOpenChange={vi.fn()} title="Choose" facets={facets} items={items} value={{ rule: {}, fixed: null }} onApply={apply} /></I18nProvider>);
  await user.click(screen.getByRole('button', { name: 'Color 전체' }));
  const red = screen.getByRole('checkbox', { name: 'red' });
  red.focus();
  await user.tab();
  expect(screen.getByRole('button', { name: 'red만 남기기' })).toHaveFocus();
  await user.keyboard('{Enter}');
  expect(red).toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'blue' })).not.toBeChecked();
  await user.click(screen.getByRole('button', { name: '조건 적용 · 1' }));
  expect(apply).toHaveBeenCalledExactlyOnceWith({ rule: { color: ['red'] }, fixed: null });
});
it('uses the whole indexed universe and retained picks even when cross-counts are zero', () => {
  const apply = vi.fn();
  render(<I18nProvider><FacetedSetDialog open onOpenChange={vi.fn()} title="Choose" facets={facets} items={items} value={{ rule: { color: ['red', 'blue', 'gone'], size: ['S'] }, fixed: null }} onApply={apply} /></I18nProvider>);
  expect(screen.getByRole('checkbox', { name: 'blue' })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'blue' }).parentElement).toHaveTextContent('blue0');
  expect(screen.getByRole('checkbox', { name: 'gone' })).toBeChecked();
  fireEvent.click(screen.getByRole('checkbox', { name: 'red' }));
  fireEvent.click(screen.getByRole('button', { name: '조건 적용 · 0' }));
  expect(apply).toHaveBeenCalledExactlyOnceWith({ rule: { color: ['blue', 'gone'], size: ['S'] }, fixed: null });
});
it('normalizes opening all-arrays for save and apply without changing the caller value', async () => {
  const apply = vi.fn(); const save = vi.fn().mockResolvedValue(undefined);
  const value = { rule: { color: ['blue', 'red', 'red'] }, fixed: null };
  render(<I18nProvider><FacetedSetDialog open onOpenChange={vi.fn()} title="Choose" facets={facets} items={items} value={value} onApply={apply}
    save={{ shareOptions: [{ value: 'private', label: 'Private' }], defaultShare: 'private', onSave: save }} /></I18nProvider>);
  expect(screen.getByRole('button', { name: '조회' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '그룹으로 저장' }));
  fireEvent.change(screen.getByRole('textbox', { name: '이름' }), { target: { value: 'All' } });
  await act(async () => fireEvent.click(screen.getByRole('button', { name: '저장' })));
  expect(save).toHaveBeenCalledExactlyOnceWith({ name: 'All', share: 'private', value: { rule: {}, fixed: null } });
  fireEvent.click(screen.getByRole('button', { name: '조건 적용 · 2' }));
  expect(apply).toHaveBeenCalledExactlyOnceWith({ rule: {}, fixed: null });
  expect(value).toEqual({ rule: { color: ['blue', 'red', 'red'] }, fixed: null });
});
it('can clear and restore all for a facet named __proto__', () => {
  render(<I18nProvider><FacetedSetDialog open onOpenChange={vi.fn()} title="Choose" facets={[{ id: '__proto__', label: 'Prototype' }]} items={[{ id: 'one', facets: { ['__proto__']: 'x' } }]} value={{ rule: {}, fixed: null }} onApply={vi.fn()} /></I18nProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Prototype 전체' }));
  fireEvent.click(screen.getByRole('checkbox', { name: '전체' }));
  expect(screen.getByRole('checkbox', { name: 'x' })).not.toBeChecked();
  expect(screen.getByRole('button', { name: '조건 적용 · 0' })).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox', { name: '전체' }));
  expect(screen.getByRole('checkbox', { name: 'x' })).toBeChecked();
  expect(screen.getByRole('button', { name: '조건 적용 · 1' })).toBeEnabled();
});
it.each(['header', 'last value'])('normalizes all picks back to an absent key through %s', method => {
  const apply = vi.fn();
  render(<I18nProvider><FacetedSetDialog open onOpenChange={vi.fn()} title="Choose" facets={facets} items={items} value={{ rule: { color: ['red'] }, fixed: null }} onApply={apply} /></I18nProvider>);
  const color = within(screen.getByRole('group', { name: 'Color' }));
  fireEvent.click(color.getByRole('checkbox', { name: method === 'header' ? '전체' : 'blue' }));
  expect(screen.getByRole('button', { name: 'Color 전체' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '조건 적용 · 2' }));
  expect(apply).toHaveBeenCalledExactlyOnceWith({ rule: {}, fixed: null });
});
it.each(['header', 'last value'])('blocks apply and save for none selected through %s', method => {
  const apply = vi.fn(); const save = vi.fn();
  render(<I18nProvider><FacetedSetDialog open onOpenChange={vi.fn()} title="Choose" facets={facets} items={items} value={{ rule: { color: ['red'] }, fixed: null }} onApply={apply}
    save={{ shareOptions: [{ value: 'private', label: 'Private' }], defaultShare: 'private', onSave: save }} /></I18nProvider>);
  fireEvent.click(screen.getByRole('button', { name: '그룹으로 저장' }));
  fireEvent.change(screen.getByRole('textbox', { name: '이름' }), { target: { value: 'None' } });
  const color = within(screen.getByRole('group', { name: 'Color' }));
  if (method === 'header') {
    fireEvent.click(color.getByRole('checkbox', { name: '전체' }));
    fireEvent.click(color.getByRole('checkbox', { name: '전체' }));
  } else fireEvent.click(color.getByRole('checkbox', { name: 'red' }));
  expect(screen.getByRole('button', { name: 'Color 0' })).toBeVisible();
  expect(color.getByRole('checkbox', { name: '전체' })).not.toBeChecked();
  expect(screen.getByText('축마다 값을 하나 이상 고르세요')).toBeVisible();
  expect(screen.getByRole('button', { name: '조건 적용 · 0' })).toBeDisabled();
  expect(screen.getByRole('button', { name: '저장' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '조건 적용 · 0' }));
  fireEvent.submit(screen.getByRole('button', { name: '저장' }).closest('form')!);
  expect(apply).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '조회' }));
  expect(screen.getByText('결과 0')).toBeVisible();
});
it('keeps queried results and ID suggestions until Search while counts and apply stay live', () => {
  const apply = vi.fn();
  render(<I18nProvider><FacetedSetDialog open onOpenChange={vi.fn()} title="Choose" facets={facets} items={items} value={{ rule: {}, fixed: null }} onApply={apply} /></I18nProvider>);
  expect(screen.getByRole('button', { name: '조회' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Color 전체' }));
  fireEvent.click(screen.getByRole('button', { name: 'red만 남기기' }));
  fireEvent.click(screen.getByRole('button', { name: 'Size 전체' }));
  expect(screen.getByRole('checkbox', { name: 'L' }).parentElement).toHaveTextContent('L0');
  expect(screen.getByText('결과 2')).toBeVisible();
  expect(screen.getByText('조건 · 지금 1')).toBeVisible();
  expect(screen.getByRole('table')).toHaveAttribute('aria-rowcount', '3');
  expect(screen.getByRole('table')).toHaveAttribute('data-stale', 'true');
  expect(screen.getByText('조건이 바뀌었습니다 — 조회를 누르세요')).toBeVisible();
  expect(screen.queryByRole('alert')).toBeNull();
  fireEvent.change(screen.getByRole('textbox', { name: '값 또는 항목 ID 검색' }), { target: { value: 'Size' } });
  expect(screen.getByRole('button', { name: 'Size · L (0)' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Size · S (1)' })).toBeVisible();
  fireEvent.change(screen.getByRole('textbox', { name: '값 또는 항목 ID 검색' }), { target: { value: 'two' } });
  expect(screen.getByRole('button', { name: '항목 · two' })).toBeVisible();
  fireEvent.click(screen.getByRole('checkbox', { name: 'two 선택' }));
  expect(screen.getByText('고정 1')).toBeVisible();
  expect(screen.queryByText('조건 밖 1')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '조회' }));
  expect(screen.getByText('결과 1')).toBeVisible();
  expect(screen.getByRole('table')).toHaveAttribute('aria-rowcount', '2');
  expect(screen.getByRole('table')).toHaveAttribute('data-stale', 'false');
  expect(screen.queryByText('조건이 바뀌었습니다 — 조회를 누르세요')).toBeNull();
  expect(screen.getByRole('button', { name: '조회' })).toBeDisabled();
  expect(screen.queryByRole('button', { name: '항목 · two' })).toBeNull();
  expect(screen.getByRole('checkbox', { name: '조건 밖 two 선택' })).toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: '고정 1 적용' }));
  expect(apply).toHaveBeenCalledExactlyOnceWith({ rule: { color: ['red'] }, fixed: ['two'] });
});
it('clears the stale state when the draft returns to the queried rule without Search', () => {
  render(<I18nProvider><FacetedSetDialog open onOpenChange={vi.fn()} title="Choose" facets={facets} items={items} value={{ rule: { color: ['red'] }, fixed: null }} onApply={vi.fn()} /></I18nProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'blue만 남기기' }));
  expect(screen.getByRole('button', { name: '조회' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'red만 남기기' }));
  expect(screen.getByRole('button', { name: '조회' })).toBeDisabled();
  expect(screen.queryByText('조건이 바뀌었습니다 — 조회를 누르세요')).toBeNull();
  expect(screen.getByText('결과 1')).toBeVisible();
  expect(screen.getByRole('table')).toHaveAttribute('data-stale', 'false');
});
it('ignores fixed IDs and supports rule-only apply and save without a selection column', async () => {
  const apply = vi.fn(); const save = vi.fn().mockResolvedValue(undefined);
  render(<I18nProvider><FacetedSetDialog open allowFixed={false} onOpenChange={vi.fn()} title="Choose" facets={facets} items={items} value={{ rule: { color: ['red'] }, fixed: ['two', 'missing'] }} onApply={apply}
    save={{ shareOptions: [{ value: 'private', label: 'Private' }], defaultShare: 'private', onSave: save }} /></I18nProvider>);
  const table = within(screen.getByRole('table'));
  expect(table.queryByRole('checkbox')).toBeNull();
  expect(table.queryByRole('columnheader', { name: '선택' })).toBeNull();
  expect(screen.getByRole('table')).toHaveAttribute('aria-colcount', '3');
  expect(screen.queryByText(/조건 밖/)).toBeNull();
  expect(screen.queryByText(/고정/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '그룹으로 저장' }));
  fireEvent.change(screen.getByRole('textbox', { name: '이름' }), { target: { value: 'Rule only' } });
  await act(async () => fireEvent.click(screen.getByRole('button', { name: '저장' })));
  expect(save).toHaveBeenCalledExactlyOnceWith({ name: 'Rule only', share: 'private', value: { rule: { color: ['red'] }, fixed: null } });
  fireEvent.click(screen.getByRole('button', { name: '조건 적용 · 1' }));
  expect(apply).toHaveBeenCalledExactlyOnceWith({ rule: { color: ['red'] }, fixed: null });
});
it('expands a facet, picks a value and applies the draft once', () => {
  const onApply = vi.fn(); const onOpenChange = vi.fn();
  render(<I18nProvider><FacetedSetDialog open onOpenChange={onOpenChange} title="Choose" facets={facets} items={items} value={{ rule: {}, fixed: null }} onApply={onApply} /></I18nProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Color 전체' }));
  expect(screen.getByRole('button', { name: 'Color 전체' })).toHaveAttribute('aria-expanded', 'true');
  fireEvent.click(screen.getByRole('checkbox', { name: 'blue' }));
  fireEvent.click(screen.getByRole('button', { name: '조건 적용 · 1' }));
  expect(onApply).toHaveBeenCalledExactlyOnceWith({ rule: { color: ['red'] }, fixed: null });
  expect(onOpenChange).toHaveBeenCalledWith(false);
});

it('checks and unchecks rows without losing the rule, and preserves outside fixed IDs', () => {
  render(<I18nProvider><FacetedSetDialog open onOpenChange={vi.fn()} title="Choose" facets={facets} items={items} value={{ rule: {}, fixed: null }} onApply={vi.fn()} /></I18nProvider>);
  fireEvent.click(screen.getByRole('checkbox', { name: 'one 선택' }));
  expect(screen.getByRole('button', { name: '고정 1 적용' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Color 전체' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'red' }));
  expect(screen.queryByText('조건 밖 1')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '조회' }));
  expect(screen.getByText('조건 밖 1')).toBeVisible();
  expect(screen.getByRole('checkbox', { name: '조건 밖 one 선택' })).toBeChecked();
  fireEvent.click(screen.getByRole('checkbox', { name: '조건 밖 one 선택' }));
  expect(screen.getByText('조건 · 지금 1')).toBeVisible();
  expect(screen.getByRole('button', { name: '조건 적용 · 1' })).toBeEnabled();
});

it('typing alone leaves the draft unchanged; picking a suggestion adds and expands a value', () => {
  const apply = vi.fn();
  render(<I18nProvider><FacetedSetDialog open onOpenChange={vi.fn()} title="Choose" facets={facets} items={items} value={{ rule: {}, fixed: null }} onApply={apply} /></I18nProvider>);
  fireEvent.change(screen.getByRole('textbox', { name: '값 또는 항목 ID 검색' }), { target: { value: 'red' } });
  expect(screen.getByRole('button', { name: '조건 적용 · 2' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Color · red (1)' }));
  expect(screen.getByRole('checkbox', { name: 'red' })).toBeChecked();
  expect(screen.getByRole('button', { name: 'Color 1' })).toHaveAttribute('aria-expanded', 'true');
  expect(apply).not.toHaveBeenCalled();
});

it('cross-narrows counts, leaves zero values visible and allows zero-result apply', () => {
  const apply = vi.fn();
  render(<I18nProvider><FacetedSetDialog open onOpenChange={vi.fn()} title="Choose" facets={facets} items={items} value={{ rule: { color: ['red'], size: ['L'] }, fixed: null }} onApply={apply} /></I18nProvider>);
  expect(screen.getByRole('checkbox', { name: 'red' }).parentElement).toHaveTextContent('red0');
  expect(screen.getByRole('checkbox', { name: 'blue' }).parentElement).toHaveTextContent('blue1');
  expect(screen.getByText('조건에 맞는 항목이 없습니다.')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '조건 적용 · 0' }));
  expect(apply).toHaveBeenCalledWith({ rule: { color: ['red'], size: ['L'] }, fixed: null });
});

it('saves the named draft without applying, shows pending/error, keeps input and retries', async () => {
  let reject!: (reason: Error) => void;
  const save = vi.fn().mockImplementationOnce(() => new Promise<void>((_resolve, fail) => { reject = fail; })).mockResolvedValueOnce(undefined);
  const apply = vi.fn(); const close = vi.fn();
  render(<I18nProvider><FacetedSetDialog open onOpenChange={close} title="Choose" facets={facets} items={items} value={{ rule: {}, fixed: ['one'] }} onApply={apply}
    save={{ shareOptions: [{ value: 'private', label: 'Private' }, { value: 'team', label: 'Team' }], defaultShare: 'private', author: 'Caller', onSave: save }} /></I18nProvider>);
  fireEvent.click(screen.getByRole('button', { name: '그룹으로 저장' }));
  fireEvent.change(screen.getByRole('textbox', { name: '이름' }), { target: { value: 'My set' } });
  fireEvent.click(screen.getByRole('radio', { name: 'Team' }));
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  expect(screen.getByRole('button', { name: '저장 중…' })).toBeDisabled();
  expect(save).toHaveBeenCalledExactlyOnceWith({ name: 'My set', share: 'team', value: { rule: {}, fixed: ['one'] } });
  await act(async () => reject(new Error('transport')));
  expect(screen.getByRole('alert')).toHaveTextContent('저장하지 못했습니다');
  expect(screen.getByRole('textbox', { name: '이름' })).toHaveValue('My set');
  await act(async () => fireEvent.click(screen.getByRole('button', { name: '저장' })));
  expect(screen.getByText('저장했습니다. 적용하려면 적용 버튼을 누르세요.')).toBeVisible();
  expect(apply).not.toHaveBeenCalled(); expect(close).not.toHaveBeenCalled();
});

it.each(['loading', 'error'] as const)('does not present counts or allow apply while %s', status => {
  const retry = vi.fn();
  render(<I18nProvider><FacetedSetDialog open onOpenChange={vi.fn()} title="Choose" facets={facets} items={[]} value={{ rule: {}, fixed: null }} status={status} onRetry={retry} onApply={vi.fn()} /></I18nProvider>);
  expect(screen.getByRole('button', { name: '적용' })).toBeDisabled();
  expect(screen.queryByText(/조건 · 지금/)).toBeNull();
  expect(screen.queryByRole('table')).toBeNull();
  if (status === 'error') { fireEvent.click(screen.getByRole('button', { name: '다시 시도' })); expect(retry).toHaveBeenCalledOnce(); }
  else expect(screen.getByRole('status', { name: '불러오는 중' })).toBeVisible();
});

it.each(['Escape', '취소'])('discards changes on %s and resets to the initial value on reopening', async action => {
  const apply = vi.fn();
  function Controlled() {
    const [open, setOpen] = useState(false);
    return <><button onClick={() => setOpen(true)}>Open</button><FacetedSetDialog open={open} onOpenChange={setOpen} title="Choose" facets={facets} items={items} value={{ rule: {}, fixed: null }} onApply={apply} /></>;
  }
  render(<I18nProvider><Controlled /></I18nProvider>);
  const opener = screen.getByRole('button', { name: 'Open' });
  opener.focus(); fireEvent.click(opener);
  fireEvent.click(screen.getByRole('checkbox', { name: 'one 선택' }));
  if (action === 'Escape') fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
  else fireEvent.click(screen.getAllByRole('button', { name: '취소' })[0]);
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(opener).toHaveFocus();
  fireEvent.click(opener);
  expect(screen.getByRole('button', { name: '조건 적용 · 2' })).toBeEnabled();
  expect(apply).not.toHaveBeenCalled();
});

it('clears both picks and fixed IDs', () => {
  const apply = vi.fn();
  render(<I18nProvider><FacetedSetDialog open onOpenChange={vi.fn()} title="Choose" facets={facets} items={items} value={{ rule: { color: ['red'] }, fixed: ['two'] }} onApply={apply} /></I18nProvider>);
  fireEvent.click(screen.getByRole('button', { name: '모두 지우기' }));
  fireEvent.click(screen.getByRole('button', { name: '조건 적용 · 2' }));
  expect(apply).toHaveBeenCalledWith({ rule: {}, fixed: null });
});

it('renders a nonempty virtual window for 30,000 items, counts correctly and reveals an ID without checking it', async () => {
  const large = Array.from({ length: 30_000 }, (_, i) => ({ id: `item-${i}`, facets: { color: i % 2 ? 'blue' : 'red', size: i % 3 ? 'S' : 'L' } }));
  render(<I18nProvider><FacetedSetDialog open onOpenChange={vi.fn()} title="Choose" facets={facets} items={large} value={{ rule: { color: ['red'] }, fixed: null }} onApply={vi.fn()} /></I18nProvider>);
  expect(screen.getByRole('table')).toHaveAttribute('aria-rowcount', '15001');
  const rowCount = screen.getAllByRole('row').length;
  expect(rowCount).toBeGreaterThan(1); expect(rowCount).toBeLessThan(100);
  fireEvent.click(screen.getByRole('button', { name: 'Size 전체' }));
  expect(screen.getByRole('checkbox', { name: 'L' }).parentElement).toHaveTextContent('L5000');
  fireEvent.change(screen.getByRole('textbox', { name: '값 또는 항목 ID 검색' }), { target: { value: 'item-29998' } });
  fireEvent.click(screen.getByRole('button', { name: '항목 · item-29998' }));
  await waitFor(() => expect(screen.getByRole('row', { name: 'item-29998' })).toHaveFocus());
  expect(screen.getByRole('checkbox', { name: 'item-29998 선택' })).not.toBeChecked();
  expect(screen.getByRole('button', { name: '조건 적용 · 15000' })).toBeEnabled();
});

it('applies fixed IDs including missing and outside-rule IDs without replacing them', () => {
  const apply = vi.fn();
  render(<I18nProvider><FacetedSetDialog open onOpenChange={vi.fn()} title="Choose" facets={facets} items={items} value={{ rule: { color: ['red'] }, fixed: ['two', 'missing'] }} onApply={apply} /></I18nProvider>);
  fireEvent.click(screen.getByRole('button', { name: '고정 2 적용' }));
  expect(apply).toHaveBeenCalledExactlyOnceWith({ rule: { color: ['red'] }, fixed: ['two', 'missing'] });
});

it('returns from fixed to rule when the last checked result is unchecked', () => {
  render(<I18nProvider><FacetedSetDialog open onOpenChange={vi.fn()} title="Choose" facets={facets} items={items} value={{ rule: {}, fixed: null }} onApply={vi.fn()} /></I18nProvider>);
  fireEvent.click(screen.getByRole('checkbox', { name: 'one 선택' }));
  expect(screen.getByText('고정 1')).toBeVisible();
  fireEvent.click(screen.getByRole('checkbox', { name: 'one 선택' }));
  expect(screen.getByText('조건 · 지금 2')).toBeVisible();
});

it('accepts arbitrary facet IDs including names from Object.prototype', () => {
  const apply = vi.fn();
  render(<I18nProvider><FacetedSetDialog open onOpenChange={vi.fn()} title="Choose" facets={[{ id: 'constructor', label: 'Constructor' }]} items={[{ id: 'one', facets: { constructor: 'x' } }]} value={{ rule: {}, fixed: null }} onApply={apply} /></I18nProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Constructor 전체' }));
  fireEvent.click(screen.getByRole('button', { name: 'x만 남기기' }));
  fireEvent.click(screen.getByRole('button', { name: '조건 적용 · 1' }));
  expect(apply).toHaveBeenCalledWith({ rule: {}, fixed: null });
});
it.each([{ picks: ['red'], header: '1', count: 1 }, { picks: ['red', 'blue'], header: '전체', count: 2 }])('shows $header in a facet header without the item count formatter', ({ picks, header: text, count }) => {
  render(<I18nProvider><FacetedSetDialog open onOpenChange={() => {}} title="Choose" facets={facets} items={items} value={{ rule: { color: picks }, fixed: null }} onApply={() => {}} formatCount={(n) => `${n} items`} /></I18nProvider>);
  const header = screen.getByRole('button', { name: /^Color/ });
  expect(header).toHaveTextContent(new RegExp(`Color\\s*${text}$`));
  expect(header).not.toHaveTextContent('items');
  expect(screen.getByRole('button', { name: `조건 적용 · ${count} items` })).toBeEnabled();
});

it('shows the caller note and the error reason only when given', () => {
  const { rerender } = render(<I18nProvider><FacetedSetDialog open onOpenChange={vi.fn()} title="Choose" facets={facets} items={items} value={{ rule: {}, fixed: null }} onApply={vi.fn()} /></I18nProvider>);
  expect(screen.queryByText('Counts use current membership')).toBeNull();
  rerender(<I18nProvider><FacetedSetDialog open onOpenChange={vi.fn()} title="Choose" facets={facets} items={items} value={{ rule: {}, fixed: null }} onApply={vi.fn()} note="Counts use current membership" /></I18nProvider>);
  expect(screen.getByText('Counts use current membership')).toBeVisible();
  rerender(<I18nProvider><FacetedSetDialog open onOpenChange={vi.fn()} title="Choose" facets={facets} items={[]} value={{ rule: {}, fixed: null }} onApply={vi.fn()} status="error" errorDetail="port missing" /></I18nProvider>);
  expect(screen.getByRole('alert')).toHaveTextContent('port missing');
});
