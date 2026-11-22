import type { Pair } from '@ap/contracts';
import { formatText } from '@ap/kernel';
import { verdictCodec } from '../endpoints';
import { HW_TIME_MESSAGES, HW_TIME_NEW_PANEL_MESSAGES } from '../messages';
import { HW_TIME_FILTER_KEYS, HW_TIME_FILTER_NONE } from './useHwTimeFilter';

/** Drill steps of the HW Time screen (06 §6.4): Module type → Motion → Module. */
export const HW_TIME_DRILL = { levels: [
  { key: 'moduleType', label: { ko: 'Module 타입', en: 'Module type' } },
  { key: 'drillMotion', label: { ko: 'Motion', en: 'Motion' } },
  { key: 'drillModule', label: { ko: 'Module', en: 'Module' } },
], resetKeys: ['focus', 'trend'] };

type SummaryItem = { key: string; label: string; value: string };

/**
 * The page values a query-history row shows (#2691): drill steps, checked Module/Motion, verdict and date. Pure over the candidate's
 * page, so two rows that restore different screens read differently. Defaults (no key = every value) add nothing; values stay raw
 * when the screen does not know them, never corrected.
 */
export function hwTimeHistorySummary(page: readonly Pair[], lang: 'ko' | 'en'): SummaryItem[] {
  const values = (key: string) => page.filter(([k]) => k === key).map(([, value]) => value);
  const items: SummaryItem[] = [];
  for (const level of HW_TIME_DRILL.levels) {
    const value = values(level.key)[0];
    if (value) items.push({ key: level.key, label: level.label[lang], value });
  }
  for (const [key, label] of [[HW_TIME_FILTER_KEYS.module, HW_TIME_MESSAGES.filterModule], [HW_TIME_FILTER_KEYS.motion, HW_TIME_MESSAGES.filterMotion]] as const) {
    const selected = values(key);
    if (selected.length === 0) continue;
    const value = selected.length === 1 && selected[0] === HW_TIME_FILTER_NONE ? formatText(HW_TIME_MESSAGES.filterNoneSelected, lang) : selected.join(', ');
    items.push({ key, label: formatText(label, lang), value });
  }
  const verdict = values('verdict')[0];
  if (verdict) {
    const known = verdictCodec.decode(verdict);
    items.push({ key: 'verdict', label: formatText(HW_TIME_NEW_PANEL_MESSAGES.verdict, lang), value: known ? formatText(HW_TIME_NEW_PANEL_MESSAGES[known], lang) : verdict });
  }
  const date = values('date')[0];
  if (date) items.push({ key: 'date', label: formatText(HW_TIME_NEW_PANEL_MESSAGES.date, lang), value: date });
  return items;
}
