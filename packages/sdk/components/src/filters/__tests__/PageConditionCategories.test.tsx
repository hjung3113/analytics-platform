import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PageConditionCategory, PageConditions, PageConditionOptionsResponse } from '@ap/contracts';
import { decodePageConditions, I18nProvider, type PageConditionValues } from '@ap/kernel';
import { PageConditionCategories, type PageConditionCategoriesProps } from '../PageConditionCategories';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const text = (ko: string) => ({ ko, en: ko });
const options = [{ value: 'a', label: text('Alpha') }, { value: 'b', label: text('Beta') }];
const categories: PageConditionCategory[] = [
  { id: 'single', label: text('분류'), kind: { type: 'select', key: 'single', options: { static: options } } },
  { id: 'many', label: text('대상'), kind: { type: 'multi', key: 'many', options: { static: options } } },
  { id: 'query', label: text('검색'), kind: { type: 'search', key: 'query' } },
  { id: 'amount', label: text('수량'), kind: { type: 'range', key: 'amount', unit: text('개'), min: 0, max: 100, step: 1 } },
  { id: 'period', label: text('기간'), kind: { type: 'date', from: 'start', to: 'end' } },
  { id: 'checks', label: text('묶음'), kind: { type: 'groupedChecks', source: 'choices', lists: [
    { id: 'module', key: 'modules', label: text('Module') }, { id: 'motion', key: 'motions', label: text('Motion') },
  ] } },
];
const grouped = { groups: [{ id: 'g', label: text('Group'), lists: { module: [options[0]], motion: [options[1]] } }] };
function mount(props: Partial<PageConditionCategoriesProps> = {}) {
  const onChange = vi.fn();
  const view = render(<I18nProvider><PageConditionCategories declaration={{ categories }} values={{}} inputsKey="session:scope:1" onChange={onChange} loadOptions={async () => grouped} {...props} /></I18nProvider>);
  return { ...view, onChange };
}
function Controlled({ declaration = { categories }, initial = {}, ...props }: Partial<PageConditionCategoriesProps> & { initial?: PageConditionValues }) {
  const [values, setValues] = useState<PageConditionValues>(initial);
  return <I18nProvider><PageConditionCategories declaration={declaration} values={values} inputsKey="s:scope:1" loadOptions={async () => grouped}
    onChange={(id, next) => setValues(previous => {
      const copy = { ...previous };
      const category = declaration.categories.find(item => item.id === id)!;
      const keys = category.kind.type === 'date' ? [category.kind.from, category.kind.to] : category.kind.type === 'groupedChecks' ? category.kind.lists.map(list => list.key) : [category.kind.key];
      keys.forEach(key => { delete copy[key]; });
      return { ...copy, ...next };
    })} {...props} /></I18nProvider>;
}
const input = (name: string, value: string) => {
  fireEvent.change(screen.getByLabelText(name), { target: { value } });
  fireEvent.blur(screen.getByLabelText(name));
};
describe('PageConditionCategories', () => {
  it('selects a single option with the shared keyboard control and clears the category', async () => {
    const user = userEvent.setup();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
    render(<Controlled declaration={{ categories: [categories[0]] }} />);
    const select = screen.getByRole('combobox', { name: '분류' });
    select.focus();
    await user.keyboard('{ArrowDown}');
    await user.click(await screen.findByRole('option', { name: 'Beta' }));
    expect(select).toHaveTextContent('Beta');
    await user.click(screen.getByRole('button', { name: '분류 지우기' }));
    expect(select).not.toHaveTextContent('Beta');
  });
  it('uses keyboard checkboxes, shows explicit empty, and clear removes the key', async () => {
    const user = userEvent.setup();
    const { onChange } = mount({ declaration: { categories: [categories[1]] }, values: { many: ['a'] } });
    screen.getByRole('checkbox', { name: 'Alpha' }).focus();
    await user.keyboard(' ');
    expect(onChange).toHaveBeenLastCalledWith('many', { many: [] });
    cleanup();
    mount({ declaration: { categories: [categories[1]] }, values: decodePageConditions({ pageConditions: { categories: [categories[1]] } }, [['many', '~none']]).values });
    expect(screen.getByText('선택한 항목 없음')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '대상 지우기' }));
  });
  it('commits search on blur or Enter, never per keystroke, and clearing emits no constraint', () => {
    const { onChange, rerender } = mount({ declaration: { categories: [categories[2]] } });
    const box = screen.getByRole('searchbox', { name: '검색' });
    fireEvent.change(box, { target: { value: 'need' } });
    fireEvent.change(box, { target: { value: 'needle' } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith('query', { query: ['needle'] });
    rerender(<I18nProvider><PageConditionCategories declaration={{ categories: [categories[2]] }} values={{ query: ['needle'] }} inputsKey="session:scope:1" onChange={onChange} /></I18nProvider>);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } });
    fireEvent.blur(screen.getByRole('searchbox'));
    expect(onChange).toHaveBeenLastCalledWith('query', null);
  });
  it('says 제약 없음 for an absent key and 선택한 항목 없음 only for ~none', () => {
    mount({ declaration: { categories: [categories[1]] } });
    expect(screen.getByText('제약 없음')).toBeVisible();
    expect(screen.queryByText('0개 선택')).toBeNull();
    expect(screen.queryByText('선택한 항목 없음')).toBeNull();
  });
  it('edits open numeric bounds, respects unit/min/max/step and refuses reversed ranges', () => {
    const { onChange } = mount({ declaration: { categories: [categories[3]] } });
    input('수량 최소', '3');
    expect(onChange).toHaveBeenLastCalledWith('amount', { amount: { min: 3, max: null } });
    expect(screen.getByText('개')).toBeVisible();
    input('수량 최대', '101');
    expect(screen.getByLabelText('수량 최대')).toHaveAccessibleDescription(expect.stringContaining('0 ~ 100'));
    expect(onChange).toHaveBeenCalledTimes(1);
    cleanup();
    mount({ declaration: { categories: [categories[3]] }, values: { amount: { min: 5, max: null } } });
    input('수량 최대', '2');
    expect(screen.getByText('최소값은 최대값 이하여야 합니다.')).toBeVisible();
  });
  it('edits wall-clock seconds without timezone conversion and refuses reversed/invalid dates', () => {
    const { onChange } = mount({ declaration: { categories: [categories[4]] }, values: { start: ['2026-11-01T00:00:00'] } });
    input('기간 종료', '2026-11-02T12:30');
    expect(onChange).toHaveBeenLastCalledWith('period', { start: ['2026-11-01T00:00:00'], end: ['2026-11-02T12:30:00'] });
    input('기간 종료', '2026-10-01T12:30');
    expect(screen.getByText('시작은 종료보다 빨라야 합니다.')).toBeVisible();
    expect(onChange).toHaveBeenCalledTimes(1);
  });
  it('renders grouped sibling lists, keeps other list values and has no toggle announcements', async () => {
    const user = userEvent.setup();
    const { onChange, container } = mount({ declaration: { categories: [categories[5]] }, values: { motions: ['b'] } });
    const alpha = await screen.findByRole('checkbox', { name: 'Alpha' });
    alpha.focus();
    await user.keyboard(' ');
    expect(onChange).toHaveBeenLastCalledWith('checks', { motions: ['b'], modules: ['a'] });
    expect(screen.getByRole('group', { name: 'Module' })).toBeVisible();
    expect(screen.getByRole('group', { name: 'Motion' })).toBeVisible();
    expect(container.querySelector('[role="status"], [aria-live="polite"]')).toBeNull();
  });
  it.each(categories)('labels the $id category and its controls with accessible descriptions', async category => {
    const { container } = mount({ declaration: { categories: [{ ...category, disabled: { reason: text('조회 권한 없음') } }] } });
    if (category.kind.type === 'groupedChecks') await screen.findByRole('checkbox', { name: 'Alpha' });
    const group = screen.getByRole('group', { name: category.label.ko });
    expect(group).toHaveAccessibleDescription(expect.stringContaining('조회 권한 없음'));
    expect(within(group).getByRole('button', { name: `${category.label.ko} 지우기` })).toBeDisabled();
    for (const control of container.querySelectorAll('input, button[role="checkbox"], button[role="combobox"]')) expect(control).toBeDisabled();
  });
  it('preserves unknown values, describes them verbatim and removes only the chosen value', () => {
    const { onChange } = mount({ declaration: { categories: [categories[1]] }, values: { many: ['a', '<unknown>'] } });
    expect(screen.getByText('이 화면에서 쓸 수 없는 값: <unknown>')).toBeVisible();
    expect(screen.getByText('2개 선택')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '<unknown> 지우기' }));
    expect(onChange).toHaveBeenLastCalledWith('many', { many: ['a'] });
  });
  it('keeps codec raw values in the owning category with translated reasons', () => {
    mount({ declaration: { categories: [categories[3]] }, issues: [{ key: 'amount', categoryId: 'amount', reason: 'invalid-range' }], rawPairs: [['amount', 'oops..2']] });
    expect(screen.getByLabelText('수량 최소')).toHaveValue('oops');
    expect(screen.getByText('유효한 숫자 범위를 입력하세요.')).toBeVisible();
    expect(screen.getByLabelText('수량 최소')).toHaveAccessibleDescription(expect.stringContaining('유효한 숫자 범위'));
  });
  it('refuses category count and menu encoded-length caps without truncation', () => {
    const fifty = Array.from({ length: 50 }, (_, i) => `v${i}`);
    const { onChange } = mount({ declaration: { categories: [categories[1], categories[2]] }, values: { many: fifty } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Alpha' }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText('한 범주에서 최대 50개까지 선택할 수 있습니다.')).toBeVisible();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '한'.repeat(500) } });
    fireEvent.blur(screen.getByRole('searchbox'));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText(/2400/)).toBeVisible();
  });
  it('renders an unsupported tree notice without fetching or editing', () => {
    const loader = vi.fn();
    mount({ declaration: { categories: [{ id: 'tree', label: text('계층'), kind: { type: 'tree', key: 'tree', source: 'tree', value: 'leaves' } }] }, loadOptions: loader });
    expect(screen.getByText('계층 범주는 아직 지원하지 않습니다.')).toBeVisible();
    expect(loader).not.toHaveBeenCalled();
  });
  it('keeps declaration order while sections are headed keyboard folds', async () => {
    const declaration: PageConditions = { categories: categories.slice(0, 3), sections: [{ id: 'section', label: text('선택 범주'), categories: ['many', 'single'] }] };
    const user = userEvent.setup();
    const { container } = mount({ declaration });
    expect([...container.querySelectorAll('[data-page-condition]')].map(node => node.getAttribute('data-page-condition'))).toEqual(['single', 'many', 'query']);
    const fold = screen.getByRole('button', { name: '선택 범주' });
    fold.focus();
    await user.keyboard('{Enter}');
    expect(fold).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('combobox')).toBeNull();
  });
});
describe('page condition options', () => {
  const dynamic = { ...categories[1], kind: { type: 'multi', key: 'many', options: { endpoint: 'options' } } } satisfies PageConditionCategory;
  it('shows loading, empty, error and retry without discarding values', async () => {
    let resolve!: (result: PageConditionOptionsResponse) => void;
    const loader = vi.fn().mockImplementationOnce(() => new Promise(done => { resolve = done; })).mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ options });
    const view = mount({ declaration: { categories: [dynamic] }, values: { many: ['kept'] }, loadOptions: loader });
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy');
    await act(async () => { resolve({ options: [] }); });
    expect(screen.getByText('선택할 항목 없음')).toBeVisible();
    expect(screen.getByText('이 화면에서 쓸 수 없는 값: kept')).toBeVisible();
    view.rerender(<I18nProvider><PageConditionCategories declaration={{ categories: [dynamic] }} values={{ many: ['kept'] }} inputsKey="next" onChange={view.onChange} loadOptions={loader} /></I18nProvider>);
    expect(await screen.findByText('항목을 불러오지 못했습니다.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(await screen.findByRole('checkbox', { name: 'Alpha' })).toBeVisible();
  });
  it('cancels changed inputs/unmount and never presents a late or stale option set', async () => {
    const pending: { signal: AbortSignal; resolve: (data: PageConditionOptionsResponse) => void }[] = [];
    const loader = vi.fn((_category, { signal }) => new Promise<PageConditionOptionsResponse>(resolve => pending.push({ signal, resolve })));
    const props = { declaration: { categories: [dynamic] }, values: {}, inputsKey: 'first', onChange: vi.fn(), loadOptions: loader };
    const view = render(<I18nProvider><PageConditionCategories {...props} /></I18nProvider>);
    await waitFor(() => expect(pending).toHaveLength(1));
    await act(async () => pending[0].resolve({ options }));
    view.rerender(<I18nProvider><PageConditionCategories {...props} inputsKey="second" /></I18nProvider>);
    expect(pending[0].signal.aborted).toBe(true);
    expect(screen.queryByRole('checkbox', { name: 'Alpha' })).toBeNull();
    await waitFor(() => expect(pending).toHaveLength(2));
    view.rerender(<I18nProvider><PageConditionCategories {...props} inputsKey="third" /></I18nProvider>);
    expect(pending[1].signal.aborted).toBe(true);
    await act(async () => pending[1].resolve({ options: [{ value: 'late', label: text('Late') }] }));
    expect(screen.queryByRole('checkbox', { name: 'Late' })).toBeNull();
    view.unmount();
    expect(pending[2].signal.aborted).toBe(true);
  });
  it('shows truncation and rejects malformed/duplicate options instead of displaying a partial list', async () => {
    mount({ declaration: { categories: [dynamic] }, loadOptions: async () => ({ options, truncated: true }) });
    expect(await screen.findByText('일부 항목만 불러왔습니다.')).toBeVisible();
    cleanup();
    mount({ declaration: { categories: [dynamic] }, loadOptions: async () => ({ options: [options[0], options[0]] }) });
    expect(await screen.findByText('항목을 불러오지 못했습니다.')).toBeVisible();
    expect(screen.queryByRole('checkbox', { name: 'Alpha' })).toBeNull();
  });
});

