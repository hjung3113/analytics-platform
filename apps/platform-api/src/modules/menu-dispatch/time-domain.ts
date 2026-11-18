// Step 7 of the `menuQuery` judgment (real-server-checklist §3, kernel §6.3): may this request put several
// equipment on one wall-clock axis? The core owns the judgment; the deployment owns where the proof comes from.
//
// The proof source is injected (`TimeDomainProofSource`) and returns, for one request, the *subjects* whose
// time domain must be proven over `[from, to)` together with their server-owned windows. A subject is what the
// deployment can vouch for: each equipment the request actually reads (the §6.3 minimum), or a stronger
// proof that covers every equipment of the requested Site. Which shapes a deployment may supply is decided
// outside this file; this file only judges coverage and agreement, and fails closed on anything else.
//
// Verdict over the windows returned (half-open `[validFrom, validTo)`, naive wall-clock seconds):
// - every subject must cover `[from, to)` without a gap; abutting windows of the same domain stitch;
// - all covering windows of all subjects must name one `timeDomainId` (a mid-request change is a mismatch);
// - no subject, a malformed window, or a source failure is `time_domain_unverified` — never a pass.

import type { PlatformActor } from '../platform-port/permissions.js';
import type { ScopeGrant } from './scope-resolver.js';

/** One server-owned window: the subject's records are in `timeDomainId` over `[validFrom, validTo)`. */
export interface TimeDomainWindow {
  timeDomainId: string;
  validFrom: string;
  validTo: string;
}

/** What the source vouches for in this request, with its windows. `subjectId` is for messages only. */
export interface TimeDomainSubject {
  subjectId: string;
  windows: readonly TimeDomainWindow[];
}

export interface TimeDomainProofRequest {
  endpointId: string;
  actor: PlatformActor;
  /** The requested Site. Step 4 has already proven the actor may read it. */
  scopeId: string;
  from: string;
  to: string;
  /** Only the applied Context keys, by wire name: the source resolves the equipment the request reads from them. */
  context: Readonly<Record<string, unknown>>;
  scopes: readonly ScopeGrant[];
  signal?: AbortSignal;
}

/** Deployment-owned. Called only for `mergeTimeDomain: true` endpoints, after steps 1–6. */
export interface TimeDomainProofSource {
  prove(request: TimeDomainProofRequest): Promise<readonly TimeDomainSubject[]>;
}

export type TimeDomainVerdict =
  | { ok: true; timeDomainId: string }
  | { ok: false; message: 'time_domain_unverified' | 'time_domain_mismatch' };

const DATETIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/;

/** Wall-clock ms of `YYYY-MM-DDTHH:mm:ss` read as UTC digits, or NaN when it is not a real calendar time. */
export function wallClockMs(value: unknown): number {
  const m = typeof value === 'string' ? DATETIME.exec(value) : null;
  if (!m) return Number.NaN;
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number) as [number, number, number, number, number, number];
  const date = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  const real =
    date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d &&
    h <= 23 && mi <= 59 && s <= 59;
  return real ? date.getTime() : Number.NaN;
}

const isId = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '';

const UNVERIFIED = { ok: false, message: 'time_domain_unverified' } as const;
const MISMATCH = { ok: false, message: 'time_domain_mismatch' } as const;

/**
 * Pure verdict. Untrusted input: the source's answer is re-checked here, so a malformed row cannot widen the
 * proof. A gap anywhere outranks a domain disagreement (the mock's order: unverified before mismatch).
 */
export function judgeTimeDomain(subjects: unknown, from: string, to: string): TimeDomainVerdict {
  const fromMs = wallClockMs(from);
  const toMs = wallClockMs(to);
  if (!(fromMs < toMs) || !Array.isArray(subjects) || subjects.length === 0) return UNVERIFIED;
  const domains = new Set<string>();
  let gap = false;
  for (const subject of subjects as unknown[]) {
    if (subject === null || typeof subject !== 'object') return UNVERIFIED;
    const { subjectId, windows } = subject as Partial<TimeDomainSubject>;
    if (!isId(subjectId) || !Array.isArray(windows)) return UNVERIFIED;
    const slices: { domain: string; start: number; end: number }[] = [];
    for (const window of windows as unknown[]) {
      if (window === null || typeof window !== 'object') return UNVERIFIED;
      const { timeDomainId, validFrom, validTo } = window as Partial<TimeDomainWindow>;
      const start = wallClockMs(validFrom);
      const end = wallClockMs(validTo);
      if (!isId(timeDomainId) || !(start < end)) return UNVERIFIED;
      const clipped = { domain: timeDomainId, start: Math.max(start, fromMs), end: Math.min(end, toMs) };
      if (clipped.start < clipped.end) slices.push(clipped);
    }
    slices.sort((a, b) => a.start - b.start || a.end - b.end);
    let cursor = fromMs;
    for (const slice of slices) {
      if (slice.start > cursor) break;
      domains.add(slice.domain);
      if (slice.end > cursor) cursor = slice.end;
    }
    if (cursor < toMs) gap = true;
  }
  if (gap) return UNVERIFIED;
  if (domains.size !== 1) return MISMATCH;
  const [timeDomainId = ''] = domains;
  return { ok: true, timeDomainId };
}
