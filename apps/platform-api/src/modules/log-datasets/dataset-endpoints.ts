// The log test dataset reads (#1477 D-a, design log-test-datasets §6): the dataset list and one dataset with its revisions. Same read
// right and workspace rule as the other direct list menus (`platform:view`, `requiresScope: false`, the workspace is the session actor's,
// never a param). A `private` dataset is visible to its owner only. The dispatch outcome set has no `not_found`, so an unknown,
// other-workspace or invisible id answers `ok` with `data: null`. The reads write nothing.

import type { EndpointResult, MenuEndpointDeclaration, ParamsJudgment } from '../menu-dispatch/types.js';
import { holdsPlatformPermission } from '../platform-port/permissions.js';
import type { LogDatasetsDeps } from './deps.js';
import {
  DATASETS_PARAM_KEYS,
  DATASET_DETAIL_PARAM_KEYS,
  parseDatasetDetailParams,
  parseDatasetsParams,
} from './domain/dataset-params.js';
import { LOG_DATASETS_MENU_ID } from './menu.js';
import { getDatasetHead, listDatasets, toRevisionDetail } from './repositories/dataset-read.js';
import { checkSampleSetFiles } from './source-check.js';
import type { SampleSet } from './domain/sample-manifest.js';

type Judge = (params: Record<string, unknown>) => ParamsJudgment;
type Actor = { actor_id: string; workspace_id: string };

function declareRead(
  deps: LogDatasetsDeps,
  name: string,
  paramKeys: readonly string[],
  judge: Judge,
  run: (actor: Actor, params: Record<string, unknown>) => Promise<EndpointResult>,
): MenuEndpointDeclaration {
  return {
    spec: {
      id: `logDataset.${name}`,
      menuId: LOG_DATASETS_MENU_ID,
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

export function datasetEndpoints(deps: LogDatasetsDeps): MenuEndpointDeclaration[] {
  return [
    declareRead(deps, 'datasets', DATASETS_PARAM_KEYS, (p) => parseDatasetsParams(p), async (actor, params) => {
      const parsed = parseDatasetsParams(params);
      if (!parsed.ok) return { outcome: 'error', data: null, message: parsed.message };
      return { outcome: 'ok', data: await listDatasets(deps.db, { ...parsed.value, workspaceId: actor.workspace_id }, actor.actor_id) };
    }),
    declareRead(deps, 'datasetDetail', DATASET_DETAIL_PARAM_KEYS, (p) => parseDatasetDetailParams(p), async (actor, params) => {
      const parsed = parseDatasetDetailParams(params);
      if (!parsed.ok) return { outcome: 'error', data: null, message: parsed.message };
      const head = await getDatasetHead(deps.db, actor.workspace_id, actor.actor_id, parsed.value);
      if (!head) return { outcome: 'ok', data: null };
      // Availability is computed now, from the Source, for the latest revision only (a check is one call per file; older revisions are
      // shown as not checked). With no port every file is unchecked and the revision is `unverified`.
      const [latest, ...older] = head.revisions;
      const states = latest ? await checkSampleSetFiles(deps.sourceRead, latest.sampleSet as SampleSet) : undefined;
      const revisions = [
        ...(latest ? [toRevisionDetail(latest, states)] : []),
        ...older.map((row) => toRevisionDetail(row, undefined)),
      ];
      return { outcome: 'ok', data: { ...head.dataset, revisions } };
    }),
  ];
}
