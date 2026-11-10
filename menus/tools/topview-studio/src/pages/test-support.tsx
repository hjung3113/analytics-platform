// Mount harness and a small stateful fake server of the Layouts screen tests. A page test may not import `src/mock/**`, so the server is
// hand-written here; it answers the same ids, versions and field errors the declarations promise.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render } from '@testing-library/react';
import { PenTool } from 'lucide-react';
import type { ReactNode } from 'react';
import { groupId, menuPermission, spaceId, type ActionResponse, type ApiResponse, type FieldError, type MenuAction, type MenuQuery } from '@ap/contracts';
import { createRegistry, I18nProvider, PlatformProvider } from '@ap/kernel';
import { testAdapter, testSession } from '@ap/kernel/testing';
import { manifests } from '../index';

export const FIXTURE = JSON.parse(readFileSync(join(process.cwd(), 'src/mock/layout-fixture.json'), 'utf8')) as Record<string, unknown> & { id: string; components: { id: string; label: string; transform: { x: number } }[] };

export type Roles = 'viewer' | 'edit' | 'publish' | 'both';
const PERMISSIONS: Record<Roles, `${string}:${string}`[]> = {
  viewer: ['platform:view', 'eqv-studio:view', 'eqv:view'],
  edit: ['platform:view', 'eqv-studio:view', 'eqv:view', 'eqv-studio:layout-edit'],
  publish: ['platform:view', 'eqv-studio:view', 'eqv:view', 'eqv-studio:layout-publish'],
  both: ['platform:view', 'eqv-studio:view', 'eqv:view', 'eqv-studio:layout-edit', 'eqv-studio:layout-publish'],
};

const registry = createRegistry({
  permissions: PERMISSIONS.both.filter(p => p !== 'platform:view').map(menuPermission),
  spaces: [{ id: spaceId('tools'), label: { ko: '도구', en: 'Tools' }, description: { ko: '목적', en: 'Purpose' }, homeMenuId: 'eqv-studio' }],
  groups: [{ id: groupId('topviewStudio'), label: { ko: 'Top View 작성', en: 'Top View authoring' }, icon: PenTool, space: spaceId('tools') }],
  menus: manifests,
});

type Doc = Record<string, unknown>;
const sorted = (v: unknown): string => Array.isArray(v) ? `[${v.map(sorted).join(',')}]` : v && typeof v === 'object' ? `{${Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, x]) => `${JSON.stringify(k)}:${sorted(x)}`).join(',')}}` : JSON.stringify(v);
const hash = (doc: unknown): string => { let h = 7; for (const ch of sorted(doc)) h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0; return `sha256:${h.toString(16).padStart(8, '0').repeat(8)}`; };

