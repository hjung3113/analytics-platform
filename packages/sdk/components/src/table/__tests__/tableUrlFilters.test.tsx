// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { House } from 'lucide-react';
import { I18nProvider, PlatformProvider, createRegistry, usePlatform, type MenuEntry } from '@ap/kernel';
import { noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { groupId, spaceId, type ColumnFilter, type ColumnFilterSpec } from '@ap/contracts';
import { useTableUrlState, TableUrlWarning } from '../tableUrlWarning';
import type { LegacyFilterKey } from '../tableFilterUrl';
import type { TableUrlState } from '../PlatformDataTable';

afterEach(cleanup);

const menu: MenuEntry = {
  id: 'home', path: '/list', primary: true, group: groupId('overview'), label: { ko: '목록', en: 'List' }, description: { ko: '', en: '' }, icon: House,
  permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'management',
  features: { export: false, savedView: false, annotate: false, compare: false },
  pageKeys: ['sort', 'page', 'q', 'filter', 'status', 'maker'], repeatedPageKeys: ['filter'], hiddenPageKeys: ['filter'],
};
const registry = createRegistry({ spaces: [testSpace()], groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }], menus: [menu] });
const session = testSession(['platform:view']);

const specs: Record<string, ColumnFilterSpec> = {
  name: { kind: 'text' },
  size: { kind: 'number' },
  status: { kind: 'enum', options: [{ value: 'active', label: '사용' }, { value: 'retired', label: '폐기' }] },
  maker: { kind: 'text' },
};
const legacy: LegacyFilterKey[] = [
  { key: 'status', toFilter: raw => raw === 'active' || raw === 'retired' ? { id: 'status', op: 'in', value: [raw] } : null },
  { key: 'maker', toFilter: raw => raw === '' ? null : { id: 'maker', op: 'equals', value: raw } },
];
const filtersOption = { key: 'filter', specs, labels: { name: '이름', size: '크기', status: '상태', maker: '제조사' }, legacy };

let latest: ReturnType<typeof useTableUrlState> | null = null;
let pagesSeen: string[] = [];
let latestPlatform: ReturnType<typeof usePlatform> | null = null;
function Capture() { latestPlatform = usePlatform(); return null; }
function Probe({ withFilters = true }: { withFilters?: boolean }) {
  latest = useTableUrlState(['name', 'size'], withFilters ? { filters: filtersOption } : undefined);
  const { pageParams } = latestPlatform!;
  pagesSeen = pageParams('filter');
  return latest.invalid ? <TableUrlWarning sentences={latest.sentences} recoverKeys={latest.recoverKeys} /> : <span data-testid="state">{latest.urlState ? 'controlled' : 'none'}</span>;
}

function mount(search: string, withFilters = true, state: unknown = null) {
  window.history.replaceState(state, '', `/list${search}`);
  render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={registry}><Capture /><Probe withFilters={withFilters} /></PlatformProvider></I18nProvider>);
}
const params = () => new URLSearchParams(window.location.search);
type Change = Parameters<NonNullable<TableUrlState['onChange']>>[0];
const change = (next: Change, reason: 'user' | 'reset' | 'clamp' = 'user') => act(() => latest!.urlState!.onChange(next, reason));

