// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { House } from 'lucide-react';
import { I18nProvider, PlatformProvider, createRegistry, type MenuEntry } from '@ap/kernel';
import { noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import type { TableUrlState } from '../PlatformDataTable';
import { useTableUrlState, type TableUrlChangeReason } from '../tableUrlWarning';
import { groupId, spaceId } from '@ap/contracts';

afterEach(cleanup);

const menu: MenuEntry = {
  id: 'home', path: '/list', primary: true, group: groupId('overview'), label: { ko: '목록', en: 'List' }, description: { ko: '', en: '' }, icon: House,
  permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'management',
  features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: ['sort', 'page', 'q', 'focus'],
};
const registry = createRegistry({ spaces: [testSpace()], groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }], menus: [menu] });
const session = testSession(['platform:view']);

let latest: ReturnType<typeof useTableUrlState> | null = null;
function Probe({ withExtra }: { withExtra: boolean }) {
  latest = useTableUrlState(['name', 'size'], withExtra ? { extraPatch: reason => reason === 'user' ? { focus: null } : undefined } : undefined);
  return <span data-testid="state">{latest.urlState ? 'controlled' : 'none'}</span>;
}

function mount(search: string, withExtra = false) {
  window.history.replaceState(null, '', `/list${search}`);
  render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={registry}><Probe withExtra={withExtra} /></PlatformProvider></I18nProvider>);
  return () => latest!.urlState as TableUrlState;
}

const change = (state: TableUrlState, next: { page: number | null; sorting: { id: string; desc: boolean }[] }, reason: TableUrlChangeReason) =>
  act(() => state.onChange(next, reason));

describe('useTableUrlState (06 §6.1, §15)', () => {
  it('is undefined while sort or page is invalid, alongside the useTableUrlWarning result', () => {
    mount('?v=1&sort=nope&page=0');
    expect(screen.getByTestId('state').textContent).toBe('none');
    expect(latest!.invalid).toBe(true);
    expect(latest!.sentences).toHaveLength(2);
  });

  it('keeps page 1 off the URL as null and carries the parsed sorting', () => {
    const state = mount('?v=1&sort=size:desc');
    expect(state()).toMatchObject({ page: null, sorting: [{ id: 'size', desc: true }] });
    cleanup();
    expect(mount('?v=1&page=3')()).toMatchObject({ page: 3, sorting: [] });
  });

  it('a user change pushes one history entry with sort and page; a null page and empty sorting remove the keys', () => {
    const state = mount('?v=1&q=abc&sort=size:desc&page=2');
    const before = window.history.length;
    change(state(), { page: 4, sorting: [{ id: 'name', desc: false }] }, 'user');
    let params = new URLSearchParams(window.location.search);
    expect(params.get('sort')).toBe('name:asc');
    expect(params.get('page')).toBe('4');
    expect(params.get('q')).toBe('abc');
    expect(window.history.length - before).toBe(1);
    change(state(), { page: null, sorting: [] }, 'reset');
    params = new URLSearchParams(window.location.search);
    expect(params.has('sort')).toBe(false);
    expect(params.has('page')).toBe(false);
    expect(window.history.length - before).toBe(2);
  });

  it('a clamp replaces the current entry instead of pushing', () => {
    const state = mount('?v=1&page=9');
    const before = window.history.length;
    change(state(), { page: 2, sorting: [] }, 'clamp');
    expect(new URLSearchParams(window.location.search).get('page')).toBe('2');
    expect(window.history.length).toBe(before);
  });

  it('extraPatch adds page-owned keys to the same write, per reason', () => {
    const state = mount('?v=1&focus=r-first&page=2', true);
    change(state(), { page: 3, sorting: [] }, 'clamp');
    expect(new URLSearchParams(window.location.search).get('focus')).toBe('r-first');
    const before = window.history.length;
    change(state(), { page: 4, sorting: [] }, 'user');
    const params = new URLSearchParams(window.location.search);
    expect(params.get('page')).toBe('4');
    expect(params.has('focus')).toBe(false);
    expect(window.history.length - before).toBe(1);
  });
});
