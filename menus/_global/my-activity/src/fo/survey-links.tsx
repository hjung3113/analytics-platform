import { hostLinks } from './links';

export const SURVEY_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RESPOND = /^\/surveys\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/respond$/i;

/** The platform destination of a FeedbackOps survey path (query ignored), or null. */
export function surveyTarget(to: string): { menuId: string; params?: Record<string, string> } | null {
  const path = to.split(/[?#]/)[0]!;
  if (path === '/surveys/participate') return { menuId: 'surveys' };
  const surveyId = RESPOND.exec(path)?.[1];
  return surveyId === undefined ? null : { menuId: 'survey-respond', params: { surveyId } };
}

/** The only FeedbackOps targets with a platform destination (ADR-0071 decision 10, amended). */
export const { canLink: canSurveyLink, Link: SurveyLink } = hostLinks(surveyTarget);
