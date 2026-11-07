// The file check of a revision (design log-test-datasets §3.2): ask the Source owner, through the injected `SourceReadPort`, whether each
// `fileRef` exists and whether its hash is still the recorded one. Nothing is stored and no file content is kept: the answer is one
// state per file (`FileCheckState`), judged by `domain/availability.ts`. This module never imports the synthetic adapter or `testing/`.
//
// What the v0 port can answer: existence (`getWindow` of line 1) but not a file hash. A port that can tell the hash adds the optional
// `describeFile`; without it a found file is `hash_unknown` and the revision is `unverified`, never confirmed.

import type { SourceOwnerAccess, SourceReadContext, SourceReadPort } from '../log-explorer/index.js';
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
 * Settles `work` or gives up at `ms`, whatever the adapter does: the deadline is a timer of this module, not the adapter's reaction to an abort,
 * so an adapter that ignores the signal or never settles cannot hold the check. Timer and listener are always cleared; a late result is ignored.
 */
function raceDeadline<T>(work: Promise<T>, ms: number, outer: AbortSignal, fallback: T, onTimeout: () => void): Promise<T> {
  return new Promise<T>((resolve) => {
    let done = false;
    const finish = (value: T, timedOut: boolean) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      outer.removeEventListener('abort', onOuter);
      if (timedOut) onTimeout();
      resolve(value);
    };
    const timer = setTimeout(() => finish(fallback, true), ms);
    const onOuter = () => finish(fallback, false);
    if (outer.aborted) return finish(fallback, false);
    outer.addEventListener('abort', onOuter, { once: true });
    work.then(
      (value) => finish(value, false),
      () => finish(fallback, false),
    );
  });
}

/**
 * One state per file, in the file order of the sample set. `null` port = no check was made (the caller shows `unverified`).
 * Never throws: every failure of the port is the state `error` of the file it hit. Deadlines (per call and total) are enforced here with
 * timers independent of the adapter (`raceDeadline`); a file that missed one is `error`.
 */
export async function checkSampleSetFiles(port: DatasetSourceRead | null | undefined, set: SampleSet): Promise<FileCheckState[] | null> {
  if (!port) return null;
  const files = [...set.files].sort((a, b) => a.order - b.order);
  const total = new AbortController();
  const totalTimer = setTimeout(() => total.abort(), FILE_CHECK_TOTAL_BUDGET_MS);
  const states: FileCheckState[] = new Array<FileCheckState>(files.length).fill('error');
  let next = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const index = next;
      next += 1;
      const file = files[index];
      if (!file) return;
      if (total.signal.aborted) continue;
      // One controller per call: aborted on the per-call deadline or the total one, so a cooperative adapter stops early too.
      const call = new AbortController();
      const stop = () => call.abort();
      total.signal.addEventListener('abort', stop, { once: true });
      try {
        states[index] = await raceDeadline(
          checkOne(port as DatasetSourceRead, set.sourceOwner, file, call.signal),
          FILE_CHECK_CALL_BUDGET_MS,
          total.signal,
          'error' as FileCheckState,
          stop,
        );
      } finally {
        total.signal.removeEventListener('abort', stop);
      }
    }
  }
  try {
    await Promise.all(Array.from({ length: Math.min(FILE_CHECK_CONCURRENCY, files.length) }, () => worker()));
  } finally {
    clearTimeout(totalTimer);
  }
  return states;
}

/**
 * The same check behind the Source-owner ACL (the seam of `explorer.source.read`, #1469): an actor the owner is not open to makes no Source
 * call at all and every file is `permission_denied` (revision availability `unavailable`). No port = no check, as before.
 */
export async function checkSampleSetFilesFor(
  port: DatasetSourceRead | null | undefined,
  access: SourceOwnerAccess,
  actor: { actor_id: string; workspace_id: string },
  set: SampleSet,
): Promise<FileCheckState[] | null> {
  if (!port) return null;
  if (!(await access.allows(actor, set.sourceOwner))) return set.files.map((): FileCheckState => 'permission_denied');
  return checkSampleSetFiles(port, set);
}
