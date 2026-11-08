// Dialog reads: pointers and receiver-owned projections only. No Source body, persistence or audit.
import type { SourceSampleSet } from '@ap/contract-schemas';
import { isUuid } from '../../lib/input/fields.js';
import { viewerOf } from '../log-knowledge/index.js';
import { MenuActionInvalidError, type MenuEndpointDeclaration, type ParamsJudgment } from '../menu-dispatch/types.js';
import { holdsPlatformPermission, type PlatformActor } from '../platform-port/permissions.js';
import type { InvestigationDeps } from './deps.js';
import { EVIDENCE_MAX, storedEvidence } from './domain/evidence.js';
import { hashMismatchOf } from './domain/handoff.js';
import { parseDetailParams } from './domain/investigation-params.js';
import { resolveHandoffRefs } from './handoff-source.js';
import { EXPLORER_HANDOFF_MENU_PERMISSION } from './investigation-handoff.js';
import { INVESTIGATION_MENU_ID } from './menu.js';
import { getOwned } from './repositories/investigation-read.js';

type Judge = (params: Record<string, unknown>) => ParamsJudgment;
const yes = { ok: true as const };
const modelsParams: Judge = p =>
  (p.q !== null && (typeof p.q !== 'string' || p.q.length > 200)) || !Number.isInteger(p.page) || Number(p.page) < 0 || Number(p.page) > 1_000_000 || !Number.isInteger(p.pageSize) || Number(p.pageSize) < 1 || Number(p.pageSize) > 100
    ? { ok: false, message: 'q, page or pageSize invalid' } : yes;

export function handoffEndpoints(deps: InvestigationDeps): MenuEndpointDeclaration[] {
  const handoff = deps.handoff;
  if (!handoff) return [];
  const declare = (name: string, paramKeys: string[], judge: Judge, run: (actor: PlatformActor, params: Record<string, unknown>, signal?: AbortSignal) => Promise<unknown>): MenuEndpointDeclaration => ({
    spec: { id: `logExplorer.${name}`, menuId: INVESTIGATION_MENU_ID, paramKeys, permission: EXPLORER_HANDOFF_MENU_PERMISSION, requiresScope: false, context: {}, mergeTimeDomain: false },
    authorize: (actor, tx) => holdsPlatformPermission(deps.checkService, actor, EXPLORER_HANDOFF_MENU_PERMISSION, tx ? { tx } : {}),
    validate: judge,
    async handle({ actor, params, signal }) {
      const valid = judge(params);
      if (!valid.ok) return { outcome: 'error', data: null, message: valid.message };
      return { outcome: 'ok', data: await run(actor, params, signal) };
    },
  });
  const canIntake = (actor: PlatformActor) => handoff.draftIntake.canIntake(deps.db, actor);
  return [
    declare('handoffCheck', ['investigationId'], parseDetailParams, async (actor, params, signal) => {
      const row = await getOwned(deps.db, actor.workspace_id, actor.actor_id, String(params.investigationId).toLowerCase());
      if (!row) return null;
      const sample = row.origin === 'round' && row.roundId
        ? await deps.lifecycleRead.getRoundSampleSet(deps.db, actor.workspace_id, row.roundId, viewerOf(actor))
        : row.sampleSet as SourceSampleSet | null;
      const unavailable = { state: 'source_unavailable', refs: [] };
      if (!sample || handoff.sourceReadPort === null) return unavailable;
      const refs = storedEvidence(row.evidence);
      if (refs.length > EVIDENCE_MAX) return unavailable;
      try {
        // All database reads finish before Source work; no transaction is held while awaiting it.
        const resolved = await resolveHandoffRefs(handoff, actor, sample.sourceOwner, refs, undefined, signal);
        return { state: 'ok', refs: refs.map((ref, i) => ({ fileRef: ref.fileRef, line: ref.line, status: !resolved[i] ? 'unresolved' : hashMismatchOf(ref, sample.files) ? 'hash_mismatch' : 'ok' })) };
      } catch (error) {
        if (error instanceof MenuActionInvalidError && error.fieldErrors.some(e => e.code === 'source_forbidden')) return { state: 'source_forbidden', refs: [] };
        return unavailable;
      }
    }),
    declare('handoffDrafts', [], () => yes, async actor => ({ rows: await handoff.draftIntake.listOwnOpen(deps.db, actor, { limit: 50 }) })),
    declare('handoffModels', ['q', 'page', 'pageSize'], modelsParams, async (actor, params) => {
      if (!(await canIntake(actor))) return { rows: [], total: 0 };
      return handoff.knowledgeLookup.listModels(deps.db, actor.workspace_id, { q: params.q as string | null, page: Number(params.page), pageSize: Number(params.pageSize) });
    }),
    declare('handoffSoftware', ['modelId'], p => typeof p.modelId === 'string' && isUuid(p.modelId) ? yes : { ok: false, message: 'modelId must be a uuid string' }, async (actor, params) => {
      if (!(await canIntake(actor))) return [];
      return handoff.knowledgeLookup.listSoftware(deps.db, actor.workspace_id, String(params.modelId).toLowerCase());
    }),
  ];
}
