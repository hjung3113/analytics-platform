import type { ApiResponse, Assessment } from '@ap/contracts';
import type { useI18n } from '@ap/kernel';

type Translate = ReturnType<typeof useI18n>['t'];

const CAUSE_KEY = {
  collection: 'stateEmptyCauseCollection',
  processing_delay: 'stateEmptyCauseProcessingDelay',
  coverage: 'stateEmptyCauseCoverage',
  time_domain: 'stateEmptyCauseTimeDomain',
  respondent_history: 'stateEmptyCauseRespondentHistory',
} as const satisfies Record<Assessment['kind'], string>;

/** The findings the source confirmed as the cause of a zero-row result (06 §19 `explainsEmpty`). Several confirmed causes are all kept. */
export function emptyCauses(response: Pick<ApiResponse<unknown>, 'assessments'>): Assessment[] {
  return response.assessments.filter(a => a.explainsEmpty && a.state === 'confirmed');
}

/**
 * Title and body of an `outcome=empty` result. Without a confirmed cause this is the plain "no matching result";
 * with one the title names the cause by kind and the body is the finding's own `detail`, or a default sentence when it has none (0건 ≠ 미수집).
 */
export function emptyOutcomeText(causes: readonly Assessment[], t: Translate): { title: string; body: string } {
  if (!causes.length) return { title: t('stateEmpty'), body: t('stateEmptyBody') };
  const kinds = [...new Set(causes.map(a => a.kind))];
  const title = kinds.map(kind => t(CAUSE_KEY[kind])).join(' · ');
  const details = causes.map(a => a.detail).filter((detail): detail is string => !!detail);
  return { title, body: details.length ? details.join(' · ') : t('stateEmptyCauseBody', { cause: title }) };
}
