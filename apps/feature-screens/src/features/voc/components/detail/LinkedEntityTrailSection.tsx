import { TASK_REQUEST_STATUS_LABELS, TASK_STATUS_LABELS } from '@/lib/copy/enum-labels';
import { GLOSSARY } from '@/lib/copy/glossary';
import { VOC_FOLLOW_UP_COPY } from '@/lib/copy/voc';
import { formatDateOnly, formatRelativeTime } from '@/lib/format/datetime';
import type {
  EntityLinkDto,
  EntityLinkTargetSummary,
  TaskReporterSummary,
  TaskRequestStatus,
  TaskStatus,
  VocDetailEnvelope,
} from '@ap/feature-shared';
import { type EntityNodeRef, LinkedEntityTrail, OutlineBadge } from '@ap/feature-ui';
import { PanelSectionTitle, PermissionBlockedPanel } from '@ap/ui';
import type * as React from 'react';

export interface LinkedEntityTrailSectionProps {
  /** Backend-decided link DTOs included with the VOC detail read model. */
  links?: EntityLinkDto[];
  trails?: NonNullable<VocDetailEnvelope['linked_execution']['trails']> | undefined;
  onOpenCluster?: ((id: string) => void) | undefined;
  onOpenRequest?: ((id: string) => void) | undefined;
  /** A Reporter may consume only summary_visible.summary, never an allowed Task DTO. */
  isReporterContext: boolean;
  /**
   * Opens the linked Task. Injected rather than taken from `useNavigate` so this
   * stays a presentational component its tests can render without a router.
   * Omitted means the trail renders as plain text, which is the correct
   * fallback for any surface with nowhere to send the actor.
   */
  onOpenTask?: ((taskId: string) => void) | undefined;
  /** Opens the linked Finding; same plain-text fallback rule as `onOpenTask` (#1174b). */
  onOpenFinding?: ((findingId: string) => void) | undefined;
  /**
   * Whether the host can take the actor to this one destination (ADR-0071 d10). Asked per node with its own id, so a
   * node the host cannot link renders as text while its siblings stay controls. Absent means every node is linkable.
   */
  canOpen?: ((kind: TrailOpenKind, id: string) => boolean) | undefined;
}

export type TrailOpenKind = 'task' | 'finding' | 'cluster' | 'task_request';

function isTaskLink(link: EntityLinkDto): boolean {
  return link.source_type === 'task' || link.target_type === 'task';
}

function isFindingLink(link: EntityLinkDto): boolean {
  return link.source_type === 'finding' || link.target_type === 'finding';
}

function ReporterTaskSummary({
  summary,
}: {
  summary: TaskReporterSummary;
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-2" data-testid="linked-task-summary">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-text-primary">{summary.public_title}</span>
        <OutlineBadge>{summary.reporter_facing_status}</OutlineBadge>
      </div>
      {(summary.owning_team_public_name !== undefined ||
        summary.expected_resolution_date !== undefined ||
        summary.last_public_update_at !== undefined ||
        summary.public_update_excerpt !== undefined) && (
        <dl className="flex flex-col gap-1 text-xs text-text-secondary">
          {summary.owning_team_public_name !== undefined && (
            <div className="flex gap-2">
              <dt>담당 팀</dt>
              <dd>{summary.owning_team_public_name}</dd>
            </div>
          )}
          {summary.expected_resolution_date !== undefined && (
            <div className="flex gap-2">
              <dt>예상 해결일</dt>
              <dd>{formatDateOnly(summary.expected_resolution_date)}</dd>
            </div>
          )}
          {summary.last_public_update_at !== undefined && (
            <div className="flex gap-2">
              <dt>최근 공개 업데이트</dt>
              <dd>{formatRelativeTime(summary.last_public_update_at)}</dd>
            </div>
          )}
          {summary.public_update_excerpt !== undefined && <dd>{summary.public_update_excerpt}</dd>}
        </dl>
      )}
    </div>
  );
}

function SafeTaskLink({
  state,
}: {
  state: 'denied';
}): React.ReactElement {
  // ADR-0023 §A/§E: denied may acknowledge only a safe category.
  return (
    <div data-testid={`linked-task-${state}`}>
      <PermissionBlockedPanel state="denied" category="연결된 Task" />
    </div>
  );
}

