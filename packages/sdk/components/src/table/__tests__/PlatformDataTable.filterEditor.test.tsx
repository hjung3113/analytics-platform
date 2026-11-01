import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { House } from 'lucide-react';
import { useState } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { groupId, spaceId, type ApiResponse, type ColumnFilter, type TableQuery } from '@ap/contracts';
import { PlatformDataTable, type PageResult, type PlatformColumn, type TableFilterField, type TableUrlState } from '../PlatformDataTable';
import { pruneUnmet, resolveFilterFields } from '../filterFields';

// #1217 node b: the filter line and the one editor (ADR-0105, 06 §15).
afterEach(cleanup);

type Row = { id: string; status: string; name: string; n: number };
const registry = createRegistry({
  spaces: [testSpace({ homeMenuId: 'm' })],
  groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }],
  menus: [{ id: 'm', group: groupId('overview'), primary: true, label: { ko: '메뉴', en: 'Menu' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'management', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [] }],
});
const session = testSession(['platform:view'], { user: { id: 'user-a' } });
const adapter = testAdapter({ session: () => session });
const axes = [{ id: 'maker', label: { ko: 'Maker', en: 'Maker' }, membershipHistory: false }];
const options = [{ value: 'active', label: '사용중' }, { value: 'idle', label: '대기' }];

const columns: PlatformColumn<Row>[] = [
  { id: 'status', header: '상태', filter: { kind: 'enum', options }, filterPinned: true },
  { id: 'name', header: '이름', filter: { kind: 'text', ops: ['equals', 'startsWith', 'isEmpty'] } },
  { id: 'n', header: '수량', filter: { kind: 'number' }, filterLabel: '수량(개)' },
  { id: 'plain', header: '메모', value: () => '-' },
];
const fields: TableFilterField[] = [
  { id: 'kind', label: { ko: '종류', en: 'Kind' }, spec: { kind: 'enum', options, multiple: false } },
  { id: 'target', label: { ko: '대상', en: 'Target' }, spec: { kind: 'text', requires: ['kind'] } },
];

const ok = (): ApiResponse<PageResult<Row>> => ({ outcome: 'ok', assessments: [], trust: null, correlationId: 'c', data: { rows: [{ id: 'r1', status: 'active', name: 'n', n: 1 }], total: 1 } });
const makeLoad = () => vi.fn(async (_q: TableQuery, _s: AbortSignal) => ok());
const lastQuery = (fn: ReturnType<typeof makeLoad>) => fn.mock.calls.at(-1)![0];

function Harness(props: { columns?: PlatformColumn<Row>[]; filterFields?: TableFilterField[]; loadPage: ReturnType<typeof makeLoad>; urlState?: TableUrlState }) {
  return <I18nProvider><PlatformProvider equipmentAxes={axes} adapter={adapter} registry={registry}>
    <PlatformDataTable<Row> title="T" ariaLabel="table" columns={props.columns ?? columns} filterFields={props.filterFields} getRowId={r => r.id} loadPage={props.loadPage}
      filterKey="f" preferenceKey="test-filter-editor" pageSize={25} height={200} urlState={props.urlState} />
  </PlatformProvider></I18nProvider>;
}

const originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
const originalOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
beforeAll(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.releasePointerCapture = () => {};
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get() { return (this as Element).getAttribute('role') === 'row' ? 32 : 420; } });
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get() { return 800; } });
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const height = this.getAttribute('role') === 'row' ? 32 : 420;
    return { height, width: 800, top: 0, left: 0, right: 800, bottom: height, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
  });
});
afterAll(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (originalOffsetHeight) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', originalOffsetHeight);
  if (originalOffsetWidth) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', originalOffsetWidth);
});
beforeEach(() => { window.history.replaceState(null, '', '/'); });

const ready = async () => { await screen.findByText(/1\/1/); };
// The operator is a @ap/ui Select (a combobox): open it from the keyboard, read or pick its options.
const openOperator = async (scope: Pick<typeof screen, 'getByRole'>) => {
  const trigger = scope.getByRole('combobox', { name: '연산자' });
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  return trigger;
};
const optionNames = async (scope: Pick<typeof screen, 'getByRole'>) => {
  await openOperator(scope);
  const names = (await screen.findAllByRole('option')).map(o => o.textContent);
  fireEvent.keyDown(screen.getAllByRole('option')[0], { key: 'Escape' });
  return names;
};
const pickOperator = async (scope: Pick<typeof screen, 'getByRole'>, name: string) => {
  await openOperator(scope);
  fireEvent.click(await screen.findByRole('option', { name }));
};

