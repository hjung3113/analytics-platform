import { usePublicUpdateReviewCandidates } from '@/features/voc/hooks/usePublicUpdateReviewCandidates';
import { useRequestTaskFromVoc } from '@/features/voc/hooks/useRequestTaskFromVoc';
import { errorMapper } from '@/lib/api/errorMapper';
import type { MeResponse } from '@/lib/api/me';
import { getTask } from '@/lib/api/tasks';
import type { ApiError } from '@/lib/api/types';
import { useIdempotencyKey } from '@/lib/api/useIdempotencyKey';
import { analyticsAreasCatalogQuery } from '@/lib/cross-system/analyticsAreasCatalog';
import { usePermissionCheckBridge } from '@/lib/cross-system/usePermissionCheckBridge';
import { useWorkspaceActors } from '@/lib/cross-system/useWorkspaceActors';
import { useHostNavigate, useHostSeam, useHostSearch } from '@/lib/host/host-seam';
import { searchHref } from '@/lib/host/search';
import type {
  CreateTaskRequestRequest,
  EntityLinkDto,
  TaskStatus,
  VocDetailEnvelope,
} from '@fops/shared';
import { useQuery } from '@tanstack/react-query';
import * as React from 'react';
import type { TrailOpenKind } from './LinkedEntityTrailSection';
import { hasSimilarVocSection } from './SimilarVocSection';

type AllowedEntityLink = Extract<EntityLinkDto, { visibility_state: 'allowed' }>;

function isAllowedTaskLinkForVoc(link: EntityLinkDto, vocId: string): link is AllowedEntityLink {
  if (link.visibility_state !== 'allowed') return false;
  return (
    (link.source_type === 'voc' && link.source_id === vocId && link.target_type === 'task') ||
    (link.target_type === 'voc' && link.target_id === vocId && link.source_type === 'task')
  );
}