describe('page condition recovery and boundaries', () => {
  it('clears explicit empty to no constraint and never creates empty selection for a scalar', () => {
    const { onChange } = mount({ declaration: { categories: [categories[1], categories[0]] }, values: { many: [], single: ['unknown'] } });
    fireEvent.click(screen.getByRole('button', { name: '대상 지우기' }));
    expect(onChange).toHaveBeenLastCalledWith('many', null);
    fireEvent.click(screen.getByRole('button', { name: 'unknown 지우기' }));
    expect(onChange).toHaveBeenLastCalledWith('single', null);
  });
  it('keeps raw range sibling when one side is corrected and preserves invalid typed text', () => {
    const { onChange } = mount({ declaration: { categories: [categories[3]] }, rawPairs: [['amount', 'bad..20']], issues: [{ key: 'amount', categoryId: 'amount', reason: 'invalid-range' }] });
    input('수량 최소', '4');
    expect(onChange).toHaveBeenLastCalledWith('amount', { amount: { min: 4, max: 20 } });
    input('수량 최대', 'nope');
    expect(screen.getByLabelText('수량 최대')).toHaveValue('nope');
    expect(onChange).toHaveBeenCalledTimes(1);
  });
  it('preserves an invalid raw date in the control, rejects it, then clears both owned keys', () => {
    const { onChange } = mount({ declaration: { categories: [categories[4]] }, rawPairs: [['start', '2026-02-30T12:00:00'], ['end', '2026-03-02T12:00:00']], issues: [{ key: 'start', categoryId: 'period', reason: 'invalid-date' }] });
    expect(screen.getByLabelText('기간 시작')).toHaveValue('2026-02-30T12:00:00');
    expect(screen.getByLabelText('기간 종료')).toHaveValue('2026-03-02T12:00');
    fireEvent.blur(screen.getByLabelText('기간 시작'));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '기간 지우기' }));
    expect(onChange).toHaveBeenLastCalledWith('period', null);
  });
  it('preserves a grouped value in another group and uses explicit empty for the last unchecked list value', async () => {
    const loadOptions = async () => ({ groups: [grouped.groups[0], { id: 'h', label: text('Other'), lists: { module: [{ value: 'c', label: text('Gamma') }], motion: [] } }] });
    const { onChange } = mount({ declaration: { categories: [categories[5]] }, values: { modules: ['a', 'c'], motions: ['b'] }, loadOptions });
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Alpha' }));
    expect(onChange).toHaveBeenLastCalledWith('checks', { modules: ['c'], motions: ['b'] });
    cleanup();
    const next = mount({ declaration: { categories: [categories[5]] }, values: { modules: ['a'] }, loadOptions });
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Alpha' }));
    expect(next.onChange).toHaveBeenLastCalledWith('checks', { modules: [] });
  });
  it('counts every grouped list toward the category cap', async () => {
    const { onChange } = mount({ declaration: { categories: [categories[5]] }, values: { modules: Array.from({ length: 49 }, (_, i) => `old${i}`), motions: ['b'] } });
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Alpha' }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('group', { name: '묶음' })).toHaveAccessibleDescription(expect.stringContaining('50개'));
  });
  it('shows disabled option reasons and refuses interaction', async () => {
    const { onChange } = mount({ declaration: { categories: [{ ...categories[1], kind: { type: 'multi', key: 'many', options: { endpoint: 'options' } } }] }, loadOptions: async () => ({ options: [{ ...options[0], disabledReason: text('이 항목은 잠겨 있습니다.') }] }) });
    const checkbox = await screen.findByRole('checkbox', { name: 'Alpha' });
    expect(checkbox).toBeDisabled();
    expect(checkbox).toHaveAccessibleDescription('이 항목은 잠겨 있습니다.');
    fireEvent.click(checkbox);
    expect(onChange).not.toHaveBeenCalled();
  });
  it('reloads a changed declaration and shows an internal AbortError as a failure', async () => {
    const dynamic = { ...categories[1], kind: { type: 'multi', key: 'many', options: { endpoint: 'one' } } } satisfies PageConditionCategory;
    const loader = vi.fn().mockResolvedValueOnce({ options }).mockRejectedValueOnce(new DOMException('Timeout', 'AbortError'));
    const { onChange, rerender } = mount({ declaration: { categories: [dynamic] }, loadOptions: loader });
    await screen.findByRole('checkbox', { name: 'Alpha' });
    rerender(<I18nProvider><PageConditionCategories declaration={{ categories: [{ ...dynamic, kind: { ...dynamic.kind, options: { endpoint: 'two' } } }] }} values={{}} inputsKey="session:scope:1" onChange={onChange} loadOptions={loader} /></I18nProvider>);
    expect(screen.queryByRole('checkbox', { name: 'Alpha' })).toBeNull();
    expect(await screen.findByText('항목을 불러오지 못했습니다.')).toBeVisible();
  });
});

