import { viewerOf } from '../log-knowledge/index.js';
// The log explorer investigation reads (#1468 b, design §5) as menu-dispatch declarations: the caller's own
// investigations and one investigation with its set, filters and evidence locations. Right: `platform:view`,
// `requiresScope: false`; the workspace and the owner are the session actor's, never a param. The dispatch outcome set
// has no `not_found`, so an unknown, other-workspace or other-owner id answers `ok` with `data: null` (an empty page
// for the list). The reads write nothing and never call a Source (node c).
//
// Revoke: stored EvidenceRefs are never dropped. Each comes back with a `state` (`domain/ref-state.ts`) and
// `sourceAccess: 'unchecked'` (the Source ACL is node c's seam); one state failing never errors the whole read.

import type { PlatformActor } from '../platform-port/permissions.js';
import { holdsMenuPermission, holdsPlatformPermission } from '../platform-port/permissions.js';
import type { MenuEndpointDeclaration, ParamsJudgment } from '../menu-dispatch/types.js';
import type { InvestigationDeps } from './deps.js';
import { storedEvidence } from './domain/evidence.js';
import { DETAIL_PARAM_KEYS, LIST_PARAM_KEYS, parseDetailParams, parseListParams } from './domain/investigation-params.js';
import { refStateOf } from './domain/ref-state.js';
import { EXPLORER_INVESTIGATE_PERMISSION } from './investigation-actions.js';
import { EXPLORER_HANDOFF_PERMISSION } from './investigation-handoff.js';
import { INVESTIGATION_MENU_ID } from './menu.js';
import { getOwned, listMine } from './repositories/investigation-read.js';

type Judge = (params: Record<string, unknown>) => ParamsJudgment;

function declareRead(
  deps: InvestigationDeps,
  name: string,
  paramKeys: readonly string[],
  judge: Judge,
  run: (actor: PlatformActor, params: Record<string, unknown>) => Promise<{ outcome: 'ok'; data: unknown }>,
): MenuEndpointDeclaration {
  return {
    spec: {
      id: `logExplorer.${name}`,
      menuId: INVESTIGATION_MENU_ID,
      paramKeys,
      permission: 'platform:view',
      requiresScope: false,
      context: {},
      mergeTimeDomain: false,
    },
    authorize: (actor, tx) => holdsPlatformPermission(deps.checkService, actor, 'platform:view', tx ? { tx } : {}),
    validate: (params) => judge(params),
    async handle(args) {
      const judged = judge(args.params);
      if (!judged.ok) return { outcome: 'error', data: null, message: judged.message };
      return run(args.actor, args.params);
    },
  };
}

export function investigationEndpoints(deps: InvestigationDeps): MenuEndpointDeclaration[] {
  return [
    declareRead(deps, 'investigations', LIST_PARAM_KEYS, (p) => parseListParams(p), async (actor, params) => {
      const parsed = parseListParams(params);
      if (!parsed.ok) throw new Error('read investigations: judged ok then failed');
      return { outcome: 'ok', data: await listMine(deps.db, actor.workspace_id, actor.actor_id, parsed.value) };
    }),
    declareRead(deps, 'investigationDetail', DETAIL_PARAM_KEYS, (p) => parseDetailParams(p), async (actor, params) => {
      const parsed = parseDetailParams(params);
      if (!parsed.ok) throw new Error('read investigationDetail: judged ok then failed');
      const row = await getOwned(deps.db, actor.workspace_id, actor.actor_id, parsed.value);
      if (!row) return { outcome: 'ok', data: null };

      const roundSet =
        row.origin === 'round' && row.roundId
          ? await deps.lifecycleRead.getRoundSampleSet(deps.db, actor.workspace_id, row.roundId, viewerOf(actor))
          : null;
      const sampleSet = row.origin === 'round' ? roundSet : row.sampleSet;
      const sampleSetState = row.origin === 'standalone' ? 'inline' : roundSet ? 'round' : 'round_unavailable';
      const holdsInvestigate = await holdsMenuPermission(deps.checkService, actor, EXPLORER_INVESTIGATE_PERMISSION);
      // Same judgment as the action's `authorize`: `explorer.handoff` AND the receiver's pre-check. No handoff deps = nothing to hand to.
      const holdsHandoff = deps.handoff ? await holdsMenuPermission(deps.checkService, actor, EXPLORER_HANDOFF_PERMISSION) : false;
      const handoff = {
        round: holdsHandoff && deps.handoff ? await deps.handoff.roundIntake.canAttach(deps.db, actor) : false,
        knowledgeDraft: holdsHandoff && deps.handoff ? await deps.handoff.draftIntake.canIntake(deps.db, actor) : false,
      };
      const state = refStateOf({ holdsInvestigate, setResolved: row.origin === 'standalone' || roundSet !== null });
      return {
        outcome: 'ok',
        data: {
          id: row.id,
          title: row.title,
          origin: row.origin,
          roundId: row.roundId,
          status: row.status,
          version: String(row.rowVersion),
          createdAt: (row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt)).toISOString(),
          updatedAt: (row.updatedAt instanceof Date ? row.updatedAt : new Date(row.updatedAt)).toISOString(),
          filters: row.filters,
          sampleSet,
          sampleSetState,
          canInvestigate: holdsInvestigate,
          handoff,
          evidence: storedEvidence(row.evidence).map((ref) => ({ ref, state, sourceAccess: 'unchecked' as const })),
        },
      };
    }),
  ];
}
