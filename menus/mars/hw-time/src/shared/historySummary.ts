import type { MenuMeta, Pair, Text } from '@ap/contracts';
import { formatText } from '@ap/kernel';
import { verdictCodec } from '../endpoints';
import { HW_TIME_MESSAGES, HW_TIME_NEW_PANEL_MESSAGES } from '../messages';
import { TREND_RANGE_OUTPUT } from '../panels';
import { equipmentDaysAvailable, HW_TIME_FILTER_KEYS, HW_TIME_FILTER_NONE } from './useHwTimeFilter';

export const MOTION_BASIS_KEY = 'motionBasis';
export const DAY_BASIS_ID = 'day';

/** Drill steps of the HW Time screen (06 §6.4): Module type → Motion → Module. */
export const HW_TIME_DRILL = { levels: [
  { key: 'moduleType', label: { ko: 'Module 타입', en: 'Module type' } },
  { key: 'drillMotion', label: { ko: 'Motion', en: 'Motion' }, basisKey: MOTION_BASIS_KEY,
    bases: [{ id: DAY_BASIS_ID, label: (lang: keyof Text) => HW_TIME_NEW_PANEL_MESSAGES.dayBasis[lang] }] },
  { key: 'drillModule', label: { ko: 'Module', en: 'Module' } },
], isBasisAvailable: (_key, id, _context, _can, page) => {
  if (id !== DAY_BASIS_ID) return true;
  const value = (key: string) => page.find(([name]) => name === key)?.[1];
  return equipmentDaysAvailable({ moduleType: value('moduleType'), drillMotion: value('drillMotion') }, page);
}, resetKeys: ['focus', 'trend', TREND_RANGE_OUTPUT.key] } satisfies NonNullable<MenuMeta['drill']>;

type SummaryItem = { key: string; label: string; value: string };

/**
 * The page values a query-history row shows after the drill steps the SDK adds (#2691, #2770): checked Module/Motion, verdict and date. Pure over the candidate's
 * page, so two rows that restore different screens read differently. Defaults (no key = every value) add nothing; values stay raw
 * when the screen does not know them, never corrected.
 */
export function hwTimeHistorySummary(page: readonly Pair[], lang: 'ko' | 'en'): SummaryItem[] {
  const values = (key: string) => page.filter(([k]) => k === key).map(([, value]) => value);
  const items: SummaryItem[] = [];
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