describe('filter line (#1217b)', () => {
  it('shows a pinned button that becomes a chip in the same slot, then the other conditions as chips after it', async () => {
    const load = makeLoad();
    const view = render(<Harness loadPage={load} />);
    await ready();
    const line = view.container.querySelector('[data-filter-line]')!;
    expect(within(line as HTMLElement).getByRole('button', { name: '상태' })).toBeTruthy();
    expect(within(line as HTMLElement).queryByRole('button', { name: '이름' })).toBeNull();
    fireEvent.click(within(line as HTMLElement).getByRole('button', { name: '상태' }));
    const dialog = await screen.findByRole('dialog', { name: '상태' });
    fireEvent.click(within(dialog).getByRole('checkbox', { name: '대기' }));
    fireEvent.click(within(dialog).getByRole('button', { name: '적용' }));
    await waitFor(() => expect(lastQuery(load).filters).toEqual([{ id: 'status', op: 'in', value: ['idle'] }]));
    const chip = view.container.querySelector('[data-column-filter-chip="status"]') as HTMLElement;
    expect(chip.textContent).toContain('상태:');
    expect(chip.textContent).toContain('대기');
    expect(within(chip).getByRole('button', { name: '상태 필터 지우기' })).toBeTruthy();
    // Focus stays on the chip body, which was the pinned button.
    await waitFor(() => expect(document.activeElement).toBe(chip.querySelector('[data-filter-body]')));
  });

  it('a chip body reopens the editor with the current value; × and 모두 지우기 apply at once', async () => {
    const load = makeLoad();
    const view = render(<Harness loadPage={load} />);
    await ready();
    fireEvent.click(screen.getByRole('button', { name: '이름 필터' }));
    fireEvent.change(await screen.findByLabelText('값'), { target: { value: 'ab' } });
    fireEvent.click(screen.getByRole('button', { name: '적용' }));
    await waitFor(() => expect(lastQuery(load).filters).toEqual([{ id: 'name', op: 'equals', value: 'ab' }]));
    const chip = () => view.container.querySelector('[data-column-filter-chip="name"]') as HTMLElement;
    fireEvent.click(chip().querySelector('[data-filter-body]')!);
    const dialog = await screen.findByRole('dialog', { name: '이름' });
    expect((within(dialog).getByLabelText('값') as HTMLInputElement).value).toBe('ab');
    expect(within(dialog).getByRole('combobox', { name: '연산자' })).toHaveTextContent('같음');
    fireEvent.keyDown(within(dialog).getByLabelText('값'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    fireEvent.click(within(chip()).getByRole('button', { name: '이름 필터 지우기' }));
    await waitFor(() => expect(lastQuery(load)).not.toHaveProperty('filters'));
    await waitFor(() => expect(document.activeElement).toBe(view.container.querySelector('[data-filter-add]')));
  });

  it('a table without a filterable field has no filter line and no funnel', async () => {
    const view = render(<Harness columns={[{ id: 'name', header: '이름' }]} loadPage={makeLoad()} />);
    await ready();
    expect(view.container.querySelector('[data-filter-line]')).toBeNull();
    expect(view.container.querySelector('[data-column-filter]')).toBeNull();
  });

  it('a filterFields-only table (no column filter) still renders the line', async () => {
    const view = render(<Harness columns={[{ id: 'name', header: '이름' }]} filterFields={fields} loadPage={makeLoad()} />);
    await ready();
    expect(view.container.querySelector('[data-filter-line]')).not.toBeNull();
    expect(view.container.querySelector('[data-column-filter]')).toBeNull();
  });

  it('a duplicate id across columns and filterFields is a declaration error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Harness filterFields={[{ id: 'name', label: { ko: '이름2', en: 'Name2' }, spec: { kind: 'text' } }]} loadPage={makeLoad()} />)).toThrow(/"name" is declared twice/);
    spy.mockRestore();
    expect(() => resolveFilterFields(columns, [{ id: 'a:b', label: { ko: 'x', en: 'x' }, spec: { kind: 'text' } }], 'ko')).toThrow(/must not contain/);
  });
});

describe('filter editor (#1217b)', () => {
  it('lists only the operators the spec allows, in the shared Korean words', async () => {
    render(<Harness loadPage={makeLoad()} />);
    await ready();
    fireEvent.click(screen.getByRole('button', { name: '이름 필터' }));
    await screen.findByRole('combobox', { name: '연산자' });
    expect(await optionNames(screen)).toEqual(['같음', '다음으로 시작', '비어 있음']);
  });

  it('isEmpty has no value control and applies as a bare condition', async () => {
    const load = makeLoad();
    render(<Harness loadPage={load} />);
    await ready();
    fireEvent.click(screen.getByRole('button', { name: '이름 필터' }));
    await screen.findByRole('combobox', { name: '연산자' });
    await pickOperator(screen, '비어 있음');
    expect(screen.queryByLabelText('값')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '적용' }));
    await waitFor(() => expect(lastQuery(load).filters).toEqual([{ id: 'name', op: 'isEmpty' }]));
  });

  it('number operators carry typed values, and between sends the sorted pair; 적용 is disabled while incomplete', async () => {
    const load = makeLoad();
    render(<Harness loadPage={load} />);
    await ready();
    fireEvent.click(screen.getByRole('button', { name: '수량(개) 필터' }));
    const apply = await screen.findByRole('button', { name: '적용' });
    expect((apply as HTMLButtonElement).disabled).toBe(true);
    await pickOperator(screen, '범위');
    fireEvent.change(screen.getByLabelText('최솟값'), { target: { value: '9' } });
    fireEvent.change(screen.getByLabelText('최댓값'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: '적용' }));
    await waitFor(() => expect(lastQuery(load).filters).toEqual([{ id: 'n', op: 'between', value: [2, 9] }]));
  });

  it('an enum with multiple:false is a single choice and offers 다음 중 하나 / 다음 중 아님', async () => {
    const load = makeLoad();
    render(<Harness columns={[{ id: 'name', header: '이름' }]} filterFields={fields} loadPage={load} />);
    await ready();
    fireEvent.click(screen.getByRole('button', { name: '필터 추가' }));
    fireEvent.click(await screen.findByRole('button', { name: /^종류/ }));
    const dialog = await screen.findByRole('dialog', { name: '종류' });
    expect(within(dialog).queryAllByRole('checkbox')).toHaveLength(0);
    fireEvent.click(within(dialog).getByRole('radio', { name: '사용중' }));
    fireEvent.click(within(dialog).getByRole('radio', { name: '대기' }));
    expect((within(dialog).getByRole('radio', { name: '사용중' }) as HTMLInputElement).checked).toBe(false);
    expect(await optionNames(within(dialog))).toEqual(['다음 중 하나', '다음 중 아님', '비어 있음', '비어 있지 않음']);
    fireEvent.click(within(dialog).getByRole('button', { name: '적용' }));
    await waitFor(() => expect(lastQuery(load).filters).toEqual([{ id: 'kind', op: 'in', value: ['idle'] }]));
  });

  it('a multiple enum checklist is a group with a search box once the list is long', async () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ value: `v${i}`, label: `값${i}` }));
    render(<Harness columns={[{ id: 'status', header: '상태', filter: { kind: 'enum', options: many } }]} loadPage={makeLoad()} />);
    await ready();
    fireEvent.click(screen.getByRole('button', { name: '상태 필터' }));
    const dialog = await screen.findByRole('dialog', { name: '상태' });
    const group = within(dialog).getByRole('group', { name: '값 목록' });
    fireEvent.change(within(group).getByRole('searchbox', { name: '값 검색' }), { target: { value: '값3' } });
    expect(within(group).getAllByRole('checkbox')).toHaveLength(1);
  });

  it('적용 is one condition: a controlled table gets exactly one onChange with the new list and page null; Esc applies nothing', async () => {
    const load = vi.fn(async (_q: TableQuery, _s: AbortSignal): Promise<ApiResponse<PageResult<Row>>> => ({ outcome: 'ok', assessments: [], trust: null, correlationId: 'c', data: { rows: [{ id: 'r1', status: 'active', name: 'n', n: 1 }], total: 60 } }));
    const onChange = vi.fn();
    function Owner() {
      const [filters, setFilters] = useState<ColumnFilter[]>([]);
      const urlState: TableUrlState = { page: 2, sorting: [], filters, onChange: (next, reason) => { onChange(next, reason); if (next.filters) setFilters(next.filters); } };
      return <Harness loadPage={load} urlState={urlState} />;
    }
    render(<Owner />);
    await screen.findByText(/2\/3/);
    fireEvent.click(screen.getByRole('button', { name: '이름 필터' }));
    fireEvent.change(await screen.findByLabelText('값'), { target: { value: 'x' } });
    fireEvent.keyDown(screen.getByLabelText('값'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '이름 필터' }));
    expect((await screen.findByLabelText('값') as HTMLInputElement).value).toBe(''); // the discarded draft is gone
    fireEvent.change(screen.getByLabelText('값'), { target: { value: 'x' } });
    fireEvent.submit(screen.getByLabelText('값').closest('form')!); // Enter
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(onChange).toHaveBeenCalledWith({ sorting: [], page: null, filters: [{ id: 'name', op: 'equals', value: 'x' }] }, 'user');
  });

  it('the header funnel is pressed while its column is filtered and opens the editor of that field', async () => {
    const view = render(<Harness loadPage={makeLoad()} urlState={{ page: null, sorting: [], filters: [{ id: 'name', op: 'startsWith', value: 'q' }], onChange: () => {} }} />);
    await ready();
    const pressed = (id: string) => view.container.querySelector(`[data-column-filter="${id}"]`)!.getAttribute('aria-pressed');
    expect(pressed('name')).toBe('true');
    expect(pressed('n')).toBe('false');
    fireEvent.click(view.container.querySelector('[data-column-filter="name"]')!);
    const dialog = await screen.findByRole('dialog', { name: '이름' });
    expect((within(dialog).getByLabelText('값') as HTMLInputElement).value).toBe('q');
    expect(view.container.querySelector('[data-column-filter-chip="name"]')!.textContent).toContain('"q"로 시작');
  });
});

