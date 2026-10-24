import { InternalLink } from '@/lib/router/InternalLink';
import { Link, useRouter } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { AnswerableSurveysSection } from './AnswerableSurveysSection';

/** The router-bound panel for callers outside a host seam; the dashboard uses `AnswerableSurveysSection`. */
export function AnswerableSurveysPanel() {
  return <AnswerableSurveysSection SurveyLink={SurveyParticipationLink} />;
}

function SurveyParticipationLink({
  surveyId,
  className,
  children,
}: {
  surveyId?: string;
  className: string;
  children: ReactNode;
}) {
  const router = useRouter({ warn: false });
  const href = surveyId === undefined ? '/surveys/participate' : `/surveys/${surveyId}/respond`;

  if (!router)
    return (
      <InternalLink className={className} href={href}>
        {children}
      </InternalLink>
    );
  if (surveyId === undefined) {
    return (
      <Link to="/surveys/participate" className={className}>
        {children}
      </Link>
    );
  }
  return (
    <Link to="/surveys/$surveyId/respond" params={{ surveyId }} className={className}>
      {children}
    </Link>
  );
}
