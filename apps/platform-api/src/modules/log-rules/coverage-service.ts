// Composes the coverage of one model (#1494 R-d): the log-knowledge effective requirement keys (barrel read port) and the
// current catalog of this module, then the pure computation. Both reads run on the handle the caller passes. A drizzle
// transaction handle keeps one snapshot of the catalog reads and takes the model advisory lock inside the port; a
// pool-backed `Db` makes the port open its own transaction. The only lock taken is that one model lock, after the
// catalog reads (which take none), so two coverage reads cannot deadlock each other; a caller that loops over models
// must pass a pool-backed handle so no lock is held across iterations. Nothing here writes.

import type { Tx } from '../../db/tx.js';
import { type CoverageCatalogInput, type CoverageResult, type CoverageSpecInput, computeCoverage } from './domain/coverage.js';
import type { CoverageKnowledge } from './deps.js';
import { loadCoverageCatalog } from './repositories/coverage-read.js';

export async function readSpecInput(
  knowledge: CoverageKnowledge,
  tx: Tx,
  workspaceId: string,
  modelId: string,
  softwareId: string | null,
  viewerActorId: string,
): Promise<CoverageSpecInput> {
  const r = await knowledge.listEffectiveRequirements(tx, workspaceId, modelId, softwareId, viewerActorId);
  if (r.state === 'ok') return { state: 'ok', specPin: r.specPin, keys: r.requirements.map((x) => x.key) };
  if (r.state === 'ambiguous_key') return { state: 'ambiguous_key', specPin: r.specPin, ambiguousKeys: r.ambiguousKeys };
  return { state: r.state, specPin: null };
}

export async function computeModelCoverage(
  deps: { knowledge: CoverageKnowledge },
  tx: Tx,
  workspaceId: string,
  modelId: string,
  softwareId: string | null,
  viewerActorId: string,
  catalog?: CoverageCatalogInput,
): Promise<CoverageResult> {
  const loaded = catalog ?? (await loadCoverageCatalog(tx, workspaceId));
  return computeCoverage(await readSpecInput(deps.knowledge, tx, workspaceId, modelId, softwareId, viewerActorId), loaded);
}
