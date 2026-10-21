import type { ActionOutcome, ActionResponse, ApiResponse, Outcome, PublishedMetric, Session } from '@ap/contracts';

const OUTCOMES: readonly string[] = ['ok', 'empty', 'error', 'forbidden', 'too_large', 'timeout'];
const ACTION_OUTCOMES: readonly string[] = ['ok', 'invalid', 'conflict', 'forbidden', 'not_found', 'error', 'unknown'];

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Shape check only (06 §19): unknown keys are dropped, never judged. */
export function toEnvelope(value: unknown): ApiResponse<unknown> | null {
  if (!isRecord(value)) return null;
  const { outcome, assessments, correlationId, trust, message } = value;
  if (typeof outcome !== 'string' || !OUTCOMES.includes(outcome)) return null;
  if (!Array.isArray(assessments)) return null;
  if (typeof correlationId !== 'string' || correlationId === '') return null;
  if (trust !== null && trust !== undefined && !isRecord(trust)) return null;
  return {
    outcome: outcome as Outcome,
    data: value['data'] ?? null,
    assessments: assessments as ApiResponse<unknown>['assessments'],
    trust: (trust ?? null) as ApiResponse<unknown>['trust'],
    correlationId,
    ...(typeof message === 'string' ? { message } : {}),
  };
}

export function toActionResponse(value: unknown): ActionResponse<unknown> | null {
  if (!isRecord(value)) return null;
  const { outcome, version, fieldErrors, replayed, correlationId, message } = value;
  if (typeof outcome !== 'string' || !ACTION_OUTCOMES.includes(outcome)) return null;
  if (version !== null && typeof version !== 'string') return null;
  if (!Array.isArray(fieldErrors)) return null;
  if (typeof replayed !== 'boolean') return null;
  if (typeof correlationId !== 'string' || correlationId === '') return null;
  return {
    outcome: outcome as ActionOutcome,
    data: value['data'] ?? null,
    version,
    fieldErrors: fieldErrors as ActionResponse<unknown>['fieldErrors'],
    replayed,
    correlationId,
    ...(typeof message === 'string' ? { message } : {}),
  };
}

export type BootstrapPayload = {
  session: Session;
  publishedMetrics: readonly PublishedMetric[];
  defaultRangeTo: string;
  sessionVersion: string;
  csrfToken: string;
};

export function toBootstrap(value: unknown): BootstrapPayload | null {
  if (!isRecord(value)) return null;
  const { session, publishedMetrics, defaultRangeTo, sessionVersion, csrfToken } = value;
  if (!isRecord(session) || !isRecord(session['user']) || !Array.isArray(session['scopes'])) return null;
  if (!Array.isArray(publishedMetrics)) return null;
  if (typeof defaultRangeTo !== 'string' || typeof sessionVersion !== 'string' || typeof csrfToken !== 'string') return null;
  return {
    session: session as unknown as Session,
    publishedMetrics: publishedMetrics as PublishedMetric[],
    defaultRangeTo,
    sessionVersion,
    csrfToken,
  };
}

export function toSessionVersion(value: unknown): string | null {
  return isRecord(value) && typeof value['sessionVersion'] === 'string' ? value['sessionVersion'] : null;
}
