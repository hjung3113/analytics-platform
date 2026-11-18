// Step 7 of the `menuQuery` judgment (real-server-checklist §3, kernel §6.3, ADR-0172): may this request put several
// equipment on one wall-clock axis? The core owns the judgment; the deployment owns the proof.
//
// The proof is the deployment's Site-wide guarantee (bundle `timeDomainAssertions`): every equipment of a Site
// records in one wall-clock domain over `[validFrom, validTo)`. The rows are validated once at startup and held as
// data, so step 7 reads no source and awaits nothing. Only the requested Site's own rows can prove a request.
// Clock drift of a single tool is source data quality, not judged here.
//
// Verdict over the requested Site's windows (half-open, naive wall-clock seconds):
// - the windows must cover `[from, to)` without a gap; abutting windows of the same domain stitch;
// - every covering window must name one `timeDomainId` (a Site that changed its basis mid-request is a mismatch);
// - no window, or a gap anywhere, is `time_domain_unverified` and outranks a mismatch.

/** One window of a Site's guarantee: its records are in `timeDomainId` over `[validFrom, validTo)`. */
export interface TimeDomainWindow {
  timeDomainId: string;
  validFrom: string;
  validTo: string;
}

/** A deployment-owned Site-wide guarantee (bundle `timeDomainAssertions`). */
export interface SiteTimeDomainAssertion extends TimeDomainWindow {
  site: string;
}

/** Validated guarantees by Site, built once at startup. */
export type SiteTimeDomains = ReadonlyMap<string, readonly TimeDomainWindow[]>;

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
const ASSERTION_KEYS = new Set(['site', 'timeDomainId', 'validFrom', 'validTo']);

/**
 * Startup problems of Site-wide guarantees (file and programmatic input alike): keys other than the four, blank ids, bounds that are not second-aligned calendar times (declared
 * config, so a finer bound is refused rather than rounded), non-increasing windows, a Site outside `knownSite`, and
 * two windows of one Site that overlap (a contradiction, or a duplicate that hides one). Abutting windows are fine,
 * also of different domains: a Site that changed its clock basis keeps both rows, and a request across the change
 * is a mismatch.
 */
export function siteTimeDomainProblems(rows: readonly SiteTimeDomainAssertion[], knownSite?: (site: string) => boolean): string[] {
  const problems: string[] = [];
  const bySite = new Map<string, { start: number; end: number }[]>();
  rows.forEach((row, index) => {
    const at = `timeDomainAssertions.${index}`;
    const start = wallClockMs(row.validFrom);
    const end = wallClockMs(row.validTo);
    // A row naming more (an equipment, say) is not a Site-wide guarantee: refused, never widened to the Site.
    const unknown = Object.keys(row).filter((key) => !ASSERTION_KEYS.has(key));
    if (unknown.length > 0) problems.push(`${at}: unknown keys ${unknown.join(', ')} (a guarantee covers the whole Site)`);
    if (!isId(row.site) || !isId(row.timeDomainId)) problems.push(`${at}: site and timeDomainId must be non-blank`);
    if (Number.isNaN(start) || Number.isNaN(end)) problems.push(`${at}: validFrom and validTo must be YYYY-MM-DDTHH:mm:ss calendar times`);
    else if (!(start < end)) problems.push(`${at}: validFrom must be before validTo`);
    else if (isId(row.site)) bySite.set(row.site, [...(bySite.get(row.site) ?? []), { start, end }]);
    if (isId(row.site) && knownSite && !knownSite(row.site)) problems.push(`${at}: site ${row.site} is not in the scopeCatalog`);
  });
  for (const [site, windows] of bySite) {
    windows.sort((a, b) => a.start - b.start);
    for (let i = 1; i < windows.length; i += 1) {
      const previous = windows[i - 1];
      const current = windows[i];
      if (previous && current && current.start < previous.end) problems.push(`timeDomainAssertions: site ${site} has overlapping windows`);
    }
  }
  return problems;
}

/** Groups validated rows by Site (copies; the caller's array is not kept). Call after `siteTimeDomainProblems` is empty. */
export function siteTimeDomainsOf(rows: readonly SiteTimeDomainAssertion[]): SiteTimeDomains {
  const bySite = new Map<string, TimeDomainWindow[]>();
  for (const { site, timeDomainId, validFrom, validTo } of rows) {
    bySite.set(site, [...(bySite.get(site) ?? []), { timeDomainId, validFrom, validTo }]);
  }
  return bySite;
}

/** Pure verdict for one Site's windows over the request period. A non-increasing or non-calendar period is unverified. */
export function judgeTimeDomain(windows: readonly TimeDomainWindow[], from: string, to: string): TimeDomainVerdict {
  const fromMs = wallClockMs(from);
  const toMs = wallClockMs(to);
  if (!(fromMs < toMs)) return { ok: false, message: 'time_domain_unverified' };
  const slices = windows
    .map((window) => ({
      domain: window.timeDomainId,
      start: Math.max(wallClockMs(window.validFrom), fromMs),
      end: Math.min(wallClockMs(window.validTo), toMs),
    }))
    .filter((slice) => slice.start < slice.end)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const domains = new Set<string>();
  let cursor = fromMs;
  for (const slice of slices) {
    if (slice.start > cursor) break;
    domains.add(slice.domain);
    if (slice.end > cursor) cursor = slice.end;
  }
  if (cursor < toMs) return { ok: false, message: 'time_domain_unverified' };
  const [timeDomainId] = domains;
  if (domains.size !== 1 || timeDomainId === undefined) return { ok: false, message: 'time_domain_mismatch' };
  return { ok: true, timeDomainId };
}
