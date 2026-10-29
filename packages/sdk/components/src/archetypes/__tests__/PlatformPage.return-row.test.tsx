import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, describe, expect, it } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { PlatformPage } from '../PlatformPage';
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
    menu('overview', '생산성 개요', groupId('mars'), '/', { pageKeys: [] }),
    menu('mars-other', '다른 화면', groupId('mars'), '/other', { primary: false, pageKeys: ['returnTo'] }),
    menu('notices', '공지', groupId('global'), '/notices', { pageKeys: [] }),
  ],
});
const adapter = () => { const session = testSession(['platform:view']); return testAdapter({ session: () => session }); };
function Toasts() { return <ul data-toasts>{useToastsForTest().map(toast => <li key={toast.id}>{toast.text}</li>)}</ul>; }
function mount(url: string) {
  window.history.replaceState(null, '', url);
  return render(<I18nProvider><PlatformProvider adapter={adapter()} registry={registry}><PlatformPage><p>body</p></PlatformPage><Toasts /></PlatformProvider></I18nProvider>);
}
const enc = encodeURIComponent;

afterEach(() => cleanup());

describe('PlatformPage return row (#760, ADR-0081 UX-10)', () => {
  it('draws the way back and the origin system for an accepted returnTo in a space that carries it', () => {
    mount(`/carry/vocs?v=1&returnTo=${enc('/?v=1&scopeId=MEM')}`);
    const link = screen.getByRole('link', { name: '← 생산성 개요로 돌아가기' });
    expect(link).toHaveAttribute('href', '/?v=1&scopeId=MEM');
    expect(screen.getByText('MARS에서 왔습니다')).toBeTruthy();
    const row = document.querySelector('[data-return-row]')!;
    expect(row.compareDocumentPosition(document.querySelector('[data-platform-page-content]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('omits the system sentence when the origin menu has no space', () => {
    mount(`/carry/vocs?v=1&returnTo=${enc('/notices?v=1')}`);
    expect(screen.getByRole('link', { name: '← 공지로 돌아가기' })).toBeTruthy();
    expect(screen.queryByText(/에서 왔습니다/)).toBeNull();
  });

  it('does not announce reverted Context when the row link is followed (the space carries none by design)', () => {
    mount(`/carry/vocs?v=1&returnTo=${enc('/?v=1&scopeId=MEM&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00')}`);
    fireEvent.click(screen.getByRole('link', { name: '← 생산성 개요로 돌아가기' }));
    expect(document.querySelector('[data-toasts]')!.children).toHaveLength(0);
    expect(screen.queryByText(/되돌렸습니다/)).toBeNull();
  });

  it.each([
    { name: 'no returnTo', url: '/carry/vocs?v=1' },
    { name: 'an unknown path', url: `/carry/vocs?v=1&returnTo=${enc('/nowhere?v=1')}` },
    { name: 'an absolute URL', url: `/carry/vocs?v=1&returnTo=${enc('https://evil.test/')}` },
    { name: 'a space that does not carry returnTo', url: `/other?v=1&returnTo=${enc('/?v=1')}` },
  ])('draws no row for $name', ({ url }) => {
    mount(url);
    expect(document.querySelector('[data-return-row]')).toBeNull();
    expect(screen.queryByText(/돌아가기/)).toBeNull();
  });
});
