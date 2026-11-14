import { formatWallClock } from '@ap/contracts';
/**
 * One display text for the cycle-time bucket and histogram (분포 구간) filters (#1218 FORMAT): the
 * chip row, the query-bar summary (`summaryFor`) and the XLSX 조회 정보 sheet all print these, so
 * the same condition cannot appear in several shapes. Wall-clock digits only (06 §6.3) — contracts
 * helpers, no `Date`, no time-zone shift.
 */
import { bucketStart, parseDateTime } from '@ap/contracts';
import { bucketEnd, type Granularity } from './endpoints';

/**
 * The chip text for one bucket. hour grain prints the end as `HH:mm` while it stays on the from
 * side's day, otherwise as full date + time; day/week grains print dates only — the end is the
 * exclusive `bucketEnd`, shown as given. A raw value that is unparseable or not a bucket of `grain`
 * (the page refuses it, so no bucket-end meaning exists) is shown as the raw text, never corrected.
 * `lang` keeps the shared chip signature; the text is locale-neutral today.
 */
export function bucketText(raw: string, grain: Granularity, _lang: 'ko' | 'en'): string {
  try {
    parseDateTime(raw, 'bucket');
    if (bucketStart(raw, grain) !== raw) return raw;
  } catch {
    return raw;
  }
  const end = bucketEnd(raw, grain);
  if (grain === 'hour') {
    const to = end.slice(0, 10) === raw.slice(0, 10) ? end.slice(11, 16) : formatWallClock(end, 'minute');
    return `${formatWallClock(raw, 'minute')} → ${to}`;
  }
  return `${raw.slice(0, 10)} → ${end.slice(0, 10)}`;
}

/**
 * The chip text for one histogram bin: the ids exactly as the distribution chart axis shows them
 * (`xType="category"` renders consumer strings verbatim), `a – b` for an ordered range, `a` alone
 * for a single bin. `lang` keeps the shared chip signature; bin ids carry no number formatting.
 */
export function binText(bin: { from: string; to: string }, _lang: 'ko' | 'en'): string {
  return bin.from === bin.to ? bin.from : `${bin.from} – ${bin.to}`;
}
