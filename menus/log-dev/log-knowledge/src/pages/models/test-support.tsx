// Shared fixtures of the model screen tests: registry, sessions, rows, an adapter that records every read.
import { BookOpen } from 'lucide-react';
import { createRegistry, I18nProvider, PlatformProvider } from '@ap/kernel';
import { testAdapter, testSession } from '@ap/kernel/testing';
import { groupId, menuPermission, spaceId, type ApiResponse, type MenuQuery } from '@ap/contracts';
import type { ReactNode } from 'react';
import { manifests } from '../../index';
import type { ExploreModelRow, ModelProfileData } from '../../endpoints';

export const registry = createRegistry({
  permissions: [menuPermission('knowledge:catalog-manage')],
  spaces: [{ id: spaceId('logDev'), label: { ko: '로그', en: 'Log' }, description: { ko: '목적', en: 'Purpose' }, homeMenuId: 'log-knowledge-models' }],
  groups: [{ id: groupId('logKnowledge'), label: { ko: '지식', en: 'Knowledge' }, icon: BookOpen, space: spaceId('logDev') }],
  menus: manifests,
});
export const admin = testSession(['knowledge:catalog-manage', 'platform:view'], { user: { id: 'admin', name: 'admin', title: { ko: '관리자', en: 'Admin' } } });
export const viewer = testSession(['platform:view'], { user: { id: 'viewer', name: 'viewer', title: { ko: '조회자', en: 'Viewer' } } });

const at = '2026-10-01T00:00:00.000Z';
export const VENDOR_ID = '00000001-0000-4000-8000-000000000001';
export const PROCESSES = [
  { id: '00000002-0000-4000-8000-000000000004', code: 'ETCH', name: 'Etch', active: true },
  { id: '00000002-0000-4000-8000-000000000005', code: 'DEP', name: 'Deposition', active: true },
  { id: '00000002-0000-4000-8000-000000000006', code: 'CMP', name: 'Planarization', active: true },
];
const stamps = { version: '1', createdAt: at, updatedAt: '2026-10-02T09:30:00.000Z' };
export const modelRows: ExploreModelRow[] = [
  { ...stamps, id: '00000003-0000-4000-8000-000000000008', code: 'A-100', name: 'Alpha 100', active: true, vendorId: VENDOR_ID, vendorName: 'Alpha Semicap',
    processes: PROCESSES.map(({ id, name }) => ({ id, name })), softwareCount: 2, latestSoftwareLabel: 'v2.0', modelItemCount: 4 },
  { ...stamps, id: '00000003-0000-4000-8000-00000000000b', code: 'B-20', name: 'Beta 20', active: true, vendorId: '00000001-0000-4000-8000-000000000002', vendorName: 'Beta Systems',
    processes: [], softwareCount: 0, latestSoftwareLabel: null, modelItemCount: 0 },
];
export const MODEL_ID = modelRows[0]!.id;
export const profileOf = (patch: Partial<ModelProfileData> = {}): ModelProfileData => ({
  model: { id: MODEL_ID, code: 'A-100', name: 'Alpha 100', active: true, vendor: { id: VENDOR_ID, code: 'ALPHA', name: 'Alpha Semicap', active: true },
    processes: PROCESSES.slice(0, 2).map(({ id, code, name }) => ({ id, code, name })), createdAt: at, updatedAt: '2026-10-02T09:30:00.000Z' },
  softwareVersions: [
    { id: 's2', versionLabel: 'v2.0', name: 'Major', active: true, itemCount: 3, updatedAt: '2026-10-03T00:00:00.000Z' },
    { id: 's1', versionLabel: 'v1.0', name: '', active: false, itemCount: 0, updatedAt: '2026-10-01T00:00:00.000Z' },
  ],
  truncated: false, modelItems: { total: 4 }, ...patch,
});

export const ok = (data: unknown): ApiResponse<never> => ({ outcome: 'ok', data, assessments: [], trust: null, correlationId: 'fixture' }) as ApiResponse<never>;

export type Kit = { queries: MenuQuery[]; profile: () => ModelProfileData | null };
/** An adapter that records every read; `kit.profile` is what `logKnowledge.modelProfile` answers. */
export function makeAdapter(kit: Kit, session: () => typeof admin) {
  return testAdapter({
    menuQuery: async (req: MenuQuery) => {
      kit.queries.push(req);
      if (req.endpoint === 'logKnowledge.exploreModels') return ok({ rows: modelRows, total: modelRows.length });
      if (req.endpoint === 'logKnowledge.modelProfile') return ok(kit.profile());
      if (req.endpoint === 'logKnowledge.vendors') return ok({ rows: [{ id: VENDOR_ID, code: 'ALPHA', name: 'Alpha Semicap', active: true }], total: 1 });
      if (req.endpoint === 'logKnowledge.processes') return ok({ rows: PROCESSES, total: PROCESSES.length });
      return ok({ rows: [], total: 0 });
    },
    session,
  });
}
export function Providers({ adapter, children }: { adapter: ReturnType<typeof makeAdapter>; children: ReactNode }) {
  return <I18nProvider><PlatformProvider adapter={adapter} registry={registry}>{children}</PlatformProvider></I18nProvider>;
}
