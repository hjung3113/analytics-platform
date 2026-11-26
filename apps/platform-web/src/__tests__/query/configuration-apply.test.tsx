// @vitest-environment jsdom
import { act, Suspense, type ReactElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Settings } from 'lucide-react';
import { groupId, menuPermission, spaceId } from '@ap/contracts';
import { createRegistry, I18nProvider, PlatformProvider, useQueryDraft } from '@ap/kernel';
import { memoryStorage, settleQueries, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { GlobalContextBar } from '@ap/shell';
import type { PageFilterField, PageFilterSummaryItem } from '@ap/components';
import { manifests } from '@ap/menu-configuration';
import { manifests as hwTimeMenus } from '@ap/menu-hw-time';

const controls = vi.hoisted(() => ({ fields: [] as readonly PageFilterField[], summaryItems: [] as readonly PageFilterSummaryItem[] }));
vi.mock('@ap/components', async original => ({ ...await original<object>(),
  PageFilterBar: ({ fields, actions, summaryItems }: { fields: readonly PageFilterField[]; actions: ReactNode; summaryItems: readonly PageFilterSummaryItem[] }) => {
    controls.fields = fields;
    controls.summaryItems = summaryItems;
    return <div>{actions}</div>;
  },
}));
const registry = createRegistry({
  permissions: [menuPermission('analytics:view')], spaces: [testSpace({ homeMenuId: 'configuration' })],
  groups: [
    { id: groupId('configuration'), space: spaceId('mars'), label: { ko: '설정', en: 'Configuration' }, icon: Settings },
    { id: groupId('hwTime'), space: spaceId('mars'), label: { ko: 'HW Time', en: 'HW Time' }, icon: Settings },
  ],
  menus: [...manifests, ...hwTimeMenus],
});
let draft: ReturnType<typeof useQueryDraft>;
function Probe() { draft = useQueryDraft(); return null; }
let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('sessionStorage', memoryStorage());
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  window.history.replaceState(null, '', '/mars/configuration?v=1&scopeId=MEM&from=2026-11-16T00:00:00&to=2026-11-18T00:00:00&mode=reference&ref=EQ01&hideSameCols=1');
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
function equipment() {
  const field = controls.fields.find(field => field.key === 'equipment');
  if (!field || field.kind !== 'custom') throw new Error('Missing equipment field');
  return field.content as ReactElement<{ values: string[]; onValuesChange: (eq: string[]) => void }>;
}
it('Configuration uses one real kernel Apply, labelled applied summaries and an explicit-empty draft reason', async () => {
  const session = testSession(['analytics:view']);
  const Screen = manifests[0].component!;
  await act(async () => root.render(<I18nProvider><PlatformProvider registry={registry} adapter={testAdapter({ session: () => session })} slots={{ contextBar: <GlobalContextBar /> }}><Suspense fallback={null}><Screen params={{}} /></Suspense><Probe /></PlatformProvider></I18nProvider>));
  await act(async () => { await vi.dynamicImportSettled(); });
  await settleQueries();
  await vi.waitFor(() => expect(controls.fields.map(field => field.key)).toEqual(['equipment', 'mode', 'ref', 'asOf']));
  const applies = () => screen.queryAllByRole('button', { name: '적용' });
  const line = within(screen.getByRole('region', { name: '조회 조건' }));
  const expandQueryBar = () => line.getByRole('button', { name: '조회 조건 펼치기' });
  const queryEditor = () => within(screen.getByRole('dialog', { name: '조회 조건' }));
  // This address already has applied conditions, so the clean bar starts folded.
  expect(applies()).toHaveLength(0);
  expect(host.textContent).not.toContain('비교 실행');
  for (const name of ['설비 12대', '비교 모드 기준 설비 비교', '기준 설비 EQ01', '차이 없는 설비 숨기기 사용', '조회 시점 기간 종료 시점 · 합성']) {
    expect(line.getByRole('button', { name })).toBeVisible();
  }
  expect(line.queryByRole('button', { name: /mode reference|hideSameCols 1/ })).toBeNull();
  fireEvent.click(expandQueryBar());
  expect(applies()).toHaveLength(1);
  expect(queryEditor().getByRole('button', { name: '적용' })).toBe(applies()[0]);
  act(() => equipment().props.onValuesChange([]));
  expect(equipment().props.values).toEqual([]);
  expect(draft.draft.page).toContainEqual(['equipment', 'none']);
  expect(controls.summaryItems).toContainEqual({ key: 'equipment', label: '설비', value: '0대' });
  expect(queryEditor().getByText(/설비를 2대 이상 선택하세요/)).toBeVisible();
  fireEvent.click(line.getByRole('button', { name: '조회 조건 접기' }));
  expect(line.getByRole('button', { name: /^설비 12대/ })).toBeVisible();
  expect(line.queryByRole('button', { name: /^설비 0대/ })).toBeNull();
  expect(applies()).toHaveLength(1);
  expect(applies()[0]).toBeDisabled();
  expect(applies()[0]).toHaveAccessibleDescription(/설비를 2대 이상 선택하세요/);
  expect(new URLSearchParams(window.location.search).has('equipment')).toBe(false);
  fireEvent.click(expandQueryBar());
  act(() => equipment().props.onValuesChange(['EQ03', 'EQ04']));
  expect(applies()).toHaveLength(1);
  const apply = queryEditor().getByRole('button', { name: '적용' });
  expect(apply).toBeDisabled();
  expect(queryEditor().getByText(/선택한 설비 중 기준을 고르세요/)).toBeVisible();
  act(() => {
    draft.setDraftPage({ ref: 'EQ03' });
    draft.setDraftGlobal({ from: '2026-11-17T00:00:00', to: '2026-11-18T12:00:00' });
  });
  expect(new URLSearchParams(window.location.search).get('to')).toBe('2026-11-18T00:00:00');
  expect(apply).toBeEnabled();
  fireEvent.click(apply);
  await settleQueries();
  expect(new URLSearchParams(window.location.search).get('equipment')).toBe('EQ03,EQ04');
  expect(new URLSearchParams(window.location.search).get('to')).toBe('2026-11-18T12:00:00');
  expect(expandQueryBar().getAttribute('aria-expanded')).toBe('false');
  expect(applies()).toHaveLength(0);
  expect(line.getByRole('button', { name: '설비 2대' })).toBeVisible();
});
