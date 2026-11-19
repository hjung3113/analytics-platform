import { fetchEntityLinksByTarget } from '../../../lib/api/entity-links';
import { SURVEY_OUTCOME_LINK_COPY as OUTCOME_LINK_COPY } from '../../../lib/copy/survey-builder';
import { SURVEY_STATUS_LABELS, SURVEY_TYPE_LABELS } from '../../../lib/copy/enum-labels';
import { HostLink, useHostSeam } from '../../../lib/host/host-seam';
import { searchHref } from '../../../lib/host/search';
import { useQuery } from '@tanstack/react-query';

export function TaskOutcomeSurveysSection({
  taskId,
  managedSystemId,
}: {
  taskId: string;
  managedSystemId: string;
}) {
  const { canLink } = useHostSeam();
  const links = useQuery({
    queryKey: ['entity-links', 'target', 'task', managedSystemId, taskId],
    queryFn: ({ signal }) => fetchEntityLinksByTarget('task', taskId, { signal }),
    retry: false,
  });
  const surveys = (links.data?.items ?? []).flatMap((link) =>
    link.visibility_state === 'allowed' &&
    link.source_type === 'survey' &&
    link.target_type === 'task' &&
    link.relation_type === 'measures_outcome_of' &&
    link.status === 'active' &&
    link.source_summary?.type === 'survey'
      ? [link.source_summary]
      : [],
  );
  if (links.isPending)
    return <output className="mt-4 text-xs text-text-muted">{OUTCOME_LINK_COPY.surveysLoading}</output>;
  if (links.isError)
    return (
      <p role="alert" className="mt-4 text-xs text-text-danger">
        {OUTCOME_LINK_COPY.surveysLoadError}
      </p>
    );
  if (surveys.length === 0) return null;

  return (
    <section className="mt-4 border-t border-border-subtle pt-4">
      <h3 className="text-sm font-medium">{OUTCOME_LINK_COPY.surveysHeading}</h3>
      <ul className="mt-2 space-y-2">
        {surveys.map((survey) => {
          const href = searchHref('/surveys', { selected: survey.id });
          return (
            <li key={survey.id} className="text-sm">
              {canLink(href) ? (
                <HostLink to={href} className="font-medium text-text-primary hover:underline">
                  {survey.display_id} · {survey.title}
                </HostLink>
              ) : (
                <span className="font-medium text-text-primary">
                  {survey.display_id} · {survey.title}
                </span>
              )}
              <p className="text-xs text-text-muted">
                {SURVEY_TYPE_LABELS[survey.survey_type]} · {SURVEY_STATUS_LABELS[survey.status]}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
