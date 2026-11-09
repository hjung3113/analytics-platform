// Failure classes of the load runner (#1599): why a `runSearch` call failed, so a miss is reported by reason and not as one unclassified number.
// Pure and DB-free (`failure-class.test.ts`). The classes follow what the runner's pool can produce:
//   statement_timeout  Postgres cancelled the statement (SQLSTATE 57014, «canceling statement due to statement timeout»)
//   pool_acquire       no connection became free in time (pg-pool «timeout exceeded when trying to connect»): pool exhaustion
//   connection         the connection broke or was refused (SQLSTATE 08xxx / 57P01, «Connection terminated», ECONNRESET, ECONNREFUSED)
//   shared_memory      Postgres could not allocate a parallel-query segment («could not resize shared memory segment … No space left on device»): the server's /dev/shm (Docker default 64 MB) is too small for the parallel workers
//   refused            the read answered `ok: false` (a refusal such as a foreign cursor), not an exception
//   other              anything else; the first message of each class is kept by the runner
export const FAILURE_CLASSES = ['statement_timeout', 'pool_acquire', 'connection', 'shared_memory', 'refused', 'other'] as const;
export type FailureClass = (typeof FAILURE_CLASSES)[number];

export function classifyFailure(error: unknown): FailureClass {
  if (typeof error === 'object' && error !== null && 'ok' in error && (error as { ok: unknown }).ok === false) return 'refused';
  const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code: unknown }).code) : '';
  const message = error instanceof Error ? error.message : String(error);
  if (code === '57014' || /statement timeout|canceling statement/i.test(message)) return 'statement_timeout';
  if (/timeout exceeded when trying to connect/i.test(message)) return 'pool_acquire';
  if (/shared memory segment/i.test(message)) return 'shared_memory';
  if (code.startsWith('08') || code === '57P01' || /connection terminated|ECONNRESET|ECONNREFUSED|connection error/i.test(message) || /^E(CONN|PIPE)/.test(code)) return 'connection';
  return 'other';
}

/** Counts per class (all classes present, zero included) and the first message seen for each class that occurred. */
export function summarizeFailures(failures: readonly { cls: FailureClass; message: string }[]): { counts: Record<FailureClass, number>; samples: Partial<Record<FailureClass, string>> } {
  const counts = Object.fromEntries(FAILURE_CLASSES.map((c) => [c, 0])) as Record<FailureClass, number>;
  const samples: Partial<Record<FailureClass, string>> = {};
  for (const f of failures) {
    counts[f.cls] += 1;
    samples[f.cls] ??= f.message.slice(0, 200);
  }
  return { counts, samples };
}
