// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { House } from 'lucide-react';
import { I18nProvider, PlatformProvider, createRegistry, type MenuEntry } from '@ap/kernel';
import { PageKeyWarning, TableUrlWarning, usePageKeyRules, useTableUrlWarning, type PageKeyRule } from '../tableUrlWarning';
import { noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { groupId, spaceId } from '@ap/contracts';

afterEach(cleanup);

const menu: MenuEntry = {
  id: 'home', path: '/list', primary: true, group: groupId('overview'), label: { ko: '목록', en: 'List' }, description: { ko: '', en: '' }, icon: House,
  permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'management',
  features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: ['sort', 'page', 'q', 'mode', 'n'],
};
const registry = createRegistry({ spaces: [testSpace()], groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }], menus: [menu] });
const session = testSession(['platform:view']);

function Probe() {
  const warning = useTableUrlWarning(['name', 'size']);
  return <div>
    <span data-testid="state">{String(warning.invalid)}|{warning.parsedSort.ok ? 'sort-ok' : 'sort-bad'}|{warning.parsedPage.ok ? 'page-ok' : 'page-bad'}</span>
    {warning.invalid && <TableUrlWarning sentences={warning.sentences} />}
  </div>;
}

function FilterProbe({ withFilters }: { withFilters: boolean }) {
  const warning = useTableUrlWarning(['name']);
  const slot = <button type="button">필터 · 1</button>;
  return withFilters ? <TableUrlWarning filters={slot} sentences={warning.sentences} /> : <>{slot}<TableUrlWarning sentences={warning.sentences} /></>;
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

  it.each([true, false])('filters slot (%s): renders before the alert inside one wrapper only when given', withFilters => {
    window.history.replaceState(null, '', '/list?v=1&sort=nope');
    const { container } = render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={registry}><FilterProbe withFilters={withFilters} /></PlatformProvider></I18nProvider>);
    const slot = screen.getByRole('button', { name: '필터 · 1' });
    const alert = screen.getByRole('alert');
    expect(slot.compareDocumentPosition(alert) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const wrapper = slot.parentElement!;
    expect(wrapper.classList.contains('gap-3')).toBe(withFilters);
    expect(alert.parentElement).toBe(wrapper);
    expect(wrapper === container).toBe(!withFilters);
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

  it.each(['click', 'keyboard'] as const)('Reset restores focus to main before disappearing (%s)', async method => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/list?v=1&sort=nope&page=0');
    render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={registry}>
      <main tabIndex={-1}><Probe /></main>
    </PlatformProvider></I18nProvider>);
    const button = screen.getByRole('button', { name: '초기화' });
    button.focus();
    expect(document.activeElement).toBe(button);

    if (method === 'click') await user.click(button);
    else await user.keyboard('{Enter}');

    expect(screen.queryByRole('button', { name: '초기화' })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('main'));
  });
});

describe('PageKeyWarning filters slot (ADR-0034)', () => {
  it('renders the filters slot above the alert inside a gap-3 wrapper', () => {
    window.history.replaceState(null, '', '/list?v=1');
    render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={registry}>
      <PageKeyWarning sentences={['역할 “x”은 이 화면에서 쓸 수 없는 값입니다.']} onRecover={() => {}} filters={<button type="button">필터 · 1</button>} />
    </PlatformProvider></I18nProvider>);
    const slot = screen.getByRole('button', { name: '필터 · 1' });
    const alert = screen.getByRole('alert');
    expect(slot.compareDocumentPosition(alert) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(slot.parentElement!.classList.contains('gap-3')).toBe(true);
    expect(alert.parentElement).toBe(slot.parentElement);
  });
});

describe('usePageKeyRules + PageKeyWarning (rejected page keys, #852)', () => {
  const rules: PageKeyRule[] = [
    { key: 'mode', label: { ko: '보기', en: 'View' }, valid: raw => raw === 'a' || raw === 'b' },
    { key: 'n', label: { ko: '개수', en: 'Count' }, valid: raw => /^[1-9]\d*$/.test(raw) },
  ];
  function RulesProbe() {
    const { invalid, sentences, badKeys, recover } = usePageKeyRules(rules);
    return <div>
      <span data-testid="bad">{badKeys.join(',') || 'none'}</span>
      {invalid ? <PageKeyWarning sentences={sentences} onRecover={recover} /> : <p>body</p>}
    </div>;
  }
  const mountRules = (search: string) => {
    window.history.replaceState(null, '', `/list${search}`);
    return render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={registry}>
      <main tabIndex={-1}><RulesProbe /></main>
    </PlatformProvider></I18nProvider>);
  };

  it('accepts absent and valid keys', () => {
    mountRules('?v=1&mode=b&n=3');
    expect(screen.getByTestId('bad').textContent).toBe('none');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('rejects each bad key with its field name and raw value, never correcting it', () => {
    mountRules('?v=1&mode=zz&n=0&q=keep');
    expect(screen.getByTestId('bad').textContent).toBe('mode,n');
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('필터 값이 올바르지 않습니다');
    expect([...alert.querySelectorAll('p')].map(p => p.textContent)).toEqual([
      '보기 “zz”는 이 화면에서 쓸 수 없는 값입니다. 조건을 초기화하세요.',
      '개수 “0”는 이 화면에서 쓸 수 없는 값입니다. 조건을 초기화하세요.',
    ]);
    expect(new URLSearchParams(window.location.search).get('mode')).toBe('zz');
  });

  it('Reset clears exactly the bad keys in one navigation and leaves focus on main', async () => {
    const user = userEvent.setup();
    mountRules('?v=1&mode=zz&n=0&q=keep');
    const push = vi.spyOn(window.history, 'pushState');
    const replace = vi.spyOn(window.history, 'replaceState');
    const button = screen.getByRole('button', { name: '초기화' });
    button.focus();
    await user.keyboard('{Enter}');
    const params = new URLSearchParams(window.location.search);
    expect(params.has('mode')).toBe(false);
    expect(params.has('n')).toBe(false);
    expect(params.get('q')).toBe('keep');
    expect(push.mock.calls.length + replace.mock.calls.length).toBe(1);
    push.mockRestore();
    replace.mockRestore();
    expect(screen.getByText('body')).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('main'));
  });
});
