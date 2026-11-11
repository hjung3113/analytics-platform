import type { OccurrenceBatch } from './schema.js';
import {
  validateSampleWindow,
  type ImportIssue, type ImportRejectCode, type ImportWarningCode, type SampleWindowRef, type SampleWindowSummary,
} from './window.js';

/** Issues with the stored windows rather than the file itself: the dev tool answers them 409. */
export const WINDOW_CONFLICT_CODES: ReadonlySet<ImportRejectCode> = new Set(['window-overlap', 'time-domain-mismatch']);

export type SampleWindowImportCheck =
  | {
    ok: true; batch: OccurrenceBatch; summary: SampleWindowSummary; warnings: ImportIssue<ImportWarningCode>[];
    /** The stored window with exactly this content (an import changes nothing), or null. */
    same: SampleWindowRef | null;
    /** With `sameRangeReplaces`: stored windows of exactly this range and another content (EV#105); empty otherwise. */
    replaces: SampleWindowRef[];
  }
  | {
    ok: false; issues: ImportIssue<ImportRejectCode>[]; warnings: ImportIssue<ImportWarningCode>[];
    summary?: Omit<SampleWindowSummary, 'name' | 'hash'>;
    /** Every issue is with the stored windows (`WINDOW_CONFLICT_CODES`). */
    conflict: boolean;
  };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
/** A refused window has no name or hash, like `validateSampleWindow`'s refusals. */
const unnamed = (summary: SampleWindowSummary): Omit<SampleWindowSummary, 'name' | 'hash'> => {
  const rest: Partial<SampleWindowSummary> = { ...summary };
  delete rest.name;
  delete rest.hash;
  return rest as Omit<SampleWindowSummary, 'name' | 'hash'>;
};

/**
 * The import verdict of one `*.batch.json` for an equipment (EV ADR-0010), shared by the EV dev tool and the 설비 온보딩 mock (#1658).
 * `validateSampleWindow` against the stored windows, plus whether the refusal is a conflict. With `sameRangeReplaces`, a stored window
 * of exactly the same range is a reprocessed Data Generation to stage (EV#105), not an overlap; it must still share the Time Domain.
 */
export async function checkSampleWindowImport(
  raw: unknown,
  ctx: { equipmentId: string; existing: SampleWindowRef[]; sameRangeReplaces?: boolean },
): Promise<SampleWindowImportCheck> {
  const from = isRecord(raw) ? raw.from : undefined;
  const to = isRecord(raw) ? raw.to : undefined;
  const sameRange = ctx.sameRangeReplaces ? ctx.existing.filter((ref) => ref.from === from && ref.to === to) : [];
  const result = await validateSampleWindow(raw, { equipmentId: ctx.equipmentId, existing: ctx.existing.filter((ref) => !sameRange.includes(ref)) });
  const issues = result.ok ? [] : [...result.issues];
  const timeDomain = result.summary?.timeDomain;
  const otherDomain = timeDomain === undefined ? undefined : sameRange.find((ref) => ref.timeDomain !== timeDomain);
  if (otherDomain && !issues.some(({ code }) => code === 'time-domain-mismatch')) {
    issues.push({
      code: 'time-domain-mismatch', path: ['timeDomain'],
      message: `timeDomain ${JSON.stringify(timeDomain)} differs from existing window [${otherDomain.from}, ${otherDomain.to}) (${JSON.stringify(otherDomain.timeDomain)})`,
    });
  }
  if (!result.ok || issues.length > 0) {
    const summary = result.ok ? unnamed(result.summary) : result.summary;
    return {
      ok: false, issues, warnings: result.warnings, ...(summary === undefined ? {} : { summary }),
      conflict: issues.length > 0 && issues.every(({ code }) => WINDOW_CONFLICT_CODES.has(code)),
    };
  }
  const { hash } = result.summary;
  return { ...result, same: ctx.existing.find((ref) => ref.hash === hash) ?? null, replaces: sameRange.filter((ref) => ref.hash !== hash) };
}