function AllowedTaskLink({
  link,
  isReporterContext,
  onOpenTask,
  canOpen,
}: {
  link: Extract<EntityLinkDto, { visibility_state: 'allowed' }>;
  isReporterContext: boolean;
  onOpenTask?: ((taskId: string) => void) | undefined;
  canOpen?: LinkedEntityTrailSectionProps['canOpen'];
}): React.ReactElement | null {
  if (isReporterContext) return null;

  const task = link.target_summary?.type === 'task' ? link.target_summary : null;
  if (task === null) return null;

  const openTask = onOpenTask && (canOpen?.('task', task.id) ?? true) ? onOpenTask : undefined;
  return (
    <div data-testid="linked-task-allowed">
      <LinkedEntityTrail
        iconTone="quiet"
        nodes={[
          {
            type: 'task',
            id: task.id,
            display_id: task.display_id,
            title: task.title,
            // Shared English workflow label (ADR-0057 A2); a target_summary status
            // is an unparsed string, so fall back to it only if it leaves the enum.
            meta: TASK_STATUS_LABELS[task.status as TaskStatus] ?? task.status,
            // `allowed` already means the backend decided this actor may read
            // the Task, so naming it without a way there is a dead end. Only
            // this state gets a destination — summary_visible and denied must
            // stay unnavigable (ADR-0023 §A/§E), and Reporter context returned
            // above before reaching here.
            ...(openTask ? { onNavigate: () => openTask(task.id) } : {}),
          },
        ]}
      />
    </div>
  );
}

function TaskLink({
  link,
  isReporterContext,
  onOpenTask,
  canOpen,
}: {
  link: EntityLinkDto;
  isReporterContext: boolean;
  onOpenTask?: ((taskId: string) => void) | undefined;
  canOpen?: LinkedEntityTrailSectionProps['canOpen'];
}): React.ReactElement | null {
  switch (link.visibility_state) {
    case 'summary_visible':
      // FR-LINK-002: render only this backend-provided payload; never synthesize a summary.
      return (
        <PermissionBlockedPanel
          state="summary_visible"
          category="연결된 Task"
          summary={<ReporterTaskSummary summary={link.summary} />}
        />
      );
    case 'allowed':
      return (
        <AllowedTaskLink
          link={link}
          isReporterContext={isReporterContext}
          onOpenTask={onOpenTask}
          canOpen={canOpen}
        />
      );
    case 'hidden':
      // ADR-0023 §A: do not acknowledge that this link exists.
      return null;
    case 'denied':
      return <SafeTaskLink state="denied" />;
  }
}

function SafeFindingLink(): React.ReactElement {
  // ADR-0023 §A/§E: denied may acknowledge only a safe category.
  return (
    <div data-testid="linked-finding-denied">
      <PermissionBlockedPanel state="denied" category="연결된 Finding" />
    </div>
  );
}

function AllowedFindingLink({
  link,
  isReporterContext,
  onOpenFinding,
  canOpen,
}: {
  link: Extract<EntityLinkDto, { visibility_state: 'allowed' }>;
  isReporterContext: boolean;
  onOpenFinding?: ((findingId: string) => void) | undefined;
  canOpen?: LinkedEntityTrailSectionProps['canOpen'];
}): React.ReactElement | null {
  if (isReporterContext) return null;

  const finding = link.target_summary?.type === 'finding' ? link.target_summary : null;
  if (finding === null) return null;

  const openFinding =
    onOpenFinding && (canOpen?.('finding', finding.id) ?? true) ? onOpenFinding : undefined;
  return (
    <div data-testid="linked-finding-allowed">
      <LinkedEntityTrail
        iconTone="quiet"
        nodes={[
          {
            type: 'finding',
            id: finding.id,
            display_id: finding.display_id,
            title: finding.title,
            meta: finding.display_id,
            // `allowed` already means the backend decided this actor may read the
            // Finding, so naming it without a way there is a dead end. Only this
            // state gets a destination — summary_visible and denied must stay
            // unnavigable (ADR-0023 §A/§E, ADR-0024 §D), and Reporter context
            // returned above before reaching here.
            ...(openFinding ? { onNavigate: () => openFinding(finding.id) } : {}),
          },
        ]}
      />
    </div>
  );
}

