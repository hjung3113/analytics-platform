import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, describe, expect, it } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry, usePlatform } from '@ap/kernel';
import { PlatformPage } from '../PlatformPage';
import { ReturnLink } from '../DrillLayout';
import type { ReactNode } from 'react';
import { noContext, testAdapter, testSession, testSpace , useToastsForTest } from '@ap/kernel/testing';
import { carrySetId, groupId, spaceId, type GroupId } from '@ap/contracts';

function menu(id: string, label: string, group: GroupId, path: string, over: object = {}) {
  return { id, group, primary: true, label: { ko: label, en: label }, description: { ko: '', en: '' }, path, icon: House, permission: 'platform:view' as const, requiresScope: false, context: noContext, pageType: 'overview' as const, features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [], ...over };
}
// `carry` carries `returnTo`; `mars` does not (like a feature space and the analysis spaces).
const registry = createRegistry({
  carrySets: [{ id: carrySetId('carry'), pageKeys: ['returnTo'] }],
  spaces: [
    testSpace({ id: spaceId('carry'), label: { ko: 'Feature', en: 'Feature' }, homeMenuId: 'carry-inbox' }),
    testSpace({ id: spaceId('mars'), label: { ko: 'MARS', en: 'MARS' }, homeMenuId: 'overview' }),
  ],
  groups: [
    { id: groupId('carry'), label: { ko: 'VOC', en: 'VOC' }, icon: House, space: spaceId('carry') },
    { id: groupId('mars'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') },
    { id: groupId('global'), label: { ko: '전역', en: 'Global' }, icon: House, space: null },
  ],
  menus: [
    menu('carry-inbox', '수신함', groupId('carry'), '/carry/vocs', { pageKeys: ['returnTo'], carrySet: carrySetId('carry') }),
    menu('overview', '생산성 개요', groupId('mars'), '/', { pageKeys: ['step'], contextResetKeys: ['step'], drill: { levels: [{ key: 'step', label: { ko: '단계', en: 'Step' } }] } }),
    menu('mars-other', '다른 화면', groupId('mars'), '/other', { primary: false, parent: 'overview', pageKeys: ['returnTo'] }),
    menu('notices', '공지', groupId('global'), '/notices', { pageKeys: [] }),
  ],
});
const adapter = () => { const session = testSession(['platform:view']); return testAdapter({ session: () => session }); };
function Toasts() { return <ul data-toasts>{useToastsForTest().map(toast => <li key={toast.id}>{toast.text}</li>)}</ul>; }
function mount(url: string, secondaryActions?: ReactNode, bodyAction?: ReactNode) {
  window.history.replaceState(null, '', url);
  return render(<I18nProvider><PlatformProvider adapter={adapter()} registry={registry}><PlatformPage secondaryActions={secondaryActions}>{bodyAction}<p>body</p></PlatformPage><Toasts /></PlatformProvider></I18nProvider>);
}
const enc = encodeURIComponent;

function OpenDetail({ href }: { href: string }) {
  const { navigate } = usePlatform();
  return <button type="button" onClick={() => navigate(href)}>Open detail</button>;
}

afterEach(() => cleanup());

describe('PlatformPage return row (#760, ADR-0081 UX-10)', () => {
  it.each([
    { kind: 'recorded', name: '← 생산성 개요로 돌아가기 (PHOTO)', system: 'MARS에서 왔습니다' },
    { kind: 'unrecorded', name: '← 이전 화면으로 돌아가기', system: null },
    { kind: 'parent fallback', name: '← 생산성 개요', system: null },
  ])('shows the correct return display for $kind', ({ kind, name, system }) => {
    const origin = '/mars/overview?v=1&step=PHOTO';
    const target = `/carry/vocs?v=1&returnTo=${enc(origin)}`;
    if (kind === 'recorded') {
      mount(origin, undefined, <OpenDetail href={target} />);
      fireEvent.click(screen.getByRole('button', { name: 'Open detail' }));
    } else if (kind === 'unrecorded') mount(target);
    else mount('/other?v=1', undefined, <ReturnLink />);
    const link = screen.getByRole('link', { name });
    const row = document.querySelector('[data-return-row]');
    if (kind === 'parent fallback') {
      expect(row).toBeNull();
      expect(link).toHaveAttribute('href', '/mars/overview?v=1');
    } else {
      expect(link).toHaveAttribute('href', origin);
      expect(row?.textContent).toBe(name + (system ?? ''));
      expect(row!.compareDocumentPosition(document.querySelector('[data-platform-page-content]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it('omits the system sentence when the recorded origin has no space', () => {
    const origin = '/notices?v=1';
    mount(origin, undefined, <OpenDetail href={`/carry/vocs?v=1&returnTo=${enc(origin)}`} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open detail' }));
    expect(screen.getByRole('link', { name: '← 공지로 돌아가기' })).toBeTruthy();
    expect(screen.queryByText(/에서 왔습니다/)).toBeNull();
  });

  it('does not announce reverted Context when the row link is followed (the space carries none by design)', () => {
    mount(`/carry/vocs?v=1&returnTo=${enc('/?v=1&scopeId=MEM&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00')}`);
    fireEvent.click(screen.getByRole('link', { name: '← 이전 화면으로 돌아가기' }));
    expect(document.querySelector('[data-toasts]')!.children).toHaveLength(0);
    expect(screen.queryByText(/되돌렸습니다/)).toBeNull();
  });

  it.each([
    { name: 'no returnTo', url: '/carry/vocs?v=1' },
    { name: 'an unknown path', url: `/carry/vocs?v=1&returnTo=${enc('/nowhere?v=1')}` },
    { name: 'an absolute URL', url: `/carry/vocs?v=1&returnTo=${enc('https://evil.test/')}` },
  ])('draws no row for $name', ({ url }) => {
    mount(url);
    expect(document.querySelector('[data-return-row]')).toBeNull();
    expect(screen.queryByText(/돌아가기/)).toBeNull();
  });
});

it('shows one return row first in the body and omits the same-system sentence', () => {
  const origin = '/mars/overview?v=1';
  mount(origin, undefined, <OpenDetail href={`/other?v=1&returnTo=${enc(origin)}`} />);
  fireEvent.click(screen.getByRole('button', { name: 'Open detail' }));
  const rows = document.querySelectorAll('[data-return-row]');
  expect(rows).toHaveLength(1);
  expect(document.querySelector('[data-platform-page-body]')?.firstElementChild).toBe(rows[0]);
  expect(screen.getByRole('link', { name: '← 생산성 개요로 돌아가기' })).toHaveAttribute('href', origin);
  expect(screen.queryByText(/에서 왔습니다/)).toBeNull();
});

it('keeps a nested header return only for the fallback and shows the body return once', () => {
  const actions = <><ReturnLink /><button type="button">Another action</button></>;
  const accepted = mount(`/other?v=1&returnTo=${enc('/?v=1')}`, actions);
  fireEvent.click(screen.getByRole('button', { name: '더보기' }));
  // The prefix also matches a leaked standalone ReturnLink («← 이전 화면»), so the row is the only return control.
  const returns = screen.getAllByRole('link', { name: /^← 이전 화면/ });
  expect(returns).toHaveLength(1);
  expect(returns[0]).toHaveAccessibleName('← 이전 화면으로 돌아가기');
  expect(screen.getByRole('button', { name: 'Another action' })).toBeVisible();
  accepted.unmount();

  mount('/other?v=1', actions);
  fireEvent.click(screen.getByRole('button', { name: '더보기' }));
  expect(document.querySelector('[data-return-row]')).toBeNull();
  expect(screen.getByRole('link', { name: '← 생산성 개요' })).toBeVisible();
});

it('replaces an accepted return supplied by a page inside its body', () => {
  mount(`/other?v=1&returnTo=${enc('/?v=1')}`, undefined, <ReturnLink />);
  const returns = screen.getAllByRole('link', { name: /^← 이전 화면/ });
  expect(returns).toHaveLength(1);
  expect(returns[0]).toHaveAccessibleName('← 이전 화면으로 돌아가기');
  expect(returns[0].closest('[data-return-row]')).toBeTruthy();
});
