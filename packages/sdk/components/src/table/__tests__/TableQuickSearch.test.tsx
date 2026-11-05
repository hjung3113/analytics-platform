// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { House } from 'lucide-react';
import { I18nProvider, PlatformProvider, createRegistry, usePlatform, type MenuEntry } from '@ap/kernel';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { groupId, spaceId } from '@ap/contracts';
import { TableQuickSearch } from '../TableQuickSearch';

afterEach(cleanup);

const menu: MenuEntry = {
  id: 'home', path: '/list', primary: true, group: groupId('overview'), label: { ko: '목록', en: 'List' }, description: { ko: '', en: '' }, icon: House,
  permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'management',
  features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: ['sort', 'page', 'q', 'k', 'tab'],
};
const registry = createRegistry({ spaces: [testSpace()], groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }], menus: [menu] });
const session = testSession(['platform:view']);

/** The external URL change (Back/Forward, a link) the test drives from outside the field. */
let externalHref = '/list?v=1';
function NavigateButton() {
  const { navigate } = usePlatform();
  return <button type="button" onClick={() => navigate(externalHref)}>이동</button>;
}
function mount(search: string, element = <TableQuickSearch pageKey="q" label="설비 검색" />, label = '설비 검색') {
  window.history.replaceState(null, '', `/list${search}`);
  render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={registry}>{element}<NavigateButton /></PlatformProvider></I18nProvider>);
  return {
    box: screen.getByLabelText(label) as HTMLInputElement,
    params: () => new URLSearchParams(window.location.search),
    go: () => { fireEvent.click(screen.getByRole('button', { name: '이동' })); },
  };
}