export type Server = ReturnType<typeof createServer>;
export function createServer() {
  const state = {
    drafts: new Map<string, { id: string; version: number; document: Doc }>([[FIXTURE.id, { id: 'row-1', version: 1, document: structuredClone(FIXTURE) }]]),
    revisions: [] as { id: string; layoutId: string; revision: string; document: Doc; publishedAt: string }[],
    templates: [] as { id: string; templateId: string; name: string; promotedFromLayoutId: string; promotedFromRevision: string; document: Doc; createdAt: string }[],
    queries: [] as MenuQuery[],
    writes: [] as MenuAction[],
    /** The next write answers this instead of running (one shot). */
    refuse: null as null | { outcome: ActionResponse<unknown>['outcome']; fieldErrors?: FieldError[] },
    /** While set, the Revision reads wait for it. */
    holdReads: null as null | Promise<void>,
    /** While set, the Layout draft read waits for it. */
    holdDrafts: null as null | Promise<void>,
    /** While true, the Layout list read fails (the adapter rejects). */
    failLayouts: false,
    /** While true, the Layout draft read fails. */
    failDrafts: false,
  };
  const ok = (data: unknown): ApiResponse<never> => ({ outcome: 'ok', data, assessments: [], trust: null, correlationId: 'fixture' }) as ApiResponse<never>;
  const empty = (): ApiResponse<never> => ({ outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'fixture' }) as ApiResponse<never>;
  const done = (data: unknown, version: string | null): ActionResponse<never> => ({ outcome: 'ok', data, version, fieldErrors: [], replayed: false, correlationId: 'fixture' }) as ActionResponse<never>;
  const answer = (outcome: ActionResponse<unknown>['outcome'], fieldErrors: FieldError[] = [], version: string | null = null): ActionResponse<never> => ({ outcome, data: null, version, fieldErrors, replayed: false, correlationId: 'fixture' }) as ActionResponse<never>;

  async function query(req: MenuQuery): Promise<ApiResponse<never>> {
    state.queries.push(req);
    if (state.holdReads && req.endpoint.startsWith('eqv.layoutRevision')) await state.holdReads;
    if (state.holdDrafts && req.endpoint === 'eqv.layoutDraft') await state.holdDrafts;
    if (state.failDrafts && req.endpoint === 'eqv.layoutDraft') throw new Error('draft read failed');
    if (state.failLayouts && req.endpoint === 'eqv.layouts') throw new Error('list read failed');
    const p = req.params as Record<string, string>;
    switch (req.endpoint) {
      case 'eqv.layouts': return ok({ rows: [...state.drafts].map(([layoutId, d]) => ({ id: d.id, layoutId, version: String(d.version), updatedAt: '2026-11-10T00:00:00.000Z' })) });
      case 'eqv.layoutDraft': { const d = state.drafts.get(p.layoutId!); return d ? ok({ id: d.id, layoutId: p.layoutId, version: String(d.version), document: structuredClone(d.document), updatedAt: '2026-11-10T00:00:00.000Z' }) : empty(); }
      case 'eqv.layoutRevisions': return ok({ rows: state.revisions.filter(r => r.layoutId === p.layoutId).map(({ id, layoutId, revision, publishedAt }) => ({ id, layoutId, revision, publishedAt })).reverse() });
      case 'eqv.layoutRevision': { const r = state.revisions.find(x => x.layoutId === p.layoutId && x.revision === p.revision); return r ? ok(structuredClone(r)) : empty(); }
      case 'eqv.templates': return ok({ rows: state.templates.map(({ document: _d, ...row }) => row) });
      case 'eqv.template': { const t = state.templates.find(x => x.templateId === p.templateId); return t ? ok(structuredClone(t)) : empty(); }
      default: throw new Error(`unexpected read ${req.endpoint}`);
    }
  }
  async function action(req: MenuAction): Promise<ActionResponse<never>> {
    state.writes.push(req);
    if (state.refuse) { const r = state.refuse; state.refuse = null; return answer(r.outcome, r.fieldErrors, '9'); }
    const i = req.input as Record<string, unknown>;
    if (req.action === 'eqv.saveDraft') {
      const layoutId = String(i.layoutId); const d = state.drafts.get(layoutId);
      if (req.expectedVersion !== (d ? String(d.version) : '0')) return answer('conflict', [], d ? String(d.version) : '0');
      if ((i.document as Doc).id !== layoutId) return answer('invalid', [{ path: ['document', 'id'], code: 'id_mismatch' }]);
      if (d) { d.document = structuredClone(i.document as Doc); d.version += 1; return done({ id: d.id, layoutId, version: String(d.version) }, String(d.version)); }
      state.drafts.set(layoutId, { id: `row-${state.drafts.size + 1}`, version: 1, document: structuredClone(i.document as Doc) });
      return done({ id: `row-${state.drafts.size}`, layoutId, version: '1' }, '1');
    }
    if (req.action === 'eqv.publishRevision') {
      const layoutId = String(i.layoutId); const d = state.drafts.get(layoutId);
      if (!d) return answer('not_found');
      if (req.expectedVersion !== String(d.version)) return answer('conflict', [], String(d.version));
      const revision = hash(d.document); const existing = state.revisions.find(r => r.layoutId === layoutId && r.revision === revision);
      if (existing) return done({ id: existing.id, layoutId, revision, created: false }, String(d.version));
      const row = { id: `rev-${state.revisions.length + 1}`, layoutId, revision, document: structuredClone(d.document), publishedAt: '2026-11-10T01:02:00.000Z' };
      state.revisions.push(row);
      return done({ id: row.id, layoutId, revision, created: true }, String(d.version));
    }
    if (req.action === 'eqv.promoteTemplate') {
      if (state.templates.some(t => t.templateId === i.templateId)) return answer('invalid', [{ path: ['templateId'], code: 'duplicate' }]);
      const source = state.revisions.find(r => r.revision === i.revision);
      if (!source) return answer('invalid', [{ path: ['revision'], code: 'not_found' }]);
      state.templates.push({ id: `tpl-${state.templates.length + 1}`, templateId: String(i.templateId), name: String(i.name), promotedFromLayoutId: String(i.layoutId), promotedFromRevision: String(i.revision), document: { ...source.document, kind: 'template' }, createdAt: '2026-11-10T02:00:00.000Z' });
      return done({ id: `tpl-${state.templates.length}`, templateId: String(i.templateId) }, null);
    }
    throw new Error(`unexpected write ${req.action}`);
  }
  return { state, query, action };
}

export function adapterFor(server: Server, role: Roles) {
  const session = testSession(PERMISSIONS[role], { user: { id: 'u', name: 'u', title: { ko: '사용자', en: 'User' } } });
  return testAdapter({ menuQuery: (req: MenuQuery) => server.query(req), menuAction: (req: MenuAction) => server.action(req), session: () => session });
}

export function mountAt(server: Server, role: Roles, ui: ReactNode, search = '') {
  window.history.replaceState(null, '', `/tools/eqv-studio?v=1${search}`);
  const adapter = adapterFor(server, role);
  return render(<I18nProvider><PlatformProvider registry={registry} adapter={adapter}>{ui}</PlatformProvider></I18nProvider>);
}
