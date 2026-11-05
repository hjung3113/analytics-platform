// The concept mapping reads of the log knowledge hub (#1196 e, design v0.6 §15.4) as menu-dispatch declarations on
// the models menu: the stored mappings (with the `target_gone` mark) and the suggestion scan. Read right
// `platform:view`, no scope, the workspace is the session actor's. `conceptSuggestions` is computed on every read from
// the models' current published specs: nothing is stored, every row is flagged `proposal`, and no equivalence read
// consults it. An unknown or other-workspace model answers an empty page.

import { and, eq, inArray } from 'drizzle-orm';

import { equipmentModels } from '../../db/schema/knowledge.js';
import { PAGE_SIZE_MAX } from '../../lib/list-params/list-params.js';
import type { EndpointResult, MenuEndpointDeclaration, ParamsJudgment } from '../menu-dispatch/types.js';
import { holdsPlatformPermission } from '../platform-port/permissions.js';
import { LOG_KNOWLEDGE_MODELS_MENU_ID } from './catalog-menu.js';
import { CONCEPT_KINDS, CONCEPT_REVIEW_STATES } from './domain/concept-input.js';
import { SUGGESTION_CAP, type ScanTarget, scanSuggestions } from './domain/concept-suggest.js';
import type { LogKnowledgeDeps } from './deps.js';
import { decidedMembers, listConceptMappings } from './repositories/concept.js';
import { scanCurrentTargets } from './repositories/spec-targets.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Judged<T> = { ok: true; value: T } | { ok: false; message: string };
const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);

function judgePaging(params: Record<string, unknown>): Judged<{ page: number; pageSize: number }> {
  const page = params.page === undefined ? 0 : params.page;
  if (typeof page !== 'number' || !Number.isInteger(page) || page < 0 || page > 1_000_000) {
    return { ok: false, message: 'page must be a non-negative integer (0-based)' };
  }
  const pageSize = params.pageSize === undefined ? 50 : params.pageSize;
  if (typeof pageSize !== 'number' || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > PAGE_SIZE_MAX) {
    return { ok: false, message: `pageSize must be an integer from 1 to ${PAGE_SIZE_MAX}` };
  }
  return { ok: true, value: { page, pageSize } };
}

function judgeEnum(params: Record<string, unknown>, key: string, allowed: readonly string[]): Judged<string | undefined> {
  const v = params[key];
  if (v === undefined) return { ok: true, value: undefined };
  return typeof v === 'string' && allowed.includes(v) ? { ok: true, value: v } : { ok: false, message: `${key} must be one of ${allowed.join(', ')}` };
}

function declare<Q>(
  deps: LogKnowledgeDeps,
  id: string,
  paramKeys: readonly string[],
  judge: (params: Record<string, unknown>) => Judged<Q>,
  run: (workspaceId: string, query: Q) => Promise<EndpointResult>,
): MenuEndpointDeclaration {
  return {
    spec: { id, menuId: LOG_KNOWLEDGE_MODELS_MENU_ID, paramKeys, permission: 'platform:view', requiresScope: false, context: {}, mergeTimeDomain: false },
    authorize: (actor, tx) => holdsPlatformPermission(deps.checkService, actor, 'platform:view', tx ? { tx } : {}),
    validate(params): ParamsJudgment {
      const judged = judge(params);
      return judged.ok ? { ok: true } : judged;
    },
    async handle(args) {
      const judged = judge(args.params);
      if (!judged.ok) return { outcome: 'error', data: null, message: judged.message };
      return run(args.actor.workspace_id, judged.value);
    },
  };
}

interface MappingsQuery {
  modelId?: string;
  conceptId?: string;
  reviewState?: string;
  kind?: string;
  page: number;
  pageSize: number;
}

function judgeMappings(params: Record<string, unknown>): Judged<MappingsQuery> {
  for (const key of ['modelId', 'conceptId'] as const) {
    if (params[key] !== undefined && !isUuid(params[key])) return { ok: false, message: `${key} must be a uuid string` };
  }
  const state = judgeEnum(params, 'reviewState', CONCEPT_REVIEW_STATES);
  if (!state.ok) return state;
  const kind = judgeEnum(params, 'kind', CONCEPT_KINDS);
  if (!kind.ok) return kind;
  const paging = judgePaging(params);
  if (!paging.ok) return paging;
  return {
    ok: true,
    value: {
      // Canonical (lower-case) ids: the stored and the looked-up spelling must be one.
      ...(params.modelId === undefined ? {} : { modelId: (params.modelId as string).toLowerCase() }),
      ...(params.conceptId === undefined ? {} : { conceptId: (params.conceptId as string).toLowerCase() }),
      ...(state.value === undefined ? {} : { reviewState: state.value }),
      ...(kind.value === undefined ? {} : { kind: kind.value }),
      ...paging.value,
    },
  };
}

