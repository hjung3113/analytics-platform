// @vitest-environment jsdom
import { act, Suspense, type ReactElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Settings } from 'lucide-react';
import { groupId, menuPermission, spaceId } from '@ap/contracts';
import { createRegistry, I18nProvider, PlatformProvider, useQueryDraft } from '@ap/kernel';
import { memoryStorage, settleQueries, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { GlobalContextBar } from '@ap/shell';
import type { PageFilterField } from '@ap/components';
import { manifests } from '@ap/menu-configuration';

const controls = vi.hoisted(() => ({ fields: [] as readonly PageFilterField[] }));
vi.mock('@ap/components', async original => ({ ...await original<object>(),
  PageFilterBar: ({ fields, actions }: { fields: readonly PageFilterField[]; actions: ReactNode }) => { controls.fields = fields; return <div>{actions}</div>; },
}));
const registry = createRegistry({ permissions: [menuPermission('analytics:view')], spaces: [testSpace({ homeMenuId: 'configuration' })], groups: [{ id: groupId('configuration'), space: spaceId('mars'), label: { ko: '설정', en: 'Configuration' }, icon: Settings }], menus: manifests });
let draft: ReturnType<typeof useQueryDraft>;
function Probe() { draft = useQueryDraft(); return null; }
let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('sessionStorage', memoryStorage());
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  window.history.replaceState(null, '', '/mars/configuration?v=1&from=2026-11-16T00:00:00&to=2026-11-18T00:00:00&mode=reference&ref=EQ01&hideSameCols=1');
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
  const applies = () => [...host.querySelectorAll<HTMLButtonElement>('button')].filter(button => button.textContent === '적용');
  expect(applies()).toHaveLength(1);
  expect(host.textContent).not.toContain('비교 실행');
  expect(host.textContent).toContain('설비 12대');
  expect(host.textContent).toContain('기준 설비 비교');
  expect(host.textContent).toContain('기준 설비 EQ01');
  expect(host.textContent).toContain('차이 없는 설비 숨기기');
  expect(host.textContent).toContain('기간 종료 시점 · 합성');
  expect(host.textContent).not.toContain('mode reference');
  expect(host.textContent).not.toContain('hideSameCols 1');
  act(() => equipment().props.onValuesChange([]));
  expect(equipment().props.values).toEqual([]);
  expect(draft.draft.page).toContainEqual(['equipment', 'none']);
  expect(host.textContent).toContain('설비 0대');
  expect(host.textContent).toContain('설비 12대');
  expect(applies()[0].disabled).toBe(true);
  expect(host.textContent).toContain('설비를 2대 이상 선택하세요');
  expect(new URLSearchParams(window.location.search).has('equipment')).toBe(false);
  act(() => equipment().props.onValuesChange(['EQ03', 'EQ04']));
  expect(applies()[0].disabled).toBe(true);
  expect(host.textContent).toContain('선택한 설비 중 기준을 고르세요');
  act(() => {
    draft.setDraftPage({ ref: 'EQ03' });
    draft.setDraftGlobal({ from: '2026-11-17T00:00:00', to: '2026-11-18T12:00:00' });
  });
  expect(new URLSearchParams(window.location.search).get('to')).toBe('2026-11-18T00:00:00');
  expect(applies()[0].disabled).toBe(false);
  act(() => applies()[0].click());
  await settleQueries();
  expect(new URLSearchParams(window.location.search).get('equipment')).toBe('EQ03,EQ04');
  expect(new URLSearchParams(window.location.search).get('to')).toBe('2026-11-18T12:00:00');
  expect(host.textContent).toContain('설비 2대');
});
