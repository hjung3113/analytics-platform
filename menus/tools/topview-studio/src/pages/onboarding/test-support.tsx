// Mount harness and a small stateful fake server of the 설비 온보딩 screen tests. A page test may not import `src/mock/**`, so the server is
// hand-written here over the same synthetic seed files (read with `fs`); it answers the ids, versions and outcomes the declarations promise.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render } from '@testing-library/react';
import { PenTool } from 'lucide-react';
import { groupId, menuPermission, spaceId, type ActionResponse, type ApiResponse, type MenuAction, type MenuQuery, type UploadFileInput } from '@ap/contracts';
import { createRegistry, I18nProvider, PlatformProvider } from '@ap/kernel';
import { testAdapter, testSession } from '@ap/kernel/testing';
import { manifests } from '../../index';
import EqvOnboarding from './EqvOnboarding';

const seed = <T,>(name: string): T => JSON.parse(readFileSync(join(process.cwd(), 'src/mock/onboarding', name), 'utf8')) as T;
type Doc = Record<string, unknown>;
type Binding = { layoutId: string; mappingHash: string; layoutRevision?: string; effectiveFrom: string; effectiveTo?: string };
export type WindowRow = { hash: string; from: string; to: string; dataGeneration: string; timeDomain: string; occurrences: number; state: string; counterpart: string | null; mappingCount: number };

export const G1 = '23e9e214b396bfaa4539e7b30c5f8f9163fbac6c50201430231f641ff7c822ba';

