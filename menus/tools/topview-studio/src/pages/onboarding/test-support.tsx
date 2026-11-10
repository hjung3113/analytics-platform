// Mount harness and a small stateful fake server of the 설비 온보딩 screen tests. A page test may not import `src/mock/**`, so the server is
// hand-written here over the same synthetic seed files (read with `fs`); it answers the ids, versions and outcomes the declarations promise.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render } from '@testing-library/react';
import { PenTool } from 'lucide-react';
import { groupId, menuPermission, spaceId, type ActionResponse, type ApiResponse, type MenuAction, type MenuQuery } from '@ap/contracts';
import { createRegistry, I18nProvider, PlatformProvider } from '@ap/kernel';
import { testAdapter, testSession } from '@ap/kernel/testing';
import { manifests } from '../../index';
import EqvOnboarding from './EqvOnboarding';

const seed = <T,>(name: string): T => JSON.parse(readFileSync(join(process.cwd(), 'src/mock/onboarding', name), 'utf8')) as T;
type Doc = Record<string, unknown>;
type Binding = { layoutId: string; mappingHash: string; layoutRevision?: string; effectiveFrom: string; effectiveTo?: string };
export type WindowRow = { hash: string; from: string; to: string; dataGeneration: string; timeDomain: string; occurrences: number; state: string; counterpart: string | null; mappingCount: number };

export const G1 = '23e9e214b396bfaa4539e7b30c5f8f9163fbac6c50201430231f641ff7c822ba';

export type Roles = 'viewer' | 'engineer';
const ALL = ['platform:view', 'eqv-studio:view', 'eqv:view', 'eqv-studio:layout-edit', 'eqv-studio:layout-publish', 'eqv-studio:rules-edit', 'eqv-studio:dictionary-global-edit', 'eqv-studio:mapping-publish', 'eqv-studio:window-import'] as const;
const PERMISSIONS: Record<Roles, `${string}:${string}`[]> = { viewer: ['platform:view', 'eqv-studio:view', 'eqv:view'], engineer: [...ALL] };

const registry = createRegistry({
  permissions: ALL.filter((p) => p !== 'platform:view').map(menuPermission),
  spaces: [{ id: spaceId('tools'), label: { ko: '도구', en: 'Tools' }, description: { ko: '목적', en: 'Purpose' }, homeMenuId: 'eqv-studio' }],
  groups: [{ id: groupId('topviewStudio'), label: { ko: 'Top View 작성', en: 'Top View authoring' }, icon: PenTool, space: spaceId('tools') }],
  menus: manifests,
});

