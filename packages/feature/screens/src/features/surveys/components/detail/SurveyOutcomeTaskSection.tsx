import { fetchEntityLinksBySource } from '../../../../lib/api/entity-links';
import { SURVEY_OUTCOME_LINK_COPY as OUTCOME_LINK_COPY } from '../../../../lib/copy/survey-builder';
import { HostLink, useHostSeam } from '../../../../lib/host/host-seam';
import { searchHref } from '../../../../lib/host/search';
import { useQuery } from '@tanstack/react-query';

export function SurveyOutcomeTaskSection({
  surveyId,
  managedSystemId,
}: {
  surveyId: string;
  managedSystemId: string;
}) {
  const { canLink } = useHostSeam();
  const links = useQuery({
    queryKey: ['entity-links', 'source', 'survey', managedSystemId, surveyId],
    queryFn: ({ signal }) => fetchEntityLinksBySource('survey', surveyId, { signal }),
    retry: false,
  });
  const outcomeLink = (links.data?.items ?? []).find(
    (link) =>
      link.source_type === 'survey' &&
      link.target_type === 'task' &&
      link.relation_type === 'measures_outcome_of' &&
      link.status === 'active',
  );
  if (links.isPending)
    return (
      <section className="mt-6 px-5">
        <h2 className="mb-2 text-sm font-medium">{OUTCOME_LINK_COPY.taskHeading}</h2>
        <output className="text-xs text-text-muted">{OUTCOME_LINK_COPY.taskLoading}</output>
      </section>
    );
  if (links.isError)
    return (
      <section className="mt-6 px-5">
        <h2 className="mb-2 text-sm font-medium">{OUTCOME_LINK_COPY.taskHeading}</h2>
        <p role="alert" className="text-xs text-text-danger">
          {OUTCOME_LINK_COPY.taskLoadError}
        </p>
      </section>
    );

  const task =
    outcomeLink?.visibility_state === 'allowed' && outcomeLink.target_summary?.type === 'task'
      ? outcomeLink.target_summary
      : null;
  const hidden = outcomeLink?.visibility_state === 'hidden' || outcomeLink?.visibility_state === 'denied';

  return (
    <section className="mt-6 px-5">
      <h2 className="mb-2 text-sm font-medium">{OUTCOME_LINK_COPY.taskHeading}</h2>
      {task && canLink(searchHref('/tasks', { view: 'backlog', param: task.id })) ? (
        <HostLink
          to={searchHref('/tasks', { view: 'backlog', param: task.id })}
          className="text-sm text-text-primary hover:underline"
        >
          {task.display_id} · {task.title}
        </HostLink>
      ) : task ? (
        <p className="text-sm text-text-primary">
          {task.display_id} · {task.title}
        </p>
      ) : hidden ? (
        <p className="text-sm text-text-muted">
          {OUTCOME_LINK_COPY.taskHidden}
        </p>
      ) : (
        <p className="text-sm text-text-muted">{OUTCOME_LINK_COPY.taskUnlinked}</p>
      )}
    </section>
  );
}