it('preserves valid raw siblings when recovering a rejected grouped category', async () => {
  const { onChange } = mount({ declaration: { categories: [categories[5]] }, rawPairs: [['modules', '~broken'], ['motions', 'b']], issues: [{ key: 'modules', categoryId: 'checks', reason: 'invalid-value' }] });
  await screen.findByRole('checkbox', { name: 'Alpha' });
  fireEvent.click(screen.getByRole('button', { name: '~broken 지우기' }));
  expect(onChange).toHaveBeenLastCalledWith('checks', { modules: [], motions: ['b'] });
});

it('does not turn a retained malformed grouped token into a valid escaped id during another toggle', async () => {
  const { onChange } = mount({ declaration: { categories: [categories[5]] }, rawPairs: [['modules', '~broken'], ['motions', 'b']], issues: [{ key: 'modules', categoryId: 'checks', reason: 'invalid-value' }] });
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Alpha' }));
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.getByText('이 화면에서 쓸 수 없는 값: ~broken')).toBeVisible();
});

it('does not turn a retained malformed multi token into a valid escaped id during another toggle', async () => {
  const { onChange } = mount({ declaration: { categories: [categories[1]] }, rawPairs: [['many', 'alpha'], ['many', '~broken']], issues: [{ key: 'many', categoryId: 'many', reason: 'invalid-value' }] });
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Beta' }));
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.getByText('이 화면에서 쓸 수 없는 값: ~broken')).toBeVisible();
});

it('shows an explicit-empty grouped list even when a sibling list has a selection', async () => {
  mount({ declaration: { categories: [categories[5]] }, values: { modules: [], motions: ['b'] } });
  const list = await screen.findByRole('group', { name: 'Module' });
  expect(within(list.parentElement!).getByText('선택한 항목 없음')).toBeVisible();
  expect(screen.getByText('1개 선택')).toBeVisible();
});
