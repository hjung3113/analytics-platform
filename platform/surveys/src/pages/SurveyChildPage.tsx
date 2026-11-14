import { useMessages, usePlatform } from '@ap/kernel';
import { SURVEYS_MESSAGES } from '../messages';
import type { ReactNode } from 'react';
import { SearchX } from 'lucide-react';
import { PlatformPage, StateMessage } from '@ap/components';
import { FeatureScreenPage, UUID_PATTERN, type OperatorRoute } from '@ap/feature-bridge';
import { isSurveyDetailSearchValueValid } from '@ap/feature-screens/operator-screens/surveys-search';

/** The list-context page keys the children carry back to the list (`managedSystem` rides on the space). */
const LIST_CONTEXT_KEYS = ['area', 'status', 'follow_up'] as const;

/**
 * The shell of the three hidden Survey screens: the `:surveyId` path param must be a UUID (anything else is not-found here and never reaches a request), then the
 * address check of the child's route table (list-context keys through the feature screens' detail search schema), then the screen. `children` gets the survey id and the
 * way back to the list (`focus` = this Survey; the other list-context keys ride along as the carried page).
 */
export function SurveyChildPage({ surveyId, route, useSearch, useHere, children }: {
  surveyId: string; route: OperatorRoute; useSearch: () => Readonly<Record<string, string>>; useHere: () => string;
  children: (args: { surveyId: string; backToList: () => void }) => ReactNode;
}) {
  const m = useMessages(SURVEYS_MESSAGES);
  const { navigate, linkTo, pageParam } = usePlatform();
  if (!UUID_PATTERN.test(surveyId)) {
    return <PlatformPage>
      <StateMessage icon={<SearchX className="size-4" aria-hidden />}
        title={m('surveyChildPageSurveyNotFound')}
        body={m('surveyChildPageTheSurveyIDInTheAddressIs')} />
    </PlatformPage>;
  }
  const backToList = () => {
    const page: Record<string, string> = { focus: surveyId };
    for (const key of LIST_CONTEXT_KEYS) { const value = pageParam(key); if (value !== null) page[key] = value; }
    navigate(linkTo('survey-management', { page }));
  };
  return <FeatureScreenPage route={route} isValid={isSurveyDetailSearchValueValid} useSearch={useSearch} useHere={useHere}>
    {children({ surveyId, backToList })}
  </FeatureScreenPage>;
}
