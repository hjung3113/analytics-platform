import { PlatformLink, usePlatform } from '@ap/kernel';
import type { HostLinkProps } from '@fops/frontend/global-screens';
import { UnlinkedLink } from './FoBridge';

export const SURVEY_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RESPOND = /^\/surveys\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/respond$/i;

/** The platform destination of a FeedbackOps survey path (query ignored), or null. */
export function surveyTarget(to: string): { menuId: string; params?: Record<string, string> } | null {
  const path = to.split(/[?#]/)[0]!;
  if (path === '/surveys/participate') return { menuId: 'surveys' };
  const surveyId = RESPOND.exec(path)?.[1];
  return surveyId === undefined ? null : { menuId: 'survey-respond', params: { surveyId } };
}

export const canSurveyLink = (to: string) => surveyTarget(to) !== null;

/** The only FeedbackOps targets with a platform destination (ADR-0071 decision 10, amended). `returnTo` lands only where the destination declares it. */
export function SurveyLink({ to, children, ...rest }: HostLinkProps) {
  const { linkTo } = usePlatform();
  const target = surveyTarget(to);
  if (target === null) return <UnlinkedLink to={to} {...rest}>{children}</UnlinkedLink>;
  return <PlatformLink href={linkTo(target.menuId, { params: target.params, returnTo: true })} {...rest}>{children}</PlatformLink>;
}
