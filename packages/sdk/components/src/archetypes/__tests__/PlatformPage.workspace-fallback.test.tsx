import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest';
import { House } from 'lucide-react';
import { groupId, spaceId } from '@ap/contracts';
import { createRegistry, I18nProvider, PlatformProvider } from '@ap/kernel';
import { memoryStorage, noContext, testAdapter, testSpace } from '@ap/kernel/testing';
import { PlatformPage } from '../PlatformPage';
import { WorkspaceQueryBarRow } from '../WorkspaceQueryBar';
import { useReportQueryBarStatus } from '../../filters/QueryBarStatus';
import { PanelWorkspace } from '../../workspace/PanelWorkspace';
import { installResizeObserver } from '../../dock/__tests__/harness';

const observer = installResizeObserver();
afterAll(() => observer.restore());
beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('sessionStorage', memoryStorage());
  observer.resize(1200, 600);
  window.history.replaceState(null, '', '/');
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const registry = createRegistry({ spaces: [testSpace()], groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }], menus: [{ id: 'home', group: groupId('overview'), primary: true, path: '/', label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, icon: House, permission: 'platform:view', requiresScope: false, context: { ...noContext, time: 'apply' }, query: { mode: 'apply' }, features: { export: false, annotate: false, compare: false, savedView: false }, pageType: 'analysis', pageKeys: [] }] });
const adapter = testAdapter();
function Bar({ row }: { row: boolean }) {
  useReportQueryBarStatus({ folded: true, editing: false, reasonKeys: [] });
  return <section aria-label="조회 조건">{row && <WorkspaceQueryBarRow />}</section>;
}
function Workspace({ name }: { name: string }) {
  return <PanelWorkspace persistKey={name} label={{ ko: name, en: name }} initialPreset="default" initialMode="fit" panels={[
    { id: 'chart', primary: true, title: { ko: `${name} 차트`, en: `${name} chart` }, render: () => <p>{name}</p> },
  ]} presets={[
    { id: 'default', label: { ko: '기본', en: 'Default' }, layout: { type: 'group', panels: ['chart'] } },
    { id: 'focus', label: { ko: '집중', en: 'Focus' }, layout: { type: 'group', panels: ['chart'] } },
  ]} />;
}
function view(row: boolean) {
  return <I18nProvider><PlatformProvider registry={registry} adapter={adapter} slots={{ contextBar: <Bar row={row} /> }}>
    <PlatformPage layout="fill" queryResult={{ status: 'done', completedAt: 1_800_000_000_000 }} contextExtension={<button>parameter field</button>}><Workspace name="작업 영역" /></PlatformPage>
  </PlatformProvider></I18nProvider>;
}
it('keeps the old status, head and toolbar until a replacement row registers, and restores them when it leaves (#1941 C2)', () => {
  const tree = render(view(false));
  const expectFallback = () => {
    expect(screen.getByRole('region', { name: '적용된 조회 조건' })).toHaveTextContent('요약 조회 완료');
    expect(document.querySelector('[data-page-head]')).not.toBeNull();
    expect(document.querySelector('[data-panel-workspace] [data-workspace-toolbar]')).not.toBeNull();
    expect(within(screen.getByRole('region', { name: '조회 조건' })).queryByRole('toolbar')).toBeNull();
  };
  expectFallback();
  tree.rerender(view(true));
  expect(screen.queryByRole('region', { name: '적용된 조회 조건' })).toBeNull();
  expect(within(screen.getByRole('region', { name: '조회 조건' })).getByRole('toolbar')).toBeTruthy();
  tree.rerender(view(false));
  expectFallback();
});

it.each(['첫 작업 영역', '둘째 작업 영역'])('keeps sibling toolbar names and commands independent when %s is removed (#1941 C4)', async removed => {
  const user = userEvent.setup();
  function siblings(names: string[]) {
    return <I18nProvider><PlatformProvider registry={registry} adapter={adapter} slots={{ contextBar: <Bar row /> }}>
      <PlatformPage layout="fill">{names.map(name => <Workspace key={name} name={name} />)}</PlatformPage>
    </PlatformProvider></I18nProvider>;
  }
  const names = ['첫 작업 영역', '둘째 작업 영역'];
  const tree = render(siblings(names));
  const bar = screen.getByRole('region', { name: '조회 조건' });
  const first = within(bar).getByRole('group', { name: names[0] });
  const second = within(bar).getByRole('group', { name: names[1] });
  await user.click(within(first).getByRole('radio', { name: '집중' }));
  expect(within(first).getByRole('radio', { name: '집중' })).toHaveAttribute('aria-checked', 'true');
  expect(within(second).getByRole('radio', { name: '기본' })).toHaveAttribute('aria-checked', 'true');
  await user.click(within(second).getByRole('radio', { name: '집중' }));
  await user.click(within(first).getByRole('radio', { name: '기본' }));
  expect(within(first).getByRole('radio', { name: '기본' })).toHaveAttribute('aria-checked', 'true');
  expect(within(second).getByRole('radio', { name: '집중' })).toHaveAttribute('aria-checked', 'true');
  const remaining = names.filter(name => name !== removed);
  tree.rerender(siblings(remaining));
  expect(within(bar).queryByRole('group', { name: removed })).toBeNull();
  const survivor = within(bar).getByRole('group', { name: remaining[0] });
  await user.click(within(survivor).getByRole('radio', { name: '기본' }));
  expect(within(survivor).getByRole('radio', { name: '기본' })).toHaveAttribute('aria-checked', 'true');
  await user.click(within(survivor).getByRole('radio', { name: '집중' }));
  expect(within(survivor).getByRole('radio', { name: '집중' })).toHaveAttribute('aria-checked', 'true');
});
