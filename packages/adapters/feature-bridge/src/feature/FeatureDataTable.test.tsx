import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { House } from 'lucide-react';
import { groupId, spaceId } from '@ap/contracts';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { noContext, testAdapter, testSpace } from '@ap/kernel/testing';
import { FeatureDataTable } from './FeatureDataTable';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const registry = createRegistry({ spaces: [testSpace({ homeMenuId: 'table' })], groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }], menus: [{ id: 'table', primary: true, icon: House, group: groupId('overview'), label: { ko: '표', en: 'Table' }, description: { ko: '', en: '' }, pageType: 'management', path: '/table', permission: 'platform:view', requiresScope: false, context: noContext, features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [] }] });
const columns = [{ id: 'name', header: '이름', sortable: false, cell: (row: { id: string; name: string }) => row.name }];
let dispose = () => {};
afterEach(() => { dispose(); vi.restoreAllMocks(); document.body.innerHTML = ''; vi.unstubAllGlobals(); });
describe('FeatureDataTable with the real PlatformDataTable', () => {
  it('replaces rendered rows after issue, revoke, filter and cursor data changes', async () => {
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(800);
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(1280);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 1280, 800));
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    const root = createRoot(document.body.appendChild(document.createElement('div')));
    dispose = () => act(() => root.unmount());
    const adapter = testAdapter();
    const show = async (rows: { id: string; name: string }[]) => {
      await act(async () => { root.render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}>
        <FeatureDataTable rows={rows} columns={columns} rowAction={() => null} summary="페이지" pagination={null} preferenceKey="token-refresh" />
      </PlatformProvider></I18nProvider>); });
      await vi.waitFor(() => expect(document.querySelector('[role=table]')?.textContent).toContain(rows[0].name));
    };
    await show([{ id: 'old', name: '기존 토큰' }]);
    await show([{ id: 'new', name: '발급 토큰' }, { id: 'old', name: '기존 토큰' }]);
    await show([{ id: 'new', name: '폐기됨' }]);
    expect(document.querySelector('[role=table]')?.textContent).not.toContain('기존 토큰');
    await show([{ id: 'filtered', name: '무기한 서비스' }]);
    await show([{ id: 'next', name: '다음 쪽 토큰' }]);
    await show([{ id: 'filtered', name: '무기한 서비스' }]);
  });
});
