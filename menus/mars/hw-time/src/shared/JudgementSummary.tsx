import { useI18n, useMessages } from '@ap/kernel';
import type { HtmJudgement, HtmStatus, HwTimeBlock } from '../endpoints';
import { HTM_STATUSES } from '../endpoints';
import { HW_TIME_MESSAGES } from '../messages';
import { htmStatusText, htmStatusView } from './htm';
const PRIORITY: Record<HtmStatus, number> = { over: 3, under: 2, normal: 1, unjudgeable: 0 };
/** Presentation order only: status and bounds are the server's; the UI never judges a value. */
export function worstJudgement(judgements: Record<string, HtmJudgement> | undefined): HtmJudgement | undefined {
  return Object.values(judgements ?? {}).reduce<HtmJudgement | undefined>((worst, item) => !worst || PRIORITY[item.status] > PRIORITY[worst.status] ? item : worst, undefined);
}
export function JudgementSummary({ block }: { block: HwTimeBlock }) {
  const m = useMessages(HW_TIME_MESSAGES);
  const { lang } = useI18n();
  const cells = block.rows.filter(row => !row.auxiliary).flatMap(row => Object.values(row.judgements ?? {}));
  if (cells.length === 0) return null;
  const allUnjudgeable = cells.every(cell => cell.status === 'unjudgeable');
  const reasons = [...new Set(cells.map(cell => {
    const status = htmStatusView(cell, lang);
    return status?.reason ? `${status.label} — ${status.reason}` : htmStatusText(cell, lang);
  }))];
  const summary = allUnjudgeable ? reasons.join(' · ') : HTM_STATUSES.flatMap(status => {
    const count = cells.filter(cell => cell.status === status).length;
    return count === 0 ? [] : [m('judgementCount', { label: htmStatusText({ status }, lang), count: String(count) })];
  }).join(' · ');
  return <p className="shrink-0 text-xs text-text-secondary" role="status">{m('judgementSummary', { summary })}</p>;
}