/** `publisher`: may publish a Mapping but not a Layout Revision (C6). */
export type Roles = 'viewer' | 'engineer' | 'publisher';
const ALL = ['platform:view', 'eqv-studio:view', 'eqv:view', 'eqv-studio:layout-edit', 'eqv-studio:layout-publish', 'eqv-studio:rules-edit', 'eqv-studio:dictionary-global-edit', 'eqv-studio:mapping-publish', 'eqv-studio:window-import'] as const;
const PERMISSIONS: Record<Roles, `${string}:${string}`[]> = {
  viewer: ['platform:view', 'eqv-studio:view', 'eqv:view'], engineer: [...ALL], publisher: ['platform:view', 'eqv-studio:view', 'eqv:view', 'eqv-studio:mapping-publish'],
};

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
    /** Stored Baseline Inventories by `<equipmentId>/<mappingHash>` (none in the seed: Drift is unknown). */
    baselines: new Map<string, Doc>(),
    drafts: new Map<string, { version: number; document: Doc }>([['eq-synth-01-layout', { version: 1, document: seed<Doc>('layout-eq-synth-01.json') }]]),
    revisions: [] as { layoutId: string; revision: string }[],
    templates: seed<Doc[]>('templates.json'),
    queries: [] as MenuQuery[],
    writes: [] as MenuAction[],
    /** The next publishMapping answers this instead of running (one shot). */
    refuseMapping: null as null | { outcome: ActionResponse<unknown>['outcome']; code?: string },
    /** Files `uploadFile` stored (#1658 import); the next upload or import answers `refuseUpload` / `refuseImport` instead (one shot). */
    uploads: [] as { id: string; name: string; size: number; mimeType: string; text: string }[],
    refuseUpload: null as null | { outcome: ActionResponse<unknown>['outcome']; code?: string },
    refuseImport: null as null | { outcome: ActionResponse<unknown>['outcome']; path: string[]; code: string },
    /** Every `uploadFile` call's idempotency key and abort signal, in order; `holdUpload` keeps the next upload pending until its signal aborts. */
    uploadCalls: [] as { idempotencyKey: string; signal: AbortSignal | undefined }[],
    holdUpload: false,
  };
  const ok = (data: unknown): ApiResponse<never> => ({ outcome: 'ok', data, assessments: [], trust: null, correlationId: 'fixture' }) as ApiResponse<never>;
  const empty = (): ApiResponse<never> => ({ outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'fixture' }) as ApiResponse<never>;
  const maybe = (value: unknown) => (value === undefined || value === null ? empty() : ok(structuredClone(value)));
  const done = (data: unknown, version: string | null = null): ActionResponse<never> => ({ outcome: 'ok', data, version, fieldErrors: [], replayed: false, correlationId: 'fixture' }) as ActionResponse<never>;
  const answer = (outcome: ActionResponse<unknown>['outcome'], code?: string): ActionResponse<never> => ({ outcome, data: null, version: null, fieldErrors: code ? [{ path: ['mapping'], code }] : [], replayed: false, correlationId: 'fixture' }) as ActionResponse<never>;
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
      // The server's answer shapes (`apps/platform-api/src/modules/eqv/onboarding-endpoints.ts`).
      case 'eqv.bindings': {
        if (!state.equipment.some((e) => e.equipmentId === p.equipmentId)) return empty();
        const b = state.bindings.get(p.equipmentId!) ?? [];
        return ok({ document: { schemaVersion: '0.4', equipmentId: p.equipmentId, bindings: structuredClone(b) }, version: String(b.length) });
      }
      case 'eqv.mappingVersion': { const m = state.mappings[p.equipmentId!]?.[p.hash!]; return maybe(m ? { layoutRevision: null, publishedAt: '2026-11-10T00:00:00.000Z', document: m } : null); }
      case 'eqv.baselineInventory': { const b = state.baselines.get(`${p.equipmentId}/${p.mappingHash}`); return maybe(b ? { document: b } : null); }
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
        return done({ id: `row-${key}`, version: String(version) }, String(version));
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
        return done({ mappingHash, bindingId: `binding-${list.length + 1}`, version: String(list.length + 1) }, String(list.length + 1));
      }
      case 'eqv.replaceSampleWindow': case 'eqv.retireSampleWindow': {
        const row = state.windows[String(i.equipmentId)]?.find((w) => w.hash === `sha256:${String(i.windowHash)}`);
        if (row) row.state = req.action === 'eqv.retireSampleWindow' ? 'retired' : 'active';
        return done({ equipmentId: i.equipmentId }, null);
      }
      // A stand-in for the server's import: it trusts the screen's validation and stores the window the file describes (staged over an active
      // window of the same range, EV#105).
      case 'eqv.importSampleWindow': {
        if (state.refuseImport) { const r = state.refuseImport; state.refuseImport = null; return { outcome: r.outcome, data: null, version: null, fieldErrors: [{ path: r.path, code: r.code }], replayed: false, correlationId: 'fixture' } as ActionResponse<never>; }
        const file = state.uploads.find((u) => u.id === i.uploadId);
        if (!file) return { outcome: 'invalid', data: null, version: null, fieldErrors: [{ path: ['uploadId'], code: 'not_found' }], replayed: false, correlationId: 'fixture' } as ActionResponse<never>;
        const batch = JSON.parse(file.text) as { from: string; to: string; dataGeneration: string; timeDomain: string; occurrences: unknown[] };
        const rows = state.windows[String(i.equipmentId)] ?? [];
        const active = rows.find((w) => w.state === 'active' && w.from === batch.from && w.to === batch.to) ?? null;
        const row: WindowRow = { hash: `sha256:${'f'.repeat(64)}`, from: batch.from, to: batch.to, dataGeneration: batch.dataGeneration, timeDomain: batch.timeDomain, occurrences: batch.occurrences.length, state: active ? 'staged' : 'active', counterpart: active?.hash ?? null, mappingCount: 0 };
        state.windows[String(i.equipmentId)] = [...rows, row];
        if (!active) state.inventories['f'.repeat(64)] = { ...structuredClone(Object.values(state.inventories)[0]!), equipmentId: i.equipmentId };
        return done(row, null);
      }
      case 'eqv.registerEquipment': {
        if (state.equipment.some((e) => e.equipmentId.toLowerCase() === String(i.equipmentId).toLowerCase())) return { outcome: 'invalid', data: null, version: null, fieldErrors: [{ path: ['equipmentId'], code: 'exists' }], replayed: false, correlationId: 'fixture' } as ActionResponse<never>;
        const model = state.equipment.find((e) => e.vendorId === i.vendorId && e.modelId === i.modelId)!;
        const record = { ...structuredClone(model), equipmentId: String(i.equipmentId), label: String(i.label), status: 'no-observations', coverage: null, unmappedReferences: null };
        state.equipment.push(record);
        state.fleet.push({ ...record, latestWindow: null });
        return done({ equipmentId: i.equipmentId }, null);
      }
      default: throw new Error(`unexpected write ${req.action}`);
    }
  }
  async function upload(input: UploadFileInput, signal?: AbortSignal): Promise<ActionResponse<never>> {
    state.uploadCalls.push({ idempotencyKey: input.idempotencyKey, signal });
    if (state.holdUpload) { state.holdUpload = false; return new Promise((_resolve, reject) => signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))); }
    if (state.refuseUpload) { const r = state.refuseUpload; state.refuseUpload = null; return { outcome: r.outcome, data: null, version: null, fieldErrors: r.code ? [{ path: ['file'], code: r.code }] : [], replayed: false, correlationId: 'fixture' } as ActionResponse<never>; }
    const stored = { id: `F-${state.uploads.length + 1}`, name: input.name, size: input.file.size, mimeType: input.file.type, text: await new Promise<string>((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsText(input.file); }) };
    state.uploads.push(stored);
    return done({ id: stored.id, name: stored.name, size: stored.size, mimeType: stored.mimeType }, null);
  }
  return { state, query, action, upload };
}

/** `upload: false` mounts an adapter without the optional `uploadFile` port (ADR-0140). */
export function mountAt(server: Server, role: Roles, search = '', { upload = true }: { upload?: boolean } = {}) {
  window.history.replaceState(null, '', `/tools/eqv-onboarding?v=1${search}`);
  const session = testSession(PERMISSIONS[role], { user: { id: 'u', name: 'u', title: { ko: '사용자', en: 'User' } } });
  const adapter = testAdapter({
    menuQuery: (req: MenuQuery) => server.query(req), menuAction: (req: MenuAction) => server.action(req), session: () => session,
    ...(upload ? { uploadFile: (input: UploadFileInput, signal?: AbortSignal) => server.upload(input, signal) } : {}),
  });
  return render(<I18nProvider><PlatformProvider registry={registry} adapter={adapter}><EqvOnboarding /></PlatformProvider></I18nProvider>);
}

export const params = () => Object.fromEntries(new URLSearchParams(window.location.search));