describe('useTableUrlState filters option (ADR-0105)', () => {
  it('reads the repeated hidden key through the codec and exposes the filters', () => {
    mount('?v=1&sort=size:desc&page=3', true, { apHidden: { v: 1, pairs: [['filter', 'name:contains:한글:콤마'], ['filter', 'size:between:1~5']] } });
    expect(latest!.urlState!.filters).toEqual<ColumnFilter[]>([{ id: 'name', op: 'contains', value: '한글:콤마' }, { id: 'size', op: 'between', value: [1, 5] }]);
    expect(latest!.urlState).toMatchObject({ page: 3, sorting: [{ id: 'size', desc: true }] });
    expect(latest!.invalid).toBe(false);
  });

  it('a filter change is one setPage: encoded conditions (one value each) and page reset, sort kept, one history entry', () => {
    mount('?v=1&sort=size:desc&page=3&q=x');
    const before = window.history.length;
    change({ page: null, sorting: [{ id: 'size', desc: true }], filters: [{ id: 'name', op: 'contains', value: 'a:b,c~d' }, { id: 'size', op: 'isNotEmpty' }] });
    expect(window.history.length - before).toBe(1);
    expect(pagesSeen).toEqual(['name:contains:a:b,c~d', 'size:isNotEmpty']);
    expect(latest!.urlState!.filters).toEqual([{ id: 'name', op: 'contains', value: 'a:b,c~d' }, { id: 'size', op: 'isNotEmpty' }]);
    expect(params().get('page')).toBeNull();
    expect(params().get('sort')).toBe('size:desc');
    expect(params().get('q')).toBe('x');
    expect(params().has('filter')).toBe(false); // hidden: not in the address
  });

  it('an empty list removes the key; sort/page/clamp writes without filters leave the conditions alone', () => {
    mount('?v=1', true, { apHidden: { v: 1, pairs: [['filter', 'name:contains:a']] } });
    change({ page: 2, sorting: [] });
    expect(pagesSeen).toEqual(['name:contains:a']);
    change({ page: null, sorting: [], filters: [] }, 'reset');
    expect(pagesSeen).toEqual([]);
    expect(latest!.urlState!.filters).toEqual([]);
  });

  it('rewrites present legacy keys into the filter key once, with replace, and removes them', () => {
    const before = window.history.length;
    mount('?v=1&status=active&maker=%EC%82%BC%EC%84%B1&q=x');
    expect(window.history.length).toBe(before);
    expect(params().has('status')).toBe(false);
    expect(params().has('maker')).toBe(false);
    expect(params().get('q')).toBe('x');
    expect(pagesSeen).toEqual(['status:in:active', 'maker:equals:삼성']);
    expect(latest!.urlState!.filters).toEqual([{ id: 'status', op: 'in', value: ['active'] }, { id: 'maker', op: 'equals', value: '삼성' }]);
  });

  it('merges a legacy key after existing conditions', () => {
    mount('?v=1&status=retired', true, { apHidden: { v: 1, pairs: [['filter', 'name:contains:a']] } });
    expect(pagesSeen).toEqual(['name:contains:a', 'status:in:retired']);
  });

  describe('invalid state', () => {
    it.each([
      ['malformed condition', '?v=1', [['filter', 'name']], ['“name”']],
      ['undeclared field', '?v=1', [['filter', 'ghost:contains:x']], ['ghost “ghost:contains:x”']],
      ['op not allowed for the kind', '?v=1', [['filter', 'name:gt:3']], ['이름 “name:gt:3”']],
      ['two conditions on one field', '?v=1', [['filter', 'name:contains:a'], ['filter', 'name:equals:b']], ['이름 “name:equals:b”']],
      ['unconvertible legacy value', '?v=1&status=nope', [], ['상태 “nope”']],
      ['legacy key against a condition on the same field', '?v=1&maker=x', [['filter', 'maker:contains:y']], ['제조사 “x”']],
    ])('%s: urlState undefined, one ADR-0034 sentence, no key=value', (_name, search, pairs, fragments) => {
      mount(search, true, pairs.length ? { apHidden: { v: 1, pairs } } : null);
      expect(latest!.urlState).toBeUndefined();
      expect(latest!.invalid).toBe(true);
      expect(latest!.sentences).toHaveLength(1);
      for (const fragment of fragments) expect(latest!.sentences[0]).toContain(fragment);
      expect(latest!.sentences[0]).toContain('쓸 수 없는 필터입니다');
      expect(latest!.sentences[0]).not.toMatch(/filter=|status=|maker=/);
      expect(screen.getByRole('alert')).toBeTruthy();
    });

    it('names the generic field for a cap', () => {
      const pairs = Array.from({ length: 21 }, (_, i) => ['filter', `name${i}:contains:x`]);
      mount('?v=1', true, { apHidden: { v: 1, pairs } });
      expect(latest!.sentences).toEqual([expect.stringMatching(/^필터 “name20:contains:x”/)]);
    });

    it('Reset clears only the filter key and the legacy keys: sort, page and q stay', () => {
      mount('?v=1&sort=size:desc&page=2&q=x&maker=', true, { apHidden: { v: 1, pairs: [['filter', 'ghost:contains:x']] } });
      expect(latest!.recoverKeys).toEqual(['filter', 'status', 'maker']);
      const before = window.history.length;
      fireEvent.click(screen.getByRole('button', { name: '초기화' }));
      expect(window.history.length - before).toBeLessThanOrEqual(1);
      expect(pagesSeen).toEqual([]);
      expect(params().has('maker')).toBe(false);
      expect(params().get('sort')).toBe('size:desc');
      expect(params().get('page')).toBe('2');
      expect(params().get('q')).toBe('x');
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('a bad sort alone keeps the conditions; both bad shows both sentences and clears all bad keys', () => {
      mount('?v=1&sort=nope&page=2', true, { apHidden: { v: 1, pairs: [['filter', 'name:contains:a']] } });
      expect(latest!.recoverKeys).toEqual(['sort', 'page']);
      fireEvent.click(screen.getByRole('button', { name: '초기화' }));
      expect(pagesSeen).toEqual(['name:contains:a']);
      cleanup();
      mount('?v=1&sort=nope', true, { apHidden: { v: 1, pairs: [['filter', 'ghost:contains:a']] } });
      expect(latest!.sentences).toHaveLength(2);
      expect(latest!.recoverKeys).toEqual(['sort', 'page', 'filter', 'status', 'maker']);
      fireEvent.click(screen.getByRole('button', { name: '초기화' }));
      expect(screen.queryByRole('alert')).toBeNull();
      expect(pagesSeen).toEqual([]);
    });
  });

  describe('without the option (opt-out)', () => {
    it('adds no filters to urlState, no filterRead, the same sort/page patch and the default recovery', () => {
      mount('?v=1&sort=size:desc&page=2&q=x&status=active', false, { apHidden: { v: 1, pairs: [['filter', 'ghost:contains:x']] } });
      expect(latest!.urlState).toEqual({ page: 2, sorting: [{ id: 'size', desc: true }], onChange: expect.any(Function) });
      expect(latest!.filterRead).toBeNull();
      expect(latest!.recoverKeys).toEqual(['sort', 'page']);
      change({ page: 3, sorting: [] });
      expect(params().get('page')).toBe('3');
      expect(params().get('status')).toBe('active'); // legacy keys are not read or rewritten
      expect(pagesSeen).toEqual(['ghost:contains:x']);
    });

    it('a filters field on onChange is ignored without the option', () => {
      mount('?v=1', false);
      change({ page: null, sorting: [], filters: [{ id: 'name', op: 'contains', value: 'a' }] });
      expect(pagesSeen).toEqual([]);
    });
  });
});
