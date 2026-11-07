// The file check of a revision (design log-test-datasets §3.2): ask the Source owner, through the injected `SourceReadPort`, whether each
// `fileRef` exists and whether its hash is still the recorded one. Nothing is stored and no file content is kept: the answer is one
// state per file (`FileCheckState`), judged by `domain/availability.ts`. This module never imports the synthetic adapter or `testing/`.
//
// What the v0 port can answer: existence (`getWindow` of line 1) but not a file hash. A port that can tell the hash adds the optional
// `describeFile`; without it a found file is `hash_unknown` and the revision is `unverified`, never confirmed.

import type { SourceReadContext, SourceReadPort } from '../log-explorer/index.js';
import type { FileCheckState } from './domain/availability.js';
import type { SampleSet } from './domain/sample-manifest.js';

export interface DescribeFileRequest {
  sourceOwner: string;
  fileRef: string;
}
export type DescribeFileResponse =
  | { status: 'ok'; sha256: string }
  | { status: 'unsupported' | 'permission_denied' | 'source_absent' };

/** A port that can read a file's current hash. Optional extension of the v0 port (the contract has no hash read yet). */
export interface FileHashReader {
  describeFile(request: DescribeFileRequest, ctx: SourceReadContext): Promise<DescribeFileResponse>;
}
export type DatasetSourceRead = SourceReadPort & Partial<FileHashReader>;

/** Start values: one call at most 2 s, the whole check 10 s, 8 files in flight. A file not reached in time is `error`. */
export const FILE_CHECK_CALL_BUDGET_MS = 2_000;
export const FILE_CHECK_TOTAL_BUDGET_MS = 10_000;
export const FILE_CHECK_CONCURRENCY = 8;

async function checkOne(port: DatasetSourceRead, sourceOwner: string, file: SampleSet['files'][number], signal: AbortSignal): Promise<FileCheckState> {
  const ctx: SourceReadContext = { signal, timeBudgetMs: FILE_CHECK_CALL_BUDGET_MS };
  try {
    if (port.describeFile) {
      const answer = await port.describeFile({ sourceOwner, fileRef: file.fileRef }, ctx);
      switch (answer.status) {
        case 'ok':
          return answer.sha256.toLowerCase() === file.sha256 ? 'match' : 'hash_mismatch';
        case 'source_absent':
          return 'absent';
        case 'permission_denied':
          return 'permission_denied';
        default:
          return 'unsupported';
      }
    }
    const answer = await port.getWindow({ sourceOwner, fileRef: file.fileRef, line: 1, before: 0, after: 0 }, ctx);
    switch (answer.status) {
      case 'ok':
        return 'hash_unknown';
      case 'source_absent':
        return 'absent';
      case 'permission_denied':
        return 'permission_denied';
      default:
        return 'unsupported';
    }
  } catch {
    // An aborted call, a spent budget and an adapter failure all mean "not settled"; the error text is never kept.
    return 'error';
  }
}

/**
 * One state per file, in the file order of the sample set. `null` port = no check was made (the caller shows `unverified`).
 * Never throws: every failure of the port is the state `error` of the file it hit.
 */
export async function checkSampleSetFiles(port: DatasetSourceRead | null | undefined, set: SampleSet): Promise<FileCheckState[] | null> {
  if (!port) return null;
  const files = [...set.files].sort((a, b) => a.order - b.order);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FILE_CHECK_TOTAL_BUDGET_MS);
  const states: FileCheckState[] = new Array<FileCheckState>(files.length).fill('error');
  let next = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const index = next;
      next += 1;
      const file = files[index];
      if (!file) return;
      states[index] = controller.signal.aborted ? 'error' : await checkOne(port as DatasetSourceRead, set.sourceOwner, file, controller.signal);
    }
  }
  try {
    await Promise.all(Array.from({ length: Math.min(FILE_CHECK_CONCURRENCY, files.length) }, () => worker()));
  } finally {
    clearTimeout(timer);
  }
  return states;
}
