export interface WorkerSummaryV1 {
  fixture?: 'synthetic';
  mode?: 'pass' | 'fail' | 'incomplete';
  durationMs?: number;
  producer?: string;
  producerVersion?: string;
}

export interface WorkerSummaryProjection {
  workerSummaryProjection: 1;
  workerSummaryState: 'not_submitted' | 'no_allowed_fields' | 'available';
  workerSummary: WorkerSummaryV1 | null;
}

/** Read-only, body-free projection of untrusted stored summary JSON. */
export function projectWorkerSummary(stored: unknown): WorkerSummaryProjection {
  if (stored === null) return { workerSummaryProjection: 1, workerSummaryState: 'not_submitted', workerSummary: null };

  const summary: WorkerSummaryV1 = {};
  if (typeof stored === 'object' && !Array.isArray(stored)) {
    const raw = stored as Record<string, unknown>;
    if (raw.fixture === 'synthetic') summary.fixture = raw.fixture;
    if (raw.mode === 'pass' || raw.mode === 'fail' || raw.mode === 'incomplete') summary.mode = raw.mode;
    if (typeof raw.durationMs === 'number' && Number.isInteger(raw.durationMs) && raw.durationMs >= 0 && raw.durationMs <= 86_400_000) summary.durationMs = raw.durationMs;
    // Strict end-of-input assertions also reject a final newline (which `$` alone accepts).
    if (typeof raw.producer === 'string' && /^[a-z0-9][a-z0-9._-]{0,63}(?![\s\S])/.test(raw.producer)) summary.producer = raw.producer;
    if (typeof raw.producerVersion === 'string' && /^[0-9A-Za-z][0-9A-Za-z.+_-]{0,63}(?![\s\S])/.test(raw.producerVersion)) summary.producerVersion = raw.producerVersion;
  }
  return Object.keys(summary).length === 0
    ? { workerSummaryProjection: 1, workerSummaryState: 'no_allowed_fields', workerSummary: null }
    : { workerSummaryProjection: 1, workerSummaryState: 'available', workerSummary: summary };
}
