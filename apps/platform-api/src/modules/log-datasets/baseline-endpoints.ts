// The baseline reads (#1478 D-b, design log-test-datasets §6): `logDataset.baselines` (the baselines of one revision with status, seq,
// approver and the 기준 낡음 badge) and `logDataset.baselineDetail` (one baseline: pin, scope, expectations, parser golden reference and its
// history). Same read right, workspace rule and session-only rule as the dataset reads (`declareRead`); an unknown, other-workspace or invisible
// id (a `private` dataset of another owner) answers `ok` with `data: null`. The reads write nothing.
//
// 기준 낡음 (design §3.4) is computed here, at read time, for an APPROVED baseline only: the revision's files are checked through the Source
// (Source-owner ACL first, deadlines enforced by `source-check.ts`, no port = unchecked), the pinned spec is compared with the effective spec
// from the knowledge catalog port, and what cannot be read is `unknown`, never `stale` (`domain/baseline-stale.ts`).

import type { ProfilePin } from './domain/baseline-input.js';
import { BASELINES_PARAM_KEYS, BASELINE_DETAIL_PARAM_KEYS, parseBaselineDetailParams, parseBaselinesParams } from './domain/baseline-params.js';
import type { SampleSet } from './domain/sample-manifest.js';
import type { LogDatasetsDeps } from './deps.js';
import { declareRead } from './dataset-endpoints.js';
import { getBaselineDetail, getVisibleRevision, listBaselinesOf } from './repositories/baseline-read.js';
import { staleOf } from './stale-read.js';
import { checkSampleSetFilesFor } from './source-check.js';
import type { MenuEndpointDeclaration } from '../menu-dispatch/types.js';

type Actor = { actor_id: string; workspace_id: string };

export function baselineEndpoints(deps: LogDatasetsDeps): MenuEndpointDeclaration[] {
  const staleForRevision = async (actor: Actor, pin: ProfilePin, sampleSet: SampleSet) =>
    staleOf(deps, actor.workspace_id, pin, await checkSampleSetFilesFor(deps.sourceRead, deps.sourceOwnerAccess, actor, sampleSet), actor.actor_id);

  return [
    declareRead(deps, 'baselines', BASELINES_PARAM_KEYS, (p) => parseBaselinesParams(p), async (actor, params) => {
      const parsed = parseBaselinesParams(params);
      if (!parsed.ok) return { outcome: 'error', data: null, message: parsed.message };
      const revision = await getVisibleRevision(deps.db, actor.workspace_id, actor.actor_id, parsed.value);
      if (!revision) return { outcome: 'ok', data: null };
      const rows = await listBaselinesOf(deps.db, actor.workspace_id, revision.revisionId);
      // Only the approved baseline is judged (a draft has nothing to be stale against, a superseded one is history); one Source check at most.
      const approved = rows.find((r) => r.status === 'approved');
      const stale = approved ? await staleForRevision(actor, approved.profilePin, revision.sampleSet) : null;
      return {
        outcome: 'ok',
        data: {
          datasetRevisionId: revision.revisionId,
          datasetId: revision.datasetId,
          revisionSeq: revision.seq,
          rows: rows.map((r) => ({ ...r, stale: r.id === approved?.id ? stale : null })),
        },
      };
    }),
    declareRead(deps, 'baselineDetail', BASELINE_DETAIL_PARAM_KEYS, (p) => parseBaselineDetailParams(p), async (actor, params) => {
      const parsed = parseBaselineDetailParams(params);
      if (!parsed.ok) return { outcome: 'error', data: null, message: parsed.message };
      const detail = await getBaselineDetail(deps.db, actor.workspace_id, actor.actor_id, parsed.value);
      if (!detail) return { outcome: 'ok', data: null };
      const { revision, ...rest } = detail;
      const stale = detail.status === 'approved' ? await staleForRevision(actor, detail.profilePin, revision.sampleSet) : null;
      return { outcome: 'ok', data: { ...rest, datasetId: revision.datasetId, revisionSeq: revision.seq, stale } };
    }),
  ];
}