export function useVocDetailPanelController({
  voc,
  vocId,
  managedSystemId,
  canRenderAllowedTask,
  me,
}: {
  voc: VocDetailEnvelope;
  vocId: string;
  managedSystemId?: string;
  canRenderAllowedTask: boolean;
  me: MeResponse | null;
}) {
  const [createFindingOpen, setCreateFindingOpen] = React.useState(false);
  const [requestTaskOpen, setRequestTaskOpen] = React.useState(false);
  const [reviewOpen, setReviewOpen] = React.useState(false);
  const navigate = useHostNavigate();
  const search = useHostSearch();
  const { canLink, notifyError, notifySuccess } = useHostSeam();
  const permissionManagedSystemId = managedSystemId ?? voc.primary_managed_system_id;
  const capCheck = usePermissionCheckBridge({
    capability: 'voc.triage',
    managedSystemId: permissionManagedSystemId,
  });
  const canTriage = capCheck.data?.state === 'approved';
  const { key: requestTaskIdempotencyKey, markConsumed: markRequestTaskConsumed } =
    useIdempotencyKey();
  // Scroll container ref for section nav anchor tracking
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const { actors } = useWorkspaceActors();
  const actorNamesById = React.useMemo(
    () => new Map((actors ?? []).map((actor) => [actor.id, actor.display_name])),
    [actors],
  );
  const analyticsAreasQuery = useQuery(analyticsAreasCatalogQuery(voc.primary_managed_system_id));
  const analyticsAreasById = React.useMemo(
    () => new Map((analyticsAreasQuery.data?.items ?? []).map((area) => [area.id, area.name])),
    [analyticsAreasQuery.data?.items],
  );
  const allowedTaskLink = voc.links?.find((link) => isAllowedTaskLinkForVoc(link, voc.id));
  const linkedTaskId =
    allowedTaskLink?.source_type === 'task'
      ? allowedTaskLink.source_id
      : allowedTaskLink?.target_type === 'task'
        ? allowedTaskLink.target_id
        : null;
  const linkedTaskQuery = useQuery({
    queryKey: ['task', linkedTaskId] as const,
    queryFn: ({ signal }) => getTask(linkedTaskId as string, signal),
    enabled: linkedTaskId !== null && canRenderAllowedTask,
    staleTime: 30 * 1000,
  });
  const inheritedTask = canRenderAllowedTask
    ? voc.linked_execution.trails
        ?.flatMap((trail) => trail.links)
        .filter((link) => link.visibility_state === 'allowed')
        .map((link) => link.target_summary)
        .find((summary) => summary?.type === 'task')
    : undefined;
  const linkedTask =
    canRenderAllowedTask && linkedTaskQuery.data !== undefined
      ? { title: linkedTaskQuery.data.title, status: linkedTaskQuery.data.status }
      : inheritedTask?.type === 'task'
        ? {
            title: inheritedTask.title,
            status: inheritedTask.status as TaskStatus,
          }
        : null;

  // FE display hint only (ADR-0024 §C): gate button to Admin or Developer.
  const canCreateFinding = me?.actor.role_level === 'admin' || me?.actor.role_level === 'developer';
  const reviewCandidates = usePublicUpdateReviewCandidates(voc.id, canCreateFinding);
  const pendingReviewCount = reviewCandidates.data?.items.length ?? 0;
  const canRequestTask = canCreateFinding;
  const showsSimilarVocSection = hasSimilarVocSection(voc.similar, voc.similar_count);
  const isReporterArm = voc.similar === undefined || voc.similar_count === undefined;

  const requestTaskMutation = useRequestTaskFromVoc({
    vocId,
    idempotencyKey: requestTaskIdempotencyKey,
    onError: (err: ApiError) => {
      notifyError(errorMapper(err.envelope).message);
    },
  });

  function closeRequestTaskDraft(): void {
    requestTaskMutation.reset();
    setRequestTaskOpen(false);
  }

  function handleRequestTaskSubmit(values: CreateTaskRequestRequest): void {
    requestTaskMutation.mutate(values, {
      onSuccess: () => {
        markRequestTaskConsumed();
        setRequestTaskOpen(false);
        requestTaskMutation.reset();
        notifySuccess('Task Request가 생성되었습니다.');
      },
    });
  }

  // A move is offered only where the host can take the actor there (ADR-0071 d10): the bridge maps these
  // destinations menu by menu, so an unmapped one leaves its control out. Each control asks `canLink` about its
  // own destination href (the record's id), never a probe built from this VOC.
  const taskPath = (id: string) => searchHref('/tasks', { param: id });
  const findingPath = (id: string) => searchHref('/findings', { selected: id });
  const clusterPath = (id: string) => `/voc-clusters/${encodeURIComponent(id)}`;
  const requestPath = (id: string) => searchHref('/tasks', { view: 'requests', param: id });
  // Match VOC list-row selection: retain the current view and filters.
  const similarPath = (id: string) => searchHref('/vocs', { ...search, selected: id });
  const triagePath = (id: string) =>
    searchHref('/vocs', { ...search, view: 'triage', selected: id });
  const trailPath: Record<TrailOpenKind, (id: string) => string> = {
    task: taskPath,
    finding: findingPath,
    cluster: clusterPath,
    task_request: requestPath,
  };

  const canSelectSimilarVoc = (id: string): boolean => canLink(similarPath(id));
  const canOpenTrailNode = (kind: TrailOpenKind, id: string): boolean =>
    canLink(trailPath[kind](id));
  const handleSimilarVocSelect = (id: string): void => navigate(similarPath(id));
  // The target is this VOC itself, so its own href is the destination.
  const handleOpenTriage = canLink(triagePath(vocId))
    ? (): void => navigate(triagePath(vocId))
    : undefined;
  const handleOpenTask = (taskId: string): void => navigate(taskPath(taskId));
  const handleOpenFinding = (findingId: string): void => navigate(findingPath(findingId));
  const handleOpenCluster = (clusterId: string): void => navigate(clusterPath(clusterId));
  const handleOpenRequest = (requestId: string): void => navigate(requestPath(requestId));

  return {
    createFindingOpen,
    setCreateFindingOpen,
    requestTaskOpen,
    setRequestTaskOpen,
    reviewOpen,
    setReviewOpen,
    scrollRef,
    actorNamesById,
    analyticsAreasById,
    canTriage,
    noFollowUpScope: `${vocId}:${voc.primary_managed_system_id}:${permissionManagedSystemId}:${canTriage}:${voc.follow_up?.can_record}:${voc.follow_up?.can_withdraw}`,
    linkedTask,
    requestTaskIsPending: requestTaskMutation.isPending,
    pendingReviewCount,
    canCreateFinding,
    canRequestTask,
    showsSimilarVocSection,
    isReporterArm,
    closeRequestTaskDraft,
    handleRequestTaskSubmit,
    handleSimilarVocSelect,
    canSelectSimilarVoc,
    canOpenTrailNode,
    handleOpenTriage,
    handleOpenTask,
    handleOpenFinding,
    handleOpenCluster,
    handleOpenRequest,
  };
}
