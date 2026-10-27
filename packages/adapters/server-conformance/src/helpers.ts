import {
  emptyGlobal, projectContext,
  type ActionResponse, type ApiResponse, type Assessment, type AssessmentKind, type GlobalContext, type MenuQuery, type Permission, type Trust,
} from '@ap/contracts';
import type { ConformanceCase, ServerConformanceHarness } from './types';

export const SET_KEYS = ['lineNames', 'prcGroups', 'roomNames', 'selection', 'lotIds', 'recipeIds'] as const;
/** Every GlobalContext key a request may carry, in projection order. */
export const CONTEXT_KEYS = Object.keys(emptyGlobal) as (keyof GlobalContext)[];
export const UNKNOWN_ENDPOINT = '__conformance.unknown';
export const UNKNOWN_ENTITY_TYPE = '__conformance.unknown_type';
export const UNKNOWN_KEY = '__conformance_unknown';
export const UNKNOWN_SITE = '__conformance_unknown_site';
/** Console reads are `console:access` (adapter.ts) — a contract constant, named so the kit never hardcodes it inline. */
export const CONSOLE_ACCESS: Permission = 'console:access';
/** adapter.ts `ChartAnnotation`: the only row fields a client ever sees — the server stamps the author, never sent, never returned; `mine` is the computed hint (#399). */
export const ANNOTATION_ROW_KEYS = ['id', 'chartId', 'scopeId', 'from', 'to', 'text', 'at', 'mine'] as const;
/** Outcomes that answer nothing — checklist §2 getEntity: a rejection never carries row fields. */
export const REJECTIONS: readonly ApiResponse<unknown>['outcome'][] = ['forbidden', 'error', 'too_large', 'timeout'];

export function baseRequest(harness: ServerConformanceHarness, c: ConformanceCase): MenuQuery {
  const global: GlobalContext = { ...emptyGlobal, ...harness.context, ...c.context };
  return { endpoint: c.spec.id, context: projectContext(c.spec, global), params: c.params };
}

export function describeResponse(r: ApiResponse<unknown>): string {
  return `${r.outcome}${r.message ? ` (${r.message})` : ''}`;
}

/**
 * A key omitted is not null: before the shape checks run, an `assessments` that is not an array or a `trust`
 * that is `undefined` fails naming the missing key — instead of the shape checks throwing on undefined and
 * the runner misreporting "the adapter threw instead of answering an envelope". Each check guards only the
 * key it reads, so one missing key fails its own checks and no others.
 */
export function missingEnvelopeKey(r: ApiResponse<unknown>, key: 'assessments' | 'trust'): string | null {
  if (key === 'assessments' && !Array.isArray(r.assessments)) return '`assessments` is missing';
  if (key === 'trust' && r.trust === undefined) return '`trust` is missing — send null for non-mart data (06 §18)';
  return null;
}

/** 06 §19: each assessment must carry what its state claims — a source when it asserts, a reason when it cannot. */
export function assessmentProblem(assessments: readonly Assessment[], outcome: ApiResponse<unknown>['outcome']): string | null {
  const seen = new Set<AssessmentKind>();
  for (const a of assessments) {
    if (seen.has(a.kind)) return `assessment kind ${a.kind} appears more than once (06 §19)`;
    seen.add(a.kind);
    if ((a.state === 'confirmed' || a.state === 'clear') && (!a.statusSource || !a.observedAt)) {
      return `${a.kind} is ${a.state} without statusSource/observedAt (06 §19)`;
    }
    if (a.state === 'unknown' && !a.reason) return `${a.kind} is unknown without a reason (06 §19)`;
    if (a.explainsEmpty === true && !(outcome === 'empty' && a.state === 'confirmed')) {
      return `${a.kind} sets explainsEmpty outside an empty outcome confirmed by a source (06 §19)`;
    }
  }
  return null;
}

/** 06 §18 + contracts `Trust`: trust is null (not mart data) or complete — unknown values are null, never dropped or retyped. */
export function trustProblem(trust: Trust | null): string | null {
  if (trust === null) return null;
  if (typeof trust.updatedAt !== 'string') return 'trust.updatedAt is not a string (06 §18)';
  if (trust.dataThrough !== null && typeof trust.dataThrough !== 'string') return 'trust.dataThrough is not a string or null (06 §18)';
  if (trust.coverage !== null && typeof trust.coverage !== 'number') return 'trust.coverage is not a number or null (06 §18)';
  if (typeof trust.provisional !== 'boolean') return 'trust.provisional is not a boolean (06 §18)';
  if (typeof trust.source !== 'string') return 'trust.source is not a string (06 §18)';
  if (trust.metricVersion !== undefined && typeof trust.metricVersion !== 'string') return 'trust.metricVersion is neither absent nor a string (06 §18)';
  const versions: unknown = trust.sourceLogicVersions;
  if (versions !== undefined) {
    if (!Array.isArray(versions)) return 'trust.sourceLogicVersions is neither absent nor an array (06 §18)';
    if (versions.length === 0) return 'trust.sourceLogicVersions is empty — omit the field when unknown (06 §18)';
    if (versions.some(v => typeof v !== 'string' || v === '')) return 'trust.sourceLogicVersions has an entry that is not a non-empty string (06 §18)';
    if (new Set(versions).size !== versions.length) return 'trust.sourceLogicVersions has duplicate entries (06 §18)';
  }
  return null;
}

export function sameKinds(actual: readonly { kind: AssessmentKind }[], declared: readonly AssessmentKind[]): boolean {
  const a = actual.map(x => x.kind).sort();
  const d = [...declared].sort();
  return a.length === d.length && a.every((kind, i) => kind === d[i]);
}

export function expectOutcome(send: () => Promise<ApiResponse<unknown>>, outcome: ApiResponse<unknown>['outcome'], why: string) {
  return async () => {
    const r = await send();
    if (r.outcome !== outcome) return `${why}: expected ${outcome}, got ${describeResponse(r)}`;
    if (REJECTIONS.includes(r.outcome) && r.data !== null) {
      return `${why}: a ${r.outcome} answer carries no data (checklist §2: rejections never carry row fields)`;
    }
    return null;
  };
}

export const describeAction = (r: ActionResponse<unknown>): string => `${r.outcome}${r.message ? ` (${r.message})` : ''}`;