interface SuggestionsQuery {
  modelId: string;
  kind?: 'module' | 'event';
  page: number;
  pageSize: number;
}

function judgeSuggestions(params: Record<string, unknown>): Judged<SuggestionsQuery> {
  if (!isUuid(params.modelId)) return { ok: false, message: 'modelId must be a uuid string' };
  const kind = judgeEnum(params, 'kind', CONCEPT_KINDS);
  if (!kind.ok) return kind;
  const paging = judgePaging(params);
  if (!paging.ok) return paging;
  return { ok: true, value: { modelId: params.modelId.toLowerCase(), ...(kind.value === undefined ? {} : { kind: kind.value as 'module' | 'event' }), ...paging.value } };
}

export function conceptEndpoints(deps: LogKnowledgeDeps): MenuEndpointDeclaration[] {
  return [
    declare(deps, 'logKnowledge.conceptMappings', ['modelId', 'conceptId', 'reviewState', 'kind', 'page', 'pageSize'], judgeMappings, async (workspaceId, q) => {
      const { page, pageSize, ...filters } = q;
      return { outcome: 'ok', data: await listConceptMappings(deps.db, workspaceId, filters, { page, pageSize }) };
    }),
    declare(deps, 'logKnowledge.conceptSuggestions', ['modelId', 'kind', 'page', 'pageSize'], judgeSuggestions, async (workspaceId, q) => {
      // The BOUNDED scan: `truncated` tells the caller when a cap made the list a partial view.
      const { models: all, truncated: scanTruncated } = await scanCurrentTargets(deps.db, workspaceId);
      const mine = all.get(q.modelId);
      if (!mine) return { outcome: 'ok', data: { total: 0, rows: [], ...(scanTruncated ? { truncated: true } : {}) } };
      const scan = (modelId: string, kinds: readonly string[]): ScanTarget[] =>
        [...(all.get(modelId)?.targets ?? [])]
          .filter(([, t]) => kinds.includes(t.kind))
          .map(([targetKey, t]) => ({ modelId, targetKey, kind: t.kind, name: t.name, fields: t.fields }));
      const kinds = q.kind ? [q.kind] : [...CONCEPT_KINDS];
      const sources = scan(q.modelId, kinds);
      const candidates = [...all.keys()].filter((id) => id !== q.modelId).flatMap((id) => scan(id, kinds));
      // A pair a human already decided is not proposed again: both confirmed members of one concept, or one side
      // rejected from a concept the other side holds (a row in any state). A different association is still proposed.
      const members = await decidedMembers(deps.db, workspaceId, [...all.keys()]);
      const conceptsOf = new Map<string, { confirmed: Set<string>; rejected: Set<string>; any: Set<string> }>();
      for (const m of members) {
        const key = `${m.modelId}|${m.targetKey}`;
        const entry = conceptsOf.get(key) ?? { confirmed: new Set<string>(), rejected: new Set<string>(), any: new Set<string>() };
        entry.any.add(m.conceptId);
        if (m.reviewState === 'rejected') entry.rejected.add(m.conceptId);
        if (m.reviewState === 'confirmed' && m.relationKind === 'equivalent') entry.confirmed.add(m.conceptId);
        conceptsOf.set(key, entry);
      }
      const shares = (x: Set<string> | undefined, y: Set<string> | undefined): boolean => x !== undefined && y !== undefined && [...x].some((c) => y.has(c));
      const same = (a: ScanTarget, b: ScanTarget): boolean => {
        const mineSet = conceptsOf.get(`${a.modelId}|${a.targetKey}`);
        const theirs = conceptsOf.get(`${b.modelId}|${b.targetKey}`);
        return shares(mineSet?.confirmed, theirs?.confirmed) || shares(mineSet?.rejected, theirs?.any) || shares(theirs?.rejected, mineSet?.any);
      };
      const found = scanSuggestions(sources, candidates, same);
      const slice = found.slice(q.page * q.pageSize, (q.page + 1) * q.pageSize);
      const modelIds = [...new Set(slice.map((s) => s.candidate.modelId))];
      const names = new Map<string, string>();
      if (modelIds.length > 0) {
        const rows = await deps.db
          .select({ id: equipmentModels.id, name: equipmentModels.name })
          .from(equipmentModels)
          .where(and(eq(equipmentModels.workspaceId, workspaceId), inArray(equipmentModels.id, modelIds)));
        for (const r of rows) names.set(r.id, r.name);
      }
      return {
        outcome: 'ok',
        data: {
          total: found.length,
          truncated: scanTruncated || found.length >= SUGGESTION_CAP,
          rows: slice.map((s) => ({ ...s, candidate: { ...s.candidate, modelName: names.get(s.candidate.modelId) ?? '' } })),
        },
      };
    }),
  ];
}
