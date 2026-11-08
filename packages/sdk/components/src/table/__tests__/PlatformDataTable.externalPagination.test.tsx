import { cleanup, render, screen } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { groupId, spaceId } from '@ap/contracts';
import { Button } from '@ap/ui';
import { PlatformDataTable } from '../PlatformDataTable';
import { stubCompactTableGeometry } from '../../testing';

const registry = createRegistry({ spaces: [testSpace({ homeMenuId: 'table' })],
  groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }],
  menus: [{ id: 'table', group: groupId('overview'), primary: true, label: { ko: '표', en: 'Table' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'management', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [] }],
});
const session = testSession(['platform:view']);
const adapter = testAdapter({ session: () => session });
let restore: () => void;
beforeEach(() => { restore = stubCompactTableGeometry(); vi.stubGlobal('localStorage', memoryStorage()); window.history.replaceState(null, '', '/'); });
afterEach(() => { cleanup(); restore(); vi.unstubAllGlobals(); });

describe('PlatformDataTable external keyset pagination', () => {
  it('uses the supplied summary and pager without inventing a total or enabling offset navigation', async () => {
    render(<I18nProvider><PlatformProvider equipmentAxes={[]} adapter={adapter} registry={registry}>
      <PlatformDataTable title="목록" hideTitle ariaLabel="목록" columns={[{ id: 'id', header: 'ID', sortable: false }]} getRowId={(row: { id: string }) => row.id}
        loadPage={async () => ({ outcome: 'ok', assessments: [], trust: null, correlationId: 'test', data: { rows: [{ id: 'a' }], total: 1 } })}
        externalPagination={{ summary: '현재 페이지 1건', controls: <><Button disabled>이전</Button><Button>다음</Button></> }} preferenceKey="external-pager" />
    </PlatformProvider></I18nProvider>);
    expect(await screen.findByRole('table')).toHaveAttribute('aria-rowcount', '-1');
    expect(screen.getByText('현재 페이지 1건')).toBeTruthy();
    expect(screen.queryByText(/1\/1 페이지/)).toBeNull();
    expect(screen.getAllByRole('button', { name: '다음' })).toHaveLength(1);
    expect(screen.getByRole('button', { name: '다음' })).toBeEnabled();
  });
});
