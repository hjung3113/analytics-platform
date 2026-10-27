import { useCallback } from 'react';
import type { ComponentProps } from 'react';
import { usePlatform, type PageProps } from '@ap/kernel';
import { FoDetailDrawer, surveyFollowUpRoute, useSurveyFollowUpHere, useSurveyFollowUpSearch } from '@ap/fo-bridge';
import { SurveyFollowUpScreen } from '@fops/frontend/operator-screens/survey-follow-up';
import { SurveyChildPage } from './SurveyChildPage';

/** The review owns the selected response and its close (`focus` is its `selectedId`), so the drawer's close is `requestClose`. */
const renderDetail: NonNullable<ComponentProps<typeof SurveyFollowUpScreen>['renderDetail']> = parts => <FoDetailDrawer parts={parts} onClose={parts.requestClose} />;

/**
 * Survey 후속 조치 (ADR-0081, #764 p1), hidden under Survey 관리: the review's selection is controlled by the page key `focus` (a response id, a UUID) — nothing auto-selects.
 * Dropping an unknown selection replaces the history entry, so Back is not trapped on it.
 */
export default function FoSurveyFollowUp({ params }: PageProps) {
  const { pageParam, setPage } = usePlatform();
  const selectedId = pageParam('focus');
  const onSelect = useCallback((id: string | null) => { setPage({ focus: id }, id === null ? { replace: true } : undefined); }, [setPage]);
  return <SurveyChildPage surveyId={params.surveyId!} route={surveyFollowUpRoute} useSearch={useSurveyFollowUpSearch} useHere={useSurveyFollowUpHere}>
    {({ surveyId }) => <SurveyFollowUpScreen surveyId={surveyId} selection={{ selectedId, onSelect }} renderDetail={renderDetail} />}
  </SurveyChildPage>;
}
