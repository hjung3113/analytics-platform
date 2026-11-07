// Digest of a sample set for the cursor binding and the audit row. Same manifest and hash as log-lifecycle's `sampleManifestDigest`
// (files by `order`, keys in the order `order, fileRef, sha256`, then `sourceOwner`), kept here so this module needs no import of
// log-lifecycle; `read-contract.test.ts` pins the two together.

import { createHash } from 'node:crypto';

import type { SourceSampleSet } from '@ap/contract-schemas';

export function sampleSetDigest(set: SourceSampleSet): string {
  const files = [...set.files].sort((a, b) => a.order - b.order).map((f) => ({ order: f.order, fileRef: f.fileRef, sha256: f.sha256 }));
  return createHash('sha256').update(JSON.stringify({ files, sourceOwner: set.sourceOwner }), 'utf8').digest('hex');
}