function FindingLink({
  link,
  isReporterContext,
  onOpenFinding,
  canOpen,
}: {
  link: EntityLinkDto;
  isReporterContext: boolean;
  onOpenFinding?: ((findingId: string) => void) | undefined;
  canOpen?: LinkedEntityTrailSectionProps['canOpen'];
}): React.ReactElement | null {
  switch (link.visibility_state) {
    case 'summary_visible':
      // ADR-0024 §E: a Finding has no reporter summary, so this payload is
      // inconsistent — fail closed and conceal the row.
      return null;
    case 'allowed':
      return (
        <AllowedFindingLink
          link={link}
          isReporterContext={isReporterContext}
          onOpenFinding={onOpenFinding}
          canOpen={canOpen}
        />
      );
    case 'hidden':
      // ADR-0023 §A: do not acknowledge that this link exists.
      return null;
    case 'denied':
      return <SafeFindingLink />;
  }
}

/** Same disclosure rule for empty state, trail and CTA. Hidden data has no UI signal. */
export function hasVisibleFollowUp(voc: VocDetailEnvelope, isReporterContext: boolean): boolean {
  return [
    ...(voc.links ?? []),
    ...(voc.linked_execution.trails ?? []).flatMap((trail) => trail.links),
  ].some(
    (link) =>
      (isTaskLink(link) || isFindingLink(link) || link.target_type === 'task_request') &&
      (link.visibility_state === 'denied' ||
        (link.visibility_state === 'allowed' && !isReporterContext) ||
        (link.visibility_state === 'summary_visible' && isTaskLink(link) && !isFindingLink(link))),
  );
}

function FollowUpTrail({
  trail,
  onOpenTask,
  onOpenFinding,
  onOpenCluster,
  onOpenRequest,
  canOpen,
}: {
  trail: NonNullable<VocDetailEnvelope['linked_execution']['trails']>[number];
} & Pick<
  LinkedEntityTrailSectionProps,
  'onOpenTask' | 'onOpenFinding' | 'onOpenCluster' | 'onOpenRequest' | 'canOpen'
>): React.ReactElement {
  function node(summary: EntityLinkTargetSummary): EntityNodeRef {
    const kind: TrailOpenKind = summary.type === 'voc_cluster' ? 'cluster' : summary.type;
    const handler =
      summary.type === 'finding'
        ? onOpenFinding
        : summary.type === 'task'
          ? onOpenTask
          : summary.type === 'voc_cluster'
            ? onOpenCluster
            : onOpenRequest;
    const open = (canOpen?.(kind, summary.id) ?? true) ? handler : undefined;
    const title = summary.type === 'task_request' ? summary.requested_outcome : summary.title;
    return {
      type: summary.type === 'voc_cluster' ? 'cluster' : summary.type,
      id: summary.id,
      display_id: summary.display_id,
      title,
      meta:
        summary.type === 'finding'
          ? summary.display_id
          : summary.type === 'task'
            ? (TASK_STATUS_LABELS[summary.status as TaskStatus] ?? summary.status)
            : summary.type === 'task_request'
              ? (TASK_REQUEST_STATUS_LABELS[summary.status as TaskRequestStatus] ?? summary.status)
              : summary.status,
      ...(open ? { onNavigate: () => open(summary.id) } : {}),
    };
  }
  return (
    <div className="flex flex-col gap-2" data-testid="voc-follow-up-trail">
      {trail.links.length === 0 && trail.cluster && (
        <LinkedEntityTrail iconTone="quiet" nodes={[node(trail.cluster)]} />
      )}
      {trail.links.map((link) => {
        if (link.visibility_state === 'hidden') return null;
        if (link.visibility_state === 'summary_visible')
          return isTaskLink(link) && !isFindingLink(link) ? (
            <TaskLink key={link.id} link={link} isReporterContext={false} canOpen={canOpen} />
          ) : null;
        if (link.visibility_state === 'denied')
          return (
            <PermissionBlockedPanel
              key={link.id}
              state="denied"
              category={
                link.target_type === 'task_request'
                  ? VOC_FOLLOW_UP_COPY.linkedRequest
                  : link.target_type === 'finding'
                    ? GLOSSARY.linkedFinding
                    : GLOSSARY.linkedTask
              }
            />
          );
        const summaries = [link.source_summary, link.target_summary].filter(
          (summary) => summary !== undefined,
        );
        return (
          <section
            key={link.id}
            aria-label={`${link.source_summary?.display_id ?? ''} → ${link.target_summary?.display_id ?? ''}`}
          >
            <LinkedEntityTrail iconTone="quiet" nodes={summaries.map(node)} />
          </section>
        );
      })}
    </div>
  );
}