describe('TableQuickSearch (06 §15 quick search slot, #1232)', () => {
  it('describes a nonempty dirty draft with the Enter hint, removing it after apply', () => {
    const view = mount('?v=1');
    expect(screen.queryByText('Enter로 검색')).toBeNull();
    expect(view.box).not.toHaveAttribute('aria-describedby');
    fireEvent.change(view.box, { target: { value: 'etch' } });
    const hint = screen.getByText('Enter로 검색');
    expect(hint).toBeVisible();
    expect(view.box).toHaveAttribute('aria-describedby', hint.id);
    expect(view.box).toHaveAccessibleDescription('Enter로 검색');
    fireEvent.keyDown(view.box, { key: 'Enter' });
    expect(screen.queryByText('Enter로 검색')).toBeNull();
    expect(view.box).not.toHaveAttribute('aria-describedby');
  });

  it.each(['', 'etch'])('removes the draft hint when cleared (applied=%s)', applied => {
    const view = mount(applied ? `?v=1&q=${applied}` : '?v=1');
    expect(screen.queryByText('Enter로 검색')).toBeNull();
    fireEvent.change(view.box, { target: { value: 'new draft' } });
    expect(screen.getByText('Enter로 검색')).toBeVisible();
    fireEvent.change(view.box, { target: { value: '' } });
    expect(screen.queryByText('Enter로 검색')).toBeNull();
    expect(view.box).not.toHaveAttribute('aria-describedby');
    expect(view.params().has('q')).toBe(false);
  });

  it('removes the hint when the draft matches the applied value again', () => {
    const view = mount('?v=1&q=etch');
    fireEvent.change(view.box, { target: { value: 'new draft' } });
    expect(screen.getByText('Enter로 검색')).toBeVisible();
    fireEvent.change(view.box, { target: { value: 'etch' } });
    expect(screen.queryByText('Enter로 검색')).toBeNull();
    expect(view.box).not.toHaveAttribute('aria-describedby');
  });

  it('hides the hint during IME composition and restores it when composition ends', () => {
    const view = mount('?v=1');
    fireEvent.change(view.box, { target: { value: 'draft' } });
    expect(screen.getByText('Enter로 검색')).toBeVisible();
    fireEvent.compositionStart(view.box);
    fireEvent.change(view.box, { target: { value: '설비' } });
    expect(screen.queryByText('Enter로 검색')).toBeNull();
    expect(view.box).not.toHaveAttribute('aria-describedby');
    fireEvent.compositionEnd(view.box);
    expect(screen.getByText('Enter로 검색')).toBeVisible();
    expect(view.params().has('q')).toBe(false);
  });

  it('removes the hint when external navigation rebases the draft', () => {
    const view = mount('?v=1');
    fireEvent.change(view.box, { target: { value: 'draft' } });
    expect(screen.getByText('Enter로 검색')).toBeVisible();
    externalHref = '/list?v=1&q=applied';
    view.go();
    expect(screen.queryByText('Enter로 검색')).toBeNull();
    expect(view.box).not.toHaveAttribute('aria-describedby');
  });

  it('localizes the draft hint and its accessible description in English', () => {
    const storage = memoryStorage();
    storage.setItem('platform:lang', 'en');
    vi.stubGlobal('localStorage', storage);
    try {
      const view = mount('?v=1');
      fireEvent.change(view.box, { target: { value: 'etch' } });
      expect(screen.getByText('Press Enter to search')).toBeVisible();
      expect(view.box).toHaveAccessibleDescription('Press Enter to search');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('Enter applies the draft to the declared page key and resets the page', () => {
    const view = mount('?v=1&page=3');
    fireEvent.change(view.box, { target: { value: 'etch' } });
    fireEvent.keyDown(view.box, { key: 'Enter' });
    expect(view.params().get('q')).toBe('etch');
    expect(view.params().has('page')).toBe(false); // back to page 1, today's `page: null`
  });

  it('typing alone does not apply', () => {
    const view = mount('?v=1&page=3');
    fireEvent.change(view.box, { target: { value: 'etch' } });
    expect(view.params().has('q')).toBe(false);
    expect(view.params().get('page')).toBe('3');
  });

  it('emptying applies at once only when something was applied', () => {
    const applied = mount('?v=1&q=etch');
    fireEvent.change(applied.box, { target: { value: '' } }); // the native × or an emptied draft applies at once
    expect(applied.params().has('q')).toBe(false);
    cleanup();
    const empty = mount('?v=1&page=3');
    fireEvent.change(empty.box, { target: { value: 'ab' } });
    fireEvent.change(empty.box, { target: { value: '' } }); // nothing was applied: no navigation, the page stays
    expect(empty.params().has('q')).toBe(false);
    expect(window.location.search).toBe('?v=1&page=3');
  });

  it('an applied value changed from outside rebases the draft', () => {
    const view = mount('?v=1');
    fireEvent.change(view.box, { target: { value: 'draft' } }); // a pending draft…
    externalHref = '/list?v=1&q=applied&page=3';
    view.go(); // …is discarded when the URL changes from outside (Back/Forward, a clear)
    expect(view.box.value).toBe('applied');
    const entries = window.history.length;
    fireEvent.keyDown(view.box, { key: 'Enter' }); // draft === applied: no new entry, the page stays
    expect(window.history.length).toBe(entries);
    expect(view.params().get('page')).toBe('3');
  });

  it.each([
    ['isComposing', { key: 'Enter', isComposing: true }],
    ['keyCode 229', { key: 'Enter', keyCode: 229 }],
  ])('an Enter that belongs to an IME composition (%s) commits nothing', (_name, init) => {
    const view = mount('?v=1');
    fireEvent.change(view.box, { target: { value: '설비' } });
    fireEvent.compositionStart(view.box);
    fireEvent.keyDown(view.box, init);
    expect(view.params().has('q')).toBe(false);
    expect(view.box.value).toBe('설비');
  });

  it('the Safari Enter right after compositionend does not apply; a later intentional Enter applies once', async () => {
    const view = mount('?v=1');
    fireEvent.change(view.box, { target: { value: '설비' } });
    fireEvent.compositionStart(view.box);
    fireEvent.compositionEnd(view.box);
    fireEvent.keyDown(view.box, { key: 'Enter' });
    expect(view.params().has('q')).toBe(false);
    await new Promise(resolve => requestAnimationFrame(() => resolve(null))); // the guard releases on the next frame
    fireEvent.keyDown(view.box, { key: 'Enter' });
    expect(view.params().get('q')).toBe('설비');
  });

  it('custom pageKey and resetKeys, placeholder separate from the aria label', () => {
    const view = mount('?v=1&page=3&tab=audit', <TableQuickSearch pageKey="k" label="모델 검색" placeholder="MODEL-X" resetKeys={['page', 'tab']} />, '모델 검색');
    expect(view.box.value).toBe('');
    expect(view.box.getAttribute('placeholder')).toBe('MODEL-X');
    fireEvent.change(view.box, { target: { value: 'X1' } });
    fireEvent.keyDown(view.box, { key: 'Enter' });
    expect(view.params().get('k')).toBe('X1');
    expect(view.params().has('page')).toBe(false);
    expect(view.params().has('tab')).toBe(false);
  });
});
