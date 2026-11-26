import { Ban, Clock, Inbox, Maximize2, ServerCrash, SlidersHorizontal } from 'lucide-react';
import { isRecord, type ApiResponse } from '@ap/contracts';
import { errorGuidance, formatText, parseFixedEquipmentLimit, type useI18n } from '@ap/kernel';
import { COMPONENTS_MESSAGES } from '../messages';
import { emptyCauses, emptyOutcomeText } from './emptyCause';

export function outcomeIsBlocked(response: ApiResponse<unknown>) {
  return response.outcome === 'error' && errorGuidance(response.message).blocked;
}

/** Equipment evidence has its own grant check. Technical detail can retain only its known reason. */
export function outcomeDiagnostic({ recovery, message }: ApiResponse<unknown>): string | undefined {
  const guide = errorGuidance(message);
  if (guide.label === 'sharedOutcomeCannotAggregate') return guide.code ?? undefined;
  if (isRecord(recovery) && (Object.hasOwn(recovery, 'affectedEquipmentIds') || Object.hasOwn(recovery, 'authorizedEquipmentIds'))) {
    return undefined;
  }
  return message || undefined;
}

export function outcomeTone(response: ApiResponse<unknown>): 'neutral' | 'danger' | 'warning' {
  if ((response.outcome === 'error' && !outcomeIsBlocked(response)) || response.outcome === 'timeout') return 'danger';
  if (response.outcome === 'forbidden' || response.outcome === 'too_large') return 'warning';
  return 'neutral';
}

function fixedEquipmentGuidance({ outcome, message }: ApiResponse<unknown>, lang: ReturnType<typeof useI18n>['lang']) {
  const overage = parseFixedEquipmentLimit(message);
  if (!overage || overage.kind !== (outcome === 'too_large' ? 'selected' : 'remaining')) return undefined;
  const { kind, count, limit } = overage;
  const text = kind === 'selected' ? COMPONENTS_MESSAGES.outcomeFixedEquipmentLimit : COMPONENTS_MESSAGES.outcomeExcludeFixedEquipmentLimit;
  return formatText(text, lang, { count, limit });
}

export function outcomePresentation(response: ApiResponse<unknown>, { t, lang }: ReturnType<typeof useI18n>) {
  switch (response.outcome) {
    case 'empty': return { ...emptyOutcomeText(emptyCauses(response), t), label: t('sharedOutcomeEmpty'), Icon: Inbox };
    case 'forbidden': return { title: t('stateForbidden'), body: t('stateForbiddenBody'), label: t('sharedOutcomeForbidden'), Icon: Ban };
    case 'too_large': return { title: t('stateTooLarge'), body: fixedEquipmentGuidance(response, lang) ?? t('stateTooLargeBody'), label: t('sharedOutcomeTooLarge'), Icon: Maximize2 };
    case 'timeout': return { title: t('stateTimeout'), body: t('stateTimeoutBody'), label: t('sharedOutcomeTimeout'), Icon: Clock };
    case 'error': {
      const guide = errorGuidance(response.message);
      return {
        title: t(guide.blocked ? 'stateQueryBlocked' : 'stateError'),
        body: fixedEquipmentGuidance(response, lang) ?? `${t(guide.cause)} ${t(guide.action)}`,
        label: t(guide.label),
        Icon: guide.blocked ? SlidersHorizontal : ServerCrash,
      };
    }
    default: return null;
  }
}