export function LinkedEntityTrailSection({
  links = [],
  trails = [],
  onOpenCluster,
  onOpenRequest,
  isReporterContext,
  onOpenTask,
  onOpenFinding,
  canOpen,
}: LinkedEntityTrailSectionProps): React.ReactElement {
  const visibleTrails = trails
    .map((trail) => ({
      ...trail,
      links: trail.links.filter(
        (link) =>
          link.visibility_state !== 'hidden' &&
          !(isReporterContext && link.visibility_state === 'allowed'),
      ),
    }))
    .filter(
      (trail) => trail.links.length > 0 || (!isReporterContext && trail.cluster !== undefined),
    );
  const projectedIds = new Set(
    visibleTrails.flatMap((trail) => trail.links.map((link) => link.id)),
  );
  // A Cluster trail carries its own link to the same Finding/Task (another link id), so de-dup by entity.
  const projectedEntities = new Set(
    visibleTrails.flatMap((trail) =>
      trail.links.flatMap((link) =>
        link.visibility_state === 'allowed'
          ? [`${link.source_type}:${link.source_id}`, `${link.target_type}:${link.target_id}`]
          : [],
      ),
    ),
  );
  const trailLinks = links.filter((link) => {
    if (projectedIds.has(link.id)) return false;
    if (link.visibility_state === 'allowed') {
      const linkedType = isFindingLink(link) ? 'finding' : 'task';
      const linkedEnd =
        link.source_type === linkedType
          ? `${link.source_type}:${link.source_id}`
          : `${link.target_type}:${link.target_id}`;
      if (projectedEntities.has(linkedEnd)) return false;
    }
    // #1174b: a Finding `summary_visible` payload is inconsistent (ADR-0024 §E);
    // treat it exactly like `hidden`.
    if (isFindingLink(link) && link.visibility_state === 'summary_visible') return false;
    return (
      (isTaskLink(link) || isFindingLink(link)) &&
      link.visibility_state !== 'hidden' &&
      !(isReporterContext && link.visibility_state === 'allowed')
    );
  });

  // eslint-disable-next-line react/jsx-no-useless-fragment -- the fragment turns the ReactNode body into the declared ReactElement return type
  if (trailLinks.length === 0 && visibleTrails.length === 0) return <></>;

  return (
    <div>
      <PanelSectionTitle>{VOC_FOLLOW_UP_COPY.relatedEntities}</PanelSectionTitle>
      {visibleTrails.map((trail) => (
        <FollowUpTrail
          key={trail.links[0]?.id}
          trail={trail}
          onOpenTask={onOpenTask}
          onOpenFinding={onOpenFinding}
          onOpenCluster={onOpenCluster}
          onOpenRequest={onOpenRequest}
          canOpen={canOpen}
        />
      ))}
      {trailLinks.map((link) =>
        isFindingLink(link) ? (
          <FindingLink
            key={link.id}
            link={link}
            isReporterContext={isReporterContext}
            onOpenFinding={onOpenFinding}
            canOpen={canOpen}
          />
        ) : (
          <TaskLink
            key={link.id}
            link={link}
            isReporterContext={isReporterContext}
            onOpenTask={onOpenTask}
            canOpen={canOpen}
          />
        ),
      )}
    </div>
  );
}
