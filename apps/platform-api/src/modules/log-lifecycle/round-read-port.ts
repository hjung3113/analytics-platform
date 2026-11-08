// The read port other modules use to resolve a validation round (#1468 b, log explorer): the sample set of a round in
// the caller's workspace, or null when the round does not exist there. Reads only; the round rows stay this module's.

import type { Tx } from '../../db/tx.js';
import type { SampleSet } from './domain/sample-set.js';
import { getRoundSampleSet } from './repositories/lifecycle-read.js';

export interface LifecycleRoundRead {
  /** The round's sample set (files in the user's order), or null for an unknown or other-workspace round. */
  getRoundSampleSet(tx: Tx, workspaceId: string, roundId: string): Promise<SampleSet | null>;
}

export const lifecycleRoundRead: LifecycleRoundRead = {
  async getRoundSampleSet(tx, workspaceId, roundId) {
    return getRoundSampleSet(tx, workspaceId, roundId);
  },
};
