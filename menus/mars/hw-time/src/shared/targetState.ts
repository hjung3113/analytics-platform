import { formatText } from '@ap/kernel';
import { HW_TIME_MESSAGES } from '../messages';
/**
 * The Inspector `분석 대상` text while there are no counts to show: it follows the query the body shows, so the Inspector never says loading
 * next to a body that already says zero rows or a failure (#1158). Wording mirrors the body's states (kernel `stateEmpty`, `stateForbidden`, `stateTooLarge`, `stateError`).
 */
export function targetStateText(lang: 'ko' | 'en', outcome: string | undefined): string {
  if (outcome === undefined) return formatText(HW_TIME_MESSAGES.targetStateLoading, lang);
  if (outcome === 'empty') return formatText(HW_TIME_MESSAGES.targetStateNoMatchingResult, lang);
  if (outcome === 'forbidden') return formatText(HW_TIME_MESSAGES.targetStateYouDoNotHaveAccessToThis, lang);
  if (outcome === 'too_large') return formatText(HW_TIME_MESSAGES.targetStateQueryTooLargeNarrowTheConditions, lang);
  return formatText(HW_TIME_MESSAGES.targetStateUnableToLoadDataRetryInThe, lang);
}
