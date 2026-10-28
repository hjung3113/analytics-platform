import { SearchX } from 'lucide-react';
import { useI18n, usePlatform, type PageProps } from '@ap/kernel';
import { PlatformPage, ReturnLink, StateMessage } from '@ap/components';
import { RespondSurveyScreen } from '@ap/feature-screens/global-screens';
import { FoBridge, canSurveyLink, SURVEY_ID, SurveyLink } from '@ap/feature-bridge';

/**
 * 설문 응답 (ADR-0070 decision 6, ADR-0071): one FeedbackOps respond form through the bridge. The survey ID is a path segment, so a
 * malformed one is not-found here and never becomes a FeedbackOps request path. After a submit the FeedbackOps success state stays and the
 * header offers the way back; the target is only ever the Kernel's `returnOrigin()` (`safeReturnTo`), never `returnTo` read here.
 */
export default function SurveyRespond({ params }: PageProps) {
  const { lang } = useI18n();
  const { pageParam } = usePlatform();
  const ko = lang === 'ko';
  const surveyId = params.surveyId!;
  if (!SURVEY_ID.test(surveyId)) {
    return <PlatformPage>
      <StateMessage icon={<SearchX className="size-4" aria-hidden />}
        title={ko ? '설문을 찾을 수 없습니다' : 'Survey not found'}
        body={ko ? '주소의 설문 ID가 올바르지 않습니다.' : 'The survey ID in the address is not valid.'} />
    </PlatformPage>;
  }
  return <PlatformPage secondaryActions={pageParam('returnTo') !== null ? <ReturnLink /> : undefined}>
    <FoBridge canLink={canSurveyLink} Link={SurveyLink}><RespondSurveyScreen surveyId={surveyId} variant="embedded" /></FoBridge>
  </PlatformPage>;
}
