import { hostLinks } from './links';
import { UUID_PATTERN, isUuid } from './uuid';

export const SURVEY_ID = UUID_PATTERN;
const RESPOND = /^\/surveys\/([^/]+)\/respond$/i;

/** The platform destination of a feature survey path (query ignored), or null. */
export function surveyTarget(to: string): { menuId: string; params?: Record<string, string> } | null {
  const path = to.split(/[?#]/)[0]!;
  if (path === '/surveys/participate') return { menuId: 'surveys' };
  const surveyId = RESPOND.exec(path)?.[1];
  return surveyId === undefined || !isUuid(surveyId) ? null : { menuId: 'survey-respond', params: { surveyId } };
}

/** The only feature targets with a platform destination (ADR-0071 decision 10, amended). */
export const { canLink: canSurveyLink, Link: SurveyLink } = hostLinks(surveyTarget);
