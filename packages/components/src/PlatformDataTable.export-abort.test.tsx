/**
 * #173 review P3-8: an export aborted while the XLSX chunk is building must not produce a file or a toast.
 * `write-excel-file/browser` is mocked so the blob resolve is held until the test chooses — the real library
 * is exercised by tableExport.test.ts / PlatformDataTable.test.tsx (separate files, separate module graphs).
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiResponse, PlatformAdapter, Session } from '@ap/contracts';
import { I18nProvider, PlatformProvider, createRegistry, usePlatform } from '@ap/kernel';
import { PlatformDataTable, type PlatformDataTableProps } from './PlatformDataTable';

const mockBlobResolvers: ((blob: Blob) => void)[] = [];
vi.mock('write-excel-file/browser', () => ({
  default: () => ({ toBlob: () => new Promise<Blob>(resolve => { mockBlobResolvers.push(resolve); }) }),
}));

afterEach(cleanup);

const none = { time: 'unsupported', roomNames: 'unsupported', condition: 'unsupported', selection: 'unsupported', lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported' } as const;
const registry = createRegistry({
  spaces: [{ id: 'analytics', label: { ko: '분석', en: 'Analytics' }, description: { ko: '목적', en: 'Purpose' }, homeMenuId: 'export-menu' }],
  groups: [{ id: 'overview', label: { ko: '개요', en: 'Overview' }, icon: House, space: 'analytics' }],
  menus: [{ id: 'export-menu', group: 'overview', primary: true, label: { ko: '내보내기', en: 'Export' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: none, pageType: 'management', features: { export: true, savedView: false, annotate: false, compare: false }, pageKeys: [] }],
});

const session: Session = { user: { id: 'user-a', name: 'a', title: { ko: 'a', en: 'a' }, permissions: ['platform:view'] }, scopes: [] };
const adapter: PlatformAdapter = {
  menuQuery: async () => ({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
  session: () => session,
  validateScope: async () => ({ status: 'valid', grantedRooms: [] }),
  publishedMetrics: () => [],
  defaultRangeTo: () => '2026-09-26T09:00:00',
  contextOptions: async () => ({ stgroup: [], team: [], makerModel: [] }),
  evaluateSelection: async () => ({ inCondition: [], outOfCondition: [] }),
  getEntity: async () => ({ outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'c' }),
  auditTrail: async () => ({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'c' }),
  entityAudit: async () => ({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'c' }),
  accessDirectory: async () => ({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'c' }),
  recordUsage: async () => ({ accepted: 0 }),
  usageSummary: async () => ({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'c' }),
  listAnnotations: async () => ({ outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
  saveAnnotation: async () => ({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
  reportClientError: async () => ({ accepted: true }),
  subscribe: () => () => {},
};

type Row = { id: string; status: string };
const columns: PlatformDataTableProps<Row>['columns'] = [{ id: 'status', header: 'Status', cell: row => String(row.status) }];

function ToastProbe() {
  const { toasts } = usePlatform();
  return <div data-testid="toast-probe">{toasts.map(toast => <p key={toast.id}>{toast.text}</p>)}</div>;
}

const downloads: string[] = [];

describe('PlatformDataTable export aborted while the XLSX chunk is building (#173 P3-8)', () => {
  it('builds no file and toasts nothing when the filterKey changes mid-build', async () => {
    const originalCreateObjectURL = URL.createObjectURL;
    URL.createObjectURL = () => { downloads.push('blob'); return 'blob:test'; };
    try {
      const loadPage = vi.fn(async (): Promise<ApiResponse<{ rows: Row[]; total: number }>> => ({
        outcome: 'ok', data: { rows: [{ id: 'r1', status: 'a' }], total: 1 }, assessments: [], trust: null, correlationId: 'c',
      }));
      const exportRows = vi.fn(async (): Promise<ApiResponse<Row[]>> => ({ outcome: 'ok', data: [{ id: 'r1', status: 'a' }], assessments: [], trust: null, correlationId: 'c' }));
      const view = render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}>
        <PlatformDataTable<Row> title="T" ariaLabel="table" columns={columns} getRowId={r => r.id}
          loadPage={loadPage} filterKey="f" preferenceKey="test-export-abort" pageSize={25} height={200} exportRows={exportRows} />
        <ToastProbe />
      </PlatformProvider></I18nProvider>);
      await screen.findByText(/1\/1/);
      fireEvent.keyDown(screen.getByRole('button', { name: /^내보내기/ }), { key: 'Enter' });
      fireEvent.click(await screen.findByRole('menuitem', { name: '필터 결과 전체 1행을 Excel(.xlsx)로 내보내기' }));
      await waitFor(() => expect(mockBlobResolvers.length).toBe(1)); // rows read, chunk building

      view.rerender(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}>
        <PlatformDataTable<Row> title="T" ariaLabel="table" columns={columns} getRowId={r => r.id}
          loadPage={loadPage} filterKey="g" preferenceKey="test-export-abort" pageSize={25} height={200} exportRows={exportRows} />
        <ToastProbe />
      </PlatformProvider></I18nProvider>);

      mockBlobResolvers[0](new Blob(['x'], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      await waitFor(() => expect(screen.getByRole('button', { name: /^내보내기/ }).getAttribute('aria-disabled')).toBeNull());
      expect(downloads).toEqual([]); // aborted after the build: no file for the old result set
      expect(screen.getByTestId('toast-probe').textContent).toBe('');
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
      mockBlobResolvers.length = 0;
    }
  });
});
