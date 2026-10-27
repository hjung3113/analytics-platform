/** Response envelope (docs/06 §18–19): exclusive `outcome` plus declared `assessments[]`. Field names are Candidates. */
/** The outcome vocabulary at runtime — emitted to `vocab.json` (#674). */
export const OUTCOMES = ['ok', 'empty', 'error', 'forbidden', 'too_large', 'timeout'] as const;
export type Outcome = typeof OUTCOMES[number];
/** §19: the platform owns the kind list; a query must not drop an applicable kind because its source is unimplemented. */
export type AssessmentKind = 'collection' | 'processing_delay' | 'coverage' | 'time_domain' | 'respondent_history';
export type Assessment = {
  kind: AssessmentKind;
  state: 'confirmed' | 'clear' | 'unknown';
  statusSource?: string;
  observedAt?: string;
  reason?: 'source_unavailable' | 'check_failed';
  explainsEmpty?: boolean;
  detail?: string;
};
export type Trust = {
  updatedAt: string;
  dataThrough: string | null;
  coverage: number | null;
  metricVersion?: string;
  provisional: boolean;
  source: string;
};
export type ApiResponse<T> = {
  outcome: Outcome;
  data: T | null;
  assessments: Assessment[];
  trust: Trust | null;
  correlationId: string;
  message?: string;
};
