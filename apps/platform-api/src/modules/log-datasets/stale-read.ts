// The 기준 낡음 badge of an approved baseline at read time (#1478 D-b, design log-test-datasets §3.4): the file states come from the caller
// (one Source check per revision, behind the Source-owner ACL), the pinned spec is compared with the effective spec of the knowledge catalog
// port, and what cannot be read is `unknown`. The comparison itself is `domain/baseline-stale.ts` (pure).

import type { LogDatasetsDeps } from './deps.js';
import type { FileCheckState } from './domain/availability.js';
import type { ProfilePin } from './domain/baseline-input.js';
import { type CurrentSpecPin, type StaleSummary, computeStale } from './domain/baseline-stale.js';

/**
 * The 기준 낡음 badge of an approved baseline from already-known file states (`null` = no check was made). The pinned spec is read from the
 * knowledge catalog port; a port failure, an unreadable spec or a missing port is `unknown` for that aspect.
 */
export async function staleOf(deps: LogDatasetsDeps, workspaceId: string, pin: ProfilePin, files: readonly FileCheckState[] | null): Promise<StaleSummary> {
  let currentSpecPin: CurrentSpecPin | null = null;
  if (pin.specPin) {
    const { modelId, softwareId } = pin.specPin;
    try {
      // One transaction: the pin read takes a transaction advisory lock that must live until its last read. A pinned software that does not
      // resolve (unknown, another model's, another workspace's) leaves the spec unresolvable: unknown, never the base model spec.
      currentSpecPin = await deps.db.transaction(async (tx) => {
        if (softwareId !== null && !(await deps.knowledgeLookup.getSoftware(tx, workspaceId, modelId, softwareId))) return null;
        return deps.knowledgeLookup.getEffectiveSpecPin(tx, workspaceId, modelId, softwareId);
      });
    } catch {
      currentSpecPin = null; // an unreadable spec is unknown, never stale; the error text is not kept
    }
  }
  return computeStale({ files, pin, currentSpecPin });
}