describe('+ 필터 (#1217b)', () => {
  it('groups every field, disables one whose requires is unmet with the reason, and opens the editor for the chosen field', async () => {
    const load = makeLoad();
    const view = render(<Harness filterFields={fields} loadPage={load} />);
    await ready();
    const add = view.container.querySelector('[data-filter-add]') as HTMLElement;
    fireEvent.click(add);
    const list = await screen.findByRole('dialog', { name: '필터 추가' });
    expect(within(list).getAllByRole('group').map(g => g.getAttribute('aria-label'))).toEqual(['고정', '열', '기타']);
    const target = within(list).getByRole('button', { name: /^대상/ });
    expect(target.getAttribute('aria-disabled')).toBe('true');
    expect(target.textContent).toContain('먼저 종류 조건이 필요합니다');
    fireEvent.click(target);
    expect(within(list).queryByLabelText('연산자')).toBeNull();
    fireEvent.click(within(list).getByRole('button', { name: /^수량\(개\)/ }));
    const dialog = await screen.findByRole('dialog', { name: '수량(개)' });
    fireEvent.change(within(dialog).getByLabelText('값'), { target: { value: '4' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '적용' }));
    await waitFor(() => expect(lastQuery(load).filters).toEqual([{ id: 'n', op: 'eq', value: 4 }]));
    // Focus returns to the opener.
    await waitFor(() => expect(document.activeElement).toBe(add));
  });

  it('arrow keys move through the list, and a set field shows its value; a long list gets a field search', async () => {
    const many: PlatformColumn<Row>[] = Array.from({ length: 9 }, (_, i) => ({ id: `c${i}`, header: `열${i}`, filter: { kind: 'text' as const } }));
    const view = render(<Harness columns={many} loadPage={makeLoad()} urlState={{ page: null, sorting: [], filters: [{ id: 'c1', op: 'contains', value: 'zz' }], onChange: () => {} }} />);
    await ready();
    fireEvent.click(view.container.querySelector('[data-filter-add]')!);
    const list = await screen.findByRole('dialog', { name: '필터 추가' });
    const search = within(list).getByRole('searchbox', { name: '필드 찾기' });
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    expect(document.activeElement?.getAttribute('data-filter-pick')).toBe('c0');
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect(document.activeElement?.getAttribute('data-filter-pick')).toBe('c1');
    expect(document.activeElement?.textContent).toContain('zz');
    fireEvent.change(search, { target: { value: '열7' } });
    expect(within(list).getAllByRole('button').filter(b => b.hasAttribute('data-filter-pick'))).toHaveLength(1);
  });

  it('removing the condition a field requires removes the dependent condition too', () => {
    const all = resolveFilterFields(columns, fields, 'ko');
    const list: ColumnFilter[] = [{ id: 'target', op: 'contains', value: 'a' }, { id: 'name', op: 'equals', value: 'b' }];
    expect(pruneUnmet(list, all)).toEqual([{ id: 'name', op: 'equals', value: 'b' }]);
    expect(pruneUnmet([{ id: 'kind', op: 'in', value: ['active'] }, ...list], all)).toHaveLength(3);
  });
});

