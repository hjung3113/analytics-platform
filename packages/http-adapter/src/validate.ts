import type { ActionOutcome, ActionResponse, ApiResponse, Outcome, PublishedMetric, Session } from '@ap/contracts';

const OUTCOMES: readonly string[] = ['ok', 'empty', 'error', 'forbidden', 'too_large', 'timeout'];
const ACTION_OUTCOMES: readonly string[] = ['ok', 'invalid', 'conflict', 'forbidden', 'not_found', 'error', 'unknown'];

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const ASSESSMENT_KINDS: readonly string[] = ['collection', 'processing_delay', 'coverage', 'time_domain', 'respondent_history'];
const ASSESSMENT_STATES: readonly string[] = ['confirmed', 'clear', 'unknown'];
const ASSESSMENT_REASONS: readonly string[] = ['source_unavailable', 'check_failed'];
const WALL_CLOCK = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;

const isString = (value: unknown): value is string => typeof value === 'string';
const isNonEmpty = (value: unknown): value is string => typeof value === 'string' && value !== '';
const isOptional = (value: unknown, check: (v: unknown) => boolean): boolean => value === undefined || check(value);

/** A server `message` is shown as-is only when it is short and free of URLs and control characters (contract §2.1). */
export function safeMessage(message: string): string {
  return message.length <= 200 && !CONTROL.test(message) && !message.includes('://') ? message : 'server_message_redacted';
}

const withMessage = (message: unknown): { message?: string } => (isString(message) ? { message: safeMessage(message) } : {});

function isAssessment(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isString(value['kind']) && ASSESSMENT_KINDS.includes(value['kind']) &&
    isString(value['state']) && ASSESSMENT_STATES.includes(value['state']) &&
    isOptional(value['statusSource'], isString) &&
    isOptional(value['observedAt'], isString) &&
    isOptional(value['reason'], (v) => isString(v) && ASSESSMENT_REASONS.includes(v)) &&
    isOptional(value['explainsEmpty'], (v) => typeof v === 'boolean') &&
    isOptional(value['detail'], isString)
  );
}

function isTrust(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isString(value['updatedAt']) &&
    (value['dataThrough'] === null || isString(value['dataThrough'])) &&
    (value['coverage'] === null || typeof value['coverage'] === 'number') &&
    isOptional(value['metricVersion'], isString) &&
    typeof value['provisional'] === 'boolean' &&
    isString(value['source'])
  );
}

function isFieldError(value: unknown): boolean {
  return isRecord(value) && Array.isArray(value['path']) && value['path'].every(isString) && isString(value['code']);
}

/** Structure check (06 §19): every `ApiResponse` field is required, unknown keys are dropped, nothing is synthesized. */
export function toEnvelope(value: unknown): ApiResponse<unknown> | null {
  if (!isRecord(value)) return null;
  const { outcome, data, assessments, correlationId, trust, message } = value;
  if (!isString(outcome) || !OUTCOMES.includes(outcome)) return null;
  if (!('data' in value)) return null;
  if (!Array.isArray(assessments) || !assessments.every(isAssessment)) return null;
  if (trust !== null && !isTrust(trust)) return null;
  if (!isNonEmpty(correlationId)) return null;
  return {
    outcome: outcome as Outcome,
    data,
    assessments: assessments as ApiResponse<unknown>['assessments'],
    trust: trust as ApiResponse<unknown>['trust'],
    correlationId,
    ...withMessage(message),
  };
}

export function toActionResponse(value: unknown): ActionResponse<unknown> | null {
  if (!isRecord(value)) return null;
  const { outcome, data, version, fieldErrors, replayed, correlationId, message } = value;
  if (!isString(outcome) || !ACTION_OUTCOMES.includes(outcome)) return null;
  if (!('data' in value)) return null;
  if (version !== null && !isString(version)) return null;
  if (!Array.isArray(fieldErrors) || !fieldErrors.every(isFieldError)) return null;
  if (typeof replayed !== 'boolean') return null;
  if (!isNonEmpty(correlationId)) return null;
  return {
    outcome: outcome as ActionOutcome,
    data,
    version,
    fieldErrors: fieldErrors as ActionResponse<unknown>['fieldErrors'],
    replayed,
    correlationId,
    ...withMessage(message),
  };
}

export type BootstrapPayload = {
  session: Session;
  publishedMetrics: readonly PublishedMetric[];
  defaultRangeTo: string;
  sessionVersion: string;
  csrfToken: string;
};

function isSession(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const { user, scopes } = value;
  if (!isRecord(user) || !isNonEmpty(user['id']) || !isString(user['name'])) return false;
  const title = user['title'];
  if (!isRecord(title) || !isString(title['ko']) || !isString(title['en'])) return false;
  if (!Array.isArray(user['permissions']) || !user['permissions'].every(isString)) return false;
  return (
    Array.isArray(scopes) &&
    scopes.every((s) => isRecord(s) && isNonEmpty(s['id']) && isString(s['label']) && typeof s['grantedRooms'] === 'number' && typeof s['totalRooms'] === 'number')
  );
}

const isPublishedMetric = (value: unknown): boolean =>
  isRecord(value) && isNonEmpty(value['metricId']) && (value['publishedVersion'] === null || isString(value['publishedVersion']));

export function toBootstrap(value: unknown): BootstrapPayload | null {
  if (!isRecord(value)) return null;
  const { session, publishedMetrics, defaultRangeTo, sessionVersion, csrfToken } = value;
  if (!isSession(session)) return null;
  if (!Array.isArray(publishedMetrics) || !publishedMetrics.every(isPublishedMetric)) return null;
  if (!isString(defaultRangeTo) || !WALL_CLOCK.test(defaultRangeTo)) return null;
  if (!isNonEmpty(sessionVersion) || !isNonEmpty(csrfToken)) return null;
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