export type Server = ReturnType<typeof createServer>;
export function createServer() {
  const equipment = seed<(Doc & { equipmentId: string; vendorId: string; modelId: string; status: string })[]>('equipment.json');
  const state = {
    fleet: equipment.map(({ status, coverage, unmappedReferences, ...rest }) => ({ ...rest, status, coverage, unmappedReferences, latestWindow: null as null | Doc })),
    equipment,
    windows: seed<Record<string, WindowRow[]>>('windows.json'),
    inventories: seed<Record<string, Doc>>('inventories.json'),
    rules: new Map(Object.entries(seed<Record<string, Doc>>('rules.json')).map(([k, document]) => [k, { document, version: 1 }])),
    dictionaries: new Map(Object.entries(seed<Record<string, Doc>>('dictionaries.json')).map(([k, document]) => [k, { document, version: 1 }])),
    bindings: new Map(Object.entries(seed<Record<string, { bindings: Binding[] }>>('bindings.json')).map(([k, f]) => [k, f.bindings])),
    mappings: seed<Record<string, Record<string, Doc>>>('mappings.json'),
    drafts: new Map<string, { version: number; document: Doc }>([['eq-synth-01-layout', { version: 1, document: seed<Doc>('layout-eq-synth-01.json') }]]),
    revisions: [] as { layoutId: string; revision: string }[],
    templates: seed<Doc[]>('templates.json'),
    queries: [] as MenuQuery[],
    writes: [] as MenuAction[],
    /** The next publishMapping answers this instead of running (one shot). */
    refuseMapping: null as null | { outcome: ActionResponse<unknown>['outcome']; code?: string },
  };
  const ok = (data: unknown): ApiResponse<never> => ({ outcome: 'ok', data, assessments: [], trust: null, correlationId: 'fixture' }) as ApiResponse<never>;
  const empty = (): ApiResponse<never> => ({ outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'fixture' }) as ApiResponse<never>;
  const maybe = (value: unknown) => (value === undefined || value === null ? empty() : ok(structuredClone(value)));
  const done = (data: unknown, version: string | null = null): ActionResponse<never> => ({ outcome: 'ok', data, version, fieldErrors: [], replayed: false, correlationId: 'fixture' }) as ActionResponse<never>;
  const answer = (outcome: ActionResponse<unknown>['outcome'], code?: string): ActionResponse<never> => ({ outcome, data: null, version: null, fieldErrors: code ? [{ path: ['equipmentId'], code }] : [], replayed: false, correlationId: 'fixture' }) as ActionResponse<never>;
  const scopeKey = (p: Record<string, string | undefined>) => (p.level === 'global' ? 'global' : p.level === 'maker' ? `maker/${p.vendorId}` : p.level === 'model' ? `model/${p.vendorId}/${p.modelId}` : `equipment/${p.equipmentId}`);
  const versioned = (entry: { document: Doc; version: number } | undefined) => (entry ? ok({ document: structuredClone(entry.document), version: String(entry.version) }) : empty());

  async function query(req: MenuQuery): Promise<ApiResponse<never>> {
    state.queries.push(req);
    const p = req.params as Record<string, string>;
    switch (req.endpoint) {
      case 'eqv.fleet': return ok({ rows: state.fleet.map((row) => ({ ...row, latestWindow: state.windows[row.equipmentId as string]?.find((w) => w.state === 'active') ?? null })) });
      case 'eqv.equipmentScopes': { const e = state.equipment.find((x) => x.equipmentId === p.equipmentId); return e ? ok({ equipmentId: e.equipmentId, vendorId: e.vendorId, modelId: e.modelId }) : empty(); }
      case 'eqv.sampleWindows': return ok({ rows: structuredClone(state.windows[p.equipmentId!] ?? []) });
      case 'eqv.observedInventory': return maybe(state.windows[p.equipmentId!]?.some((w) => w.hash === `sha256:${p.windowHash}`) ? state.inventories[p.windowHash!] : null);
      case 'eqv.typeDictionary': return versioned(state.dictionaries.get(scopeKey(p)));
      case 'eqv.aliasRules': return versioned(state.rules.get(scopeKey(p)));
      case 'eqv.bindings': { const b = state.bindings.get(p.equipmentId!) ?? []; return ok({ schemaVersion: '0.4', equipmentId: p.equipmentId, bindings: structuredClone(b), version: String(b.length) }); }
      case 'eqv.mappingVersion': return maybe(state.mappings[p.equipmentId!]?.[p.hash!]);
      case 'eqv.baselineInventory': return empty();
      case 'eqv.layoutDraft': { const d = state.drafts.get(p.layoutId!); return d ? ok({ id: `row-${p.layoutId}`, layoutId: p.layoutId, version: String(d.version), document: structuredClone(d.document), updatedAt: '2026-11-10T00:00:00.000Z' }) : empty(); }
      case 'eqv.layoutRevisions': return ok({ rows: state.revisions.filter((r) => r.layoutId === p.layoutId).map((r, i) => ({ id: `rev-${i}`, ...r, publishedAt: '2026-11-10T00:00:00.000Z' })) });
      case 'eqv.layoutRevision': return empty();
      case 'eqv.bundledTemplates': return ok({ rows: state.templates });
      default: throw new Error(`unexpected read ${req.endpoint}`);
    }
  }
  async function action(req: MenuAction): Promise<ActionResponse<never>> {
    state.writes.push(req);
    const i = req.input as Record<string, unknown>;
    switch (req.action) {
      case 'eqv.saveAliasRules': {
        const key = scopeKey(i as Record<string, string>);
        const current = state.rules.get(key);
        if (req.expectedVersion !== String(current?.version ?? 0)) return answer('conflict');
        const version = (current?.version ?? 0) + 1;
        state.rules.set(key, { document: structuredClone(i.document as Doc), version });
        return done({ level: i.level, version: String(version) }, String(version));
      }
      case 'eqv.saveDraft': {
        if (state.drafts.has(String(i.layoutId)) && req.expectedVersion === '0') return answer('conflict');
        state.drafts.set(String(i.layoutId), { version: 1, document: structuredClone(i.document as Doc) });
        return done({ id: 'row', layoutId: i.layoutId, version: '1' }, '1');
      }
      case 'eqv.publishRevision': {
        const revision = `sha256:${'b'.repeat(64)}`;
        state.revisions.push({ layoutId: String(i.layoutId), revision });
        return done({ id: 'rev', layoutId: i.layoutId, revision, created: true }, '1');
      }
      case 'eqv.publishMapping': {
        if (state.refuseMapping) { const r = state.refuseMapping; state.refuseMapping = null; return answer(r.outcome, r.code); }
        const list = state.bindings.get(String(i.equipmentId)) ?? [];
        if (req.expectedVersion !== String(list.length)) return answer('conflict');
        const mappingHash = `sha256:${'c'.repeat(64)}`;
        state.bindings.set(String(i.equipmentId), [...list.map((b) => (b.effectiveTo ? b : { ...b, effectiveTo: String(i.effectiveFrom) })), { layoutId: String(i.layoutId), mappingHash, layoutRevision: String(i.layoutRevision), effectiveFrom: String(i.effectiveFrom) }]);
        return done({ equipmentId: i.equipmentId, mappingHash, layoutRevision: i.layoutRevision, version: String(list.length + 1) }, String(list.length + 1));
      }
      case 'eqv.replaceSampleWindow': case 'eqv.retireSampleWindow': {
        const row = state.windows[String(i.equipmentId)]?.find((w) => w.hash === `sha256:${String(i.windowHash)}`);
        if (row) row.state = req.action === 'eqv.retireSampleWindow' ? 'retired' : 'active';
        return done({ equipmentId: i.equipmentId }, null);
      }
      default: throw new Error(`unexpected write ${req.action}`);
    }
  }
  return { state, query, action };
}

export function mountAt(server: Server, role: Roles, search = '') {
  window.history.replaceState(null, '', `/tools/eqv-onboarding?v=1${search}`);
  const session = testSession(PERMISSIONS[role], { user: { id: 'u', name: 'u', title: { ko: '사용자', en: 'User' } } });
  const adapter = testAdapter({ menuQuery: (req: MenuQuery) => server.query(req), menuAction: (req: MenuAction) => server.action(req), session: () => session });
  return render(<I18nProvider><PlatformProvider registry={registry} adapter={adapter}><EqvOnboarding /></PlatformProvider></I18nProvider>);
}

export const params = () => Object.fromEntries(new URLSearchParams(window.location.search));
