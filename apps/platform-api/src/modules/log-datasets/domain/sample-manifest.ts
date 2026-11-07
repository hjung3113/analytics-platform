// The sample list of a revision is the log-lifecycle shape and digest, defined in one place (design log-test-datasets §2): parse and digest
// are re-exported from the log-lifecycle barrel, never copied. The digest is order-sensitive: reordering the files is a new manifest.

export { parseSampleSet, sampleManifestDigest } from '../../log-lifecycle/index.js';
export type { SampleSet } from '../../log-lifecycle/index.js';
