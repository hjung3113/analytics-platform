// The regression suite reads (#1479 D-c, design log-test-datasets §6): `logDataset.suites` (the list), `logDataset.suiteDetail` (one suite
// with its items and what each would pin now) and `logDataset.suiteRuns` (the runs of one suite with their DERIVED state, state counts and
// pinned items). Same read right, workspace rule and session-only rule as the dataset reads (`declareRead`); an unknown or other-workspace
// suite answers `ok` with `data: null`. An item whose dataset the actor cannot see is returned `restricted`, with no id or name. The reads
// write nothing and never return log text.

import type { MenuEndpointDeclaration } from '../menu-dispatch/types.js';
import { declareRead } from './dataset-endpoints.js';
import type { LogDatasetsDeps } from './deps.js';
import {
  SUITES_PARAM_KEYS,
  SUITE_DETAIL_PARAM_KEYS,
  SUITE_RUNS_PARAM_KEYS,
  parseSuiteDetailParams,
  parseSuiteRunsParams,
  parseSuitesParams,
} from './domain/suite-params.js';
import { getSuiteDetail, listRuns, listSuites } from './repositories/suite-read.js';

export function suiteEndpoints(deps: LogDatasetsDeps): MenuEndpointDeclaration[] {
  return [
    declareRead(deps, 'suites', SUITES_PARAM_KEYS, (p) => parseSuitesParams(p), async (actor, params) => {
      const parsed = parseSuitesParams(params);
      if (!parsed.ok) return { outcome: 'error', data: null, message: parsed.message };
      return { outcome: 'ok', data: await listSuites(deps.db, { ...parsed.value, workspaceId: actor.workspace_id, actorId: actor.actor_id }) };
    }),
    declareRead(deps, 'suiteDetail', SUITE_DETAIL_PARAM_KEYS, (p) => parseSuiteDetailParams(p), async (actor, params) => {
      const parsed = parseSuiteDetailParams(params);
      if (!parsed.ok) return { outcome: 'error', data: null, message: parsed.message };
      return { outcome: 'ok', data: await getSuiteDetail(deps.db, actor.workspace_id, actor.actor_id, parsed.value) };
    }),
    declareRead(deps, 'suiteRuns', SUITE_RUNS_PARAM_KEYS, (p) => parseSuiteRunsParams(p), async (actor, params) => {
      const parsed = parseSuiteRunsParams(params);
      if (!parsed.ok) return { outcome: 'error', data: null, message: parsed.message };
      return { outcome: 'ok', data: await listRuns(deps.db, deps.lifecycleRequests, actor.workspace_id, actor.actor_id, parsed.value) };
    }),
  ];
}
