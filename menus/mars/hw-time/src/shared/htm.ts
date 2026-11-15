import { formatText } from '@ap/kernel';
import type { HtmJudgement } from '../endpoints';
import { HW_TIME_MESSAGES } from '../messages';

/**
 * How a server judgement is drawn (#1794). The shape matches the SDK `ChartStatus` of #2326 (`tone`, `label`, `reason?`), so a chart's
 * `pointStatus` / `HeatmapCell.status` can take it as is once that option lands. `over` is danger, `under` the weaker warning, a value that
 * cannot be judged is neutral, and a normal value carries no status (nothing to highlight).
 */
export type HtmStatusView = { tone: 'danger' | 'warning' | 'neutral'; label: string; reason?: string };

export function htmStatusView(judgement: Pick<HtmJudgement, 'status' | 'reason'> | null | undefined, lang: 'ko' | 'en'): HtmStatusView | undefined {
  if (!judgement || judgement.status === 'normal') return undefined;
  const t = (text: { ko: string; en: string }) => formatText(text, lang);
  if (judgement.status === 'over') return { tone: 'danger', label: t(HW_TIME_MESSAGES.htmStatusOver) };
  if (judgement.status === 'under') return { tone: 'warning', label: t(HW_TIME_MESSAGES.htmStatusUnder) };
  return judgement.reason === 'no-criteria'
    ? { tone: 'neutral', label: t(HW_TIME_MESSAGES.htmStatusNoCriteria), reason: t(HW_TIME_MESSAGES.htmReasonNoCriteria) }
    : { tone: 'neutral', label: t(HW_TIME_MESSAGES.htmStatusRecipeUnsplit), reason: t(HW_TIME_MESSAGES.htmReasonRecipeUnsplit) };
}

/** The status text of a table cell or a Motion table row: the label, `정상` for a normal value. */
export function htmStatusText(judgement: Pick<HtmJudgement, 'status' | 'reason'>, lang: 'ko' | 'en'): string {
  return htmStatusView(judgement, lang)?.label ?? formatText(HW_TIME_MESSAGES.htmStatusNormal, lang);
}
