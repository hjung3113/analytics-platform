import { formatInstant, type InstantForm, type Trust } from '@ap/contracts';
import { formatText } from '@ap/kernel';
import { COMPONENTS_MESSAGES } from '../messages';

type Lang = 'ko' | 'en';

/** The text pieces a chart frame's Trust footer shows (`source`, `updated`, `coverage`). */
export type TrustFooterText = { source: string; updated: string; coverage: string };

const DASH = '—';

/** The one wording for an unknown coverage (06 §18): header indicator and chart footer say the same thing. */
export const unknownCoverageText = (lang: Lang): string => formatText(COMPONENTS_MESSAGES.trustNotConfirmed, lang);

/**
 * A Trust instant (`updatedAt`, `dataThrough`, `observedAt` — offset ISO-8601, contract-schemas `instant`) in the
 * viewer's time zone through `formatInstant`, never string slicing (kernel.md «실제 시점은 wall-clock이 아니다»).
 * `null`/absent or a value that is not an offset instant reads 「—」: one bad server value must not crash a screen.
 */
export function trustInstantText(value: string | null | undefined, lang: Lang, form: InstantForm = 'monthDayMinute', timeZone?: string): string {
  if (!value) return DASH;
  try {
    return formatInstant(value, lang, timeZone, form);
  } catch {
    return DASH;
  }
}

/** Coverage ratio as `NN.N%`; `null` is the unknown-coverage wording. */
export function trustCoverageText(coverage: number | null, lang: Lang): string {
  return coverage === null ? unknownCoverageText(lang) : `${(coverage * 100).toFixed(1)}%`;
}

/** A contracts `Trust` → the chart footer pieces (short `MM-DD HH:mm` update time in the viewer's zone). */
export function trustFooterText(trust: Trust, lang: Lang, timeZone?: string): TrustFooterText {
  return { source: trust.source, updated: trustInstantText(trust.updatedAt, lang, 'monthDayMinute', timeZone), coverage: trustCoverageText(trust.coverage, lang) };
}

/**
 * What a chart frame's `trust` prop accepts (06 §16 trust footer):
 * - a contracts `Trust` (the response's `trust`) — formatted here, the same way as `DataTrustIndicator`;
 * - `null` — the response carried no Trust: no footer;
 * - the already formatted text triple `{ source, updated, coverage }` — shown as given (kept for existing callers).
 */
export type ChartTrust = TrustFooterText | Trust | null;

/** Footer text for a `ChartTrust`; `undefined`/`null` → no footer. A `Trust` is told apart by `updatedAt`, a key the text triple never has. */
export function chartTrustText(trust: ChartTrust | undefined, lang: Lang): TrustFooterText | undefined {
  if (!trust) return undefined;
  return 'updatedAt' in trust ? trustFooterText(trust, lang) : trust;
}
