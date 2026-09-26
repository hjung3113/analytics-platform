/** Response envelope (docs/06 §18–19): exclusive `outcome` plus declared `assessments[]`. Field names are Candidates. */
export type Outcome = 'ok' | 'empty' | 'error' | 'forbidden' | 'too_large' | 'timeout';
export type AssessmentKind = 'collection' | 'processing_delay' | 'coverage' | 'time_domain';
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
