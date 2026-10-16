// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { House } from 'lucide-react';
import type { Session } from '@ap/contracts';
import { I18nProvider, PlatformProvider, createRegistry, type MenuEntry } from '@ap/kernel';
import { TableUrlWarning, useTableUrlWarning } from './tableUrlWarning';
import { noContext, testAdapter, testSpace } from './test-support';

afterEach(cleanup);

const menu: MenuEntry = {
  id: 'home', path: '/list', primary: true, group: 'overview', label: { ko: '목록', en: 'List' }, description: { ko: '', en: '' }, icon: House,
  permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'management',
  features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: ['sort', 'page', 'q'],
};
const registry = createRegistry({ spaces: [testSpace()], groups: [{ id: 'overview', label: { ko: '개요', en: 'Overview' }, icon: House, space: 'analytics' }], menus: [menu] });
const session: Session = { user: { id: 'u1', name: 'u1', title: { ko: 'u1', en: 'u1' }, permissions: ['platform:view'] }, scopes: [] };

function Probe() {
  const warning = useTableUrlWarning(['name', 'size']);
  return <div>
    <span data-testid="state">{String(warning.invalid)}|{warning.parsedSort.ok ? 'sort-ok' : 'sort-bad'}|{warning.parsedPage.ok ? 'page-ok' : 'page-bad'}</span>
    {warning.invalid && <TableUrlWarning sentences={warning.sentences} />}
  </div>;
}

function mount(search: string) {
  window.history.replaceState(null, '', `/list${search}`);
  return render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={registry}><Probe /></PlatformProvider></I18nProvider>);
}

const SORT = '정렬 “nope”은 이 화면에서 쓸 수 없는 값입니다. 조건을 초기화하세요.';
const PAGE = '페이지 “0”는 이 화면에서 쓸 수 없는 값입니다. 조건을 초기화하세요.';

describe('useTableUrlWarning + TableUrlWarning (06 §15, ADR-0034)', () => {
  it('renders nothing for valid or absent sort/page', () => {
    mount('?v=1&sort=name:desc&page=2');
    expect(screen.getByTestId('state').textContent).toBe('false|sort-ok|page-ok');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it.each([
    ['bad sort', '?v=1&sort=nope', 'sort-bad|page-ok', [SORT]],
    ['unlisted sort column', '?v=1&sort=other:asc', 'sort-bad|page-ok', ['정렬 “other:asc”은 이 화면에서 쓸 수 없는 값입니다. 조건을 초기화하세요.']],
    ['bad page', '?v=1&page=0', 'sort-ok|page-bad', [PAGE]],
    ['both', '?v=1&sort=nope&page=0', 'sort-bad|page-bad', [SORT, PAGE]],
  ])('%s: one danger message with one sentence per bad field', (_name, search, state, sentences) => {
    mount(search);
    expect(screen.getByTestId('state').textContent).toBe(`true|${state}`);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('정렬·페이지 값이 올바르지 않습니다');
    expect([...alert.querySelectorAll('p')].map(p => p.textContent)).toEqual(sentences);
    expect(alert.textContent).not.toMatch(/sort=|page=/);
  });

  it('Reset writes one navigation that removes sort and page and keeps other keys', () => {
    mount('?v=1&q=abc&sort=nope&page=0');
    const before = window.history.length;
    fireEvent.click(screen.getByRole('button', { name: '초기화' }));
    const params = new URLSearchParams(window.location.search);
    expect(params.has('sort')).toBe(false);
    expect(params.has('page')).toBe(false);
    expect(params.get('q')).toBe('abc');
    expect(window.history.length - before).toBeLessThanOrEqual(1);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