// Fix round 1 (F1–F5, UX-1/2/3).
describe('filter editor fix round 1', () => {
  function Owner({ initial = [], cols, onChange }: { initial?: ColumnFilter[]; cols?: PlatformColumn<Row>[]; onChange: (next: ColumnFilter[]) => void }) {
    const [filters, setFilters] = useState<ColumnFilter[]>(initial);
    const urlState: TableUrlState = { page: null, sorting: [], filters, onChange: next => { if (next.filters) { onChange(next.filters); setFilters(next.filters); } } };
    return <Harness columns={cols} loadPage={makeLoad()} urlState={urlState} />;
  }
  const openName = async () => { fireEvent.click(screen.getByRole('button', { name: '이름 필터' })); return screen.findByLabelText('값'); };

  it('F1: an Enter that belongs to an IME composition (isComposing, 229, right after compositionend) does not apply; a later Enter applies once', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Owner onChange={onChange} />);
    await ready();
    const input = await openName();
    await user.type(input, 'ㅎ');
    expect(fireEvent.keyDown(input, { key: 'Enter', isComposing: true })).toBe(false);
    expect(fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 })).toBe(false);
    fireEvent.compositionStart(input);
    fireEvent.compositionEnd(input);
    await user.keyboard('{Enter}');
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: '이름' })).toBeTruthy();
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('F2: reopening an instant condition and applying it unchanged keeps its seconds and milliseconds; editing one bound keeps the other', async () => {
    const from = '2026-01-01T00:00:30.123Z';
    const to = '2026-01-02T00:00:45.500Z';
    const cols: PlatformColumn<Row>[] = [{ id: 'at', header: '시각', filter: { kind: 'instant' }, value: () => '-' }];
    const onChange = vi.fn();
    render(<Owner cols={cols} initial={[{ id: 'at', op: 'between', value: { from, to } }]} onChange={onChange} />);
    await ready();
    fireEvent.click(screen.getByRole('button', { name: '시각 필터' }));
    fireEvent.click(await screen.findByRole('button', { name: '적용' }));
    expect(onChange).toHaveBeenLastCalledWith([{ id: 'at', op: 'between', value: { from, to } }]);
    fireEvent.click(screen.getByRole('button', { name: '시각 필터' }));
    fireEvent.change(await screen.findByLabelText('끝 (미만)'), { target: { value: '2026-01-05T10:00' } });
    fireEvent.click(screen.getByRole('button', { name: '적용' }));
    const value = (onChange.mock.lastCall![0] as { value: { from: string; to: string } }[])[0].value;
    expect(value.from).toBe(from);
    expect(value.to).toBe(new Date('2026-01-05T10:00').toISOString());
  });

  it('F3: an Apply that would exceed a codec cap writes nothing, keeps the editor and the draft, and says why; a value within the cap applies', async () => {
    const onChange = vi.fn();
    render(<Owner onChange={onChange} />);
    await ready();
    const input = await openName();
    fireEvent.change(input, { target: { value: '가'.repeat(270) } });
    fireEvent.click(screen.getByRole('button', { name: '적용' }));
    expect(onChange).not.toHaveBeenCalled();
    expect((await screen.findByRole('alert')).textContent).toContain('너무 길어');
    expect((screen.getByLabelText('값') as HTMLInputElement).value).toBe('가'.repeat(270));
    fireEvent.change(screen.getByLabelText('값'), { target: { value: '가'.repeat(100) } });
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '적용' }));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('F3: too many values and too many conditions are refused with their own explanation', async () => {
    const many = Array.from({ length: 51 }, (_, i) => ({ value: `v${i}`, label: `값${i}` }));
    const onChange = vi.fn();
    const first = render(<Owner cols={[{ id: 'status', header: '상태', filter: { kind: 'enum', options: many } }]} onChange={onChange} />);
    await ready();
    fireEvent.click(screen.getByRole('button', { name: '상태 필터' }));
    const dialog = await screen.findByRole('dialog', { name: '상태' });
    for (const box of within(dialog).getAllByRole('checkbox')) fireEvent.click(box);
    fireEvent.click(within(dialog).getByRole('button', { name: '적용' }));
    expect((await screen.findByRole('alert')).textContent).toContain('값을 너무 많이');
    expect(onChange).not.toHaveBeenCalled();
    first.unmount();
    const cols: PlatformColumn<Row>[] = Array.from({ length: 21 }, (_, i) => ({ id: `c${i}`, header: `열${i}`, filter: { kind: 'text' as const }, value: () => '-' }));
    const initial: ColumnFilter[] = cols.slice(0, 20).map(c => ({ id: c.id, op: 'contains', value: 'a' }));
    render(<Owner cols={cols} initial={initial} onChange={onChange} />);
    await ready();
    fireEvent.click(screen.getByRole('button', { name: '열20 필터' }));
    fireEvent.change(await screen.findByLabelText('값'), { target: { value: 'b' } });
    fireEvent.click(screen.getByRole('button', { name: '적용' }));
    expect((await screen.findByRole('alert')).textContent).toContain('조건이 너무 많아');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('F4: a non-composing Enter in the enum value search applies the condition once', async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 8 }, (_, i) => ({ value: `v${i}`, label: `값${i}` }));
    const onChange = vi.fn();
    render(<Owner cols={[{ id: 'status', header: '상태', filter: { kind: 'enum', options: many } }]} onChange={onChange} />);
    await ready();
    fireEvent.click(screen.getByRole('button', { name: '상태 필터' }));
    const dialog = await screen.findByRole('dialog', { name: '상태' });
    await user.click(within(dialog).getByRole('checkbox', { name: '값2' }));
    await user.click(within(dialog).getByRole('searchbox', { name: '값 검색' }));
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith([{ id: 'status', op: 'in', value: ['v2'] }]);
  });

  it('F5: a filterFields id may not equal ANY column id, filterable or not', () => {
    expect(() => resolveFilterFields(columns, [{ id: 'plain', label: { ko: '메모2', en: 'Memo2' }, spec: { kind: 'text' } }], 'ko')).toThrow(/"plain" is declared twice/);
  });

  it('F6/UX-3: header row = label + operator Select, footer after a divider with 지우기 left and 적용 right; no native select', async () => {
    render(<Harness loadPage={makeLoad()} />);
    await ready();
    fireEvent.click(screen.getByRole('button', { name: '이름 필터' }));
    const dialog = await screen.findByRole('dialog', { name: '이름' });
    expect(dialog.querySelector('select:not([aria-hidden])')).toBeNull(); // Radix keeps only a hidden form-mirror select
    const head = within(dialog).getByRole('combobox', { name: '연산자' }).parentElement!;
    expect(head.textContent).toContain('이름');
    const footer = within(dialog).getByRole('button', { name: '지우기' }).parentElement!;
    expect(footer.className).toContain('border-t');
    expect([...footer.querySelectorAll('button')].map(b => b.textContent)).toEqual(['지우기', '적용']);
  });

  it('UX-2: operator and chip wording follows the approved R2 words', async () => {
    const view = render(<Harness loadPage={makeLoad()} columns={[{ id: 'name', header: 'Model', filter: { kind: 'text' } }]} urlState={{ page: null, sorting: [], filters: [{ id: 'name', op: 'startsWith', value: 'Lith' }], onChange: () => {} }} />);
    await ready();
    expect(view.container.querySelector('[data-column-filter-chip="name"]')!.textContent).toBe('Model "Lith"로 시작');
    fireEvent.click(view.container.querySelector('[data-filter-body="name"]')!);
    await screen.findByRole('dialog', { name: 'Model' });
    expect(await optionNames(screen)).toEqual(['포함', '포함하지 않음', '다음으로 시작', '다음으로 끝남', '같음', '같지 않음', '비어 있음', '비어 있지 않음']);
  });

  it('UX-1: focus returns to where the editor was opened — the header funnel, or the chip that replaced a pinned button', async () => {
    const view = render(<Harness loadPage={makeLoad()} />);
    await ready();
    const funnel = view.container.querySelector('[data-column-filter="name"]') as HTMLElement;
    fireEvent.click(funnel);
    fireEvent.change(await screen.findByLabelText('값'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: '적용' }));
    await waitFor(() => expect(document.activeElement).toBe(funnel));
    fireEvent.click(view.container.querySelector('[data-filter-body="status"]')!);
    fireEvent.click(await screen.findByRole('checkbox', { name: '대기' }));
    fireEvent.click(screen.getByRole('button', { name: '적용' }));
    await waitFor(() => expect(document.activeElement).toBe(view.container.querySelector('[data-column-filter-chip="status"] [data-filter-body]')));
  });
});
