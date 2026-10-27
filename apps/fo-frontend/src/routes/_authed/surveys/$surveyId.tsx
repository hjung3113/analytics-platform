import { useBuilderDirtyGuard } from '@/features/surveys/components/builder/hooks/useBuilderDirtyGuard';
import { SurveyDetail } from '@/features/surveys/components/detail/SurveyDetail';
import {
  SurveyListScreen,
  surveyListContextFromSearch,
  surveyListContextSearch,
} from '@/features/surveys/components/list/SurveyListScreen';
import { useSurvey } from '@/features/surveys/hooks/useSurveys';
import { SurveyBuilderScreen } from '@/features/surveys/routes/SurveyBuilderScreen';
import { useSurveyManageGate } from '@/features/surveys/routes/SurveyPermissionGate';
import { validateSurveyDetailSearch } from '@/features/surveys/routes/surveys-search';
import { useManagedSystemNamesResult } from '@/lib/cross-system/useManagedSystemNames';
import { useWorkspaceActors } from '@/lib/cross-system/useWorkspaceActors';
import { formatRecordDocumentTitle, useDocumentTitle } from '@/lib/router/document-title';
import { DirtyConfirmation, EmptyState } from '@ap/ui';
import {
  Outlet,
  createFileRoute,
  useBlocker,
  useMatchRoute,
  useNavigate,
} from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';

export { validateSurveyDetailSearch };

// #982: the router plugin skips code-splitting when the route component is an
// exported local (hasExport check). The alias keeps SurveyDetailRoute exported
// for tests while letting the route component split into its own chunk.
const SurveyDetailRouteSplit = SurveyDetailRoute;

export const Route = createFileRoute('/_authed/surveys/$surveyId')({
  validateSearch: validateSurveyDetailSearch,
  component: SurveyDetailRouteSplit,
});

// The builder's screen owns the data states and its own Back confirmation; the router-only part stays here: a blocker (browser back,
// sidebar navigation) and the unload prompt over the screen's guard. A dirty Back is confirmed by the screen before it navigates, with
// the guard cleared first, so the blocker never opens a second dialog.
function StandaloneSurveyBuilder({ surveyId, onBack }: { surveyId: string; onBack: () => void }) {
  const leaveGuard = useBuilderDirtyGuard();
  const { dirtyRef: builderDirtyRef, setDirty: handleBuilderDirtyChange } = leaveGuard;
  const [dirtyDialogOpen, setDirtyDialogOpen] = useState(false);
  const blocker = useBlocker({
    shouldBlockFn: () => builderDirtyRef.current,
    withResolver: true,
    enableBeforeUnload: () => builderDirtyRef.current,
  });
  useEffect(() => {
    if (blocker.status === 'blocked') setDirtyDialogOpen(true);
  }, [blocker.status]);
  const confirmLeaveBuilder = () => {
    setDirtyDialogOpen(false);
    handleBuilderDirtyChange(false);
    if (blocker.status === 'blocked' && blocker.proceed) blocker.proceed();
  };
  const cancelLeaveBuilder = () => {
    setDirtyDialogOpen(false);
    if (blocker.status === 'blocked' && blocker.reset) blocker.reset();
  };

  return (
    <>
      <SurveyBuilderScreen surveyId={surveyId} onBack={onBack} leaveGuard={leaveGuard} />
      <DirtyConfirmation
        open={dirtyDialogOpen}
        onConfirm={confirmLeaveBuilder}
        onCancel={cancelLeaveBuilder}
      />
    </>
  );
}

export function SurveyDetailRoute() {
  const { surveyId } = Route.useParams();
  const matchRoute = useMatchRoute();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const isResultsRoute = matchRoute({
    to: '/surveys/$surveyId/results',
    params: { surveyId },
    fuzzy: false,
  });
  const isFollowUpRoute = matchRoute({
    to: '/surveys/$surveyId/follow-up',
    params: { surveyId },
    fuzzy: false,
  });
  const isOutcomeReviewRoute = isResultsRoute || isFollowUpRoute;
  const query = useSurvey(surveyId);
  const gate = useSurveyManageGate(query.data?.primary_managed_system_id);
  const documentTitleRecord =
    !isOutcomeReviewRoute && query.isSuccess && !query.isFetching && !search.builder
      ? formatRecordDocumentTitle({
          displayId: query.data.display_id,
          title: query.data.title,
        })
      : null;
  useDocumentTitle(documentTitleRecord);
  const listContext = surveyListContextFromSearch(search);
  const managedSystemNames = useManagedSystemNamesResult({ enabled: !isOutcomeReviewRoute });
  const managedSystemNamesById = managedSystemNames.isSuccess
    ? managedSystemNames.namesById
    : undefined;
  const actorsQuery = useWorkspaceActors({ enabled: !isOutcomeReviewRoute });
  const actorNamesById = useMemo(
    () =>
      actorsQuery.isSuccess
        ? new Map((actorsQuery.actors ?? []).map((actor) => [actor.id, actor.display_name]))
        : undefined,
    [actorsQuery.actors, actorsQuery.isSuccess],
  );

  if (isOutcomeReviewRoute) return <Outlet />;
  if (search.builder)
    return (
      <StandaloneSurveyBuilder
        surveyId={surveyId}
        onBack={() => void navigate({ to: '/surveys/$surveyId', params: { surveyId } })}
      />
    );
  if (query.isLoading) return <div className="p-6 text-sm text-text-muted">불러오는 중…</div>;
  if (query.isError || !query.data)
    return (
      <EmptyState title="Survey를 찾을 수 없습니다." body="삭제되었거나 접근 권한이 없습니다." />
    );
  return (
    <SurveyListScreen
      context={listContext}
      selectedId={surveyId}
      onSelect={(id) =>
        void navigate({
          to: '/surveys/$surveyId',
          params: { surveyId: id },
          search: (previous) => previous,
        })
      }
      onClose={() =>
        void navigate({
          to: '/surveys',
          search: surveyListContextSearch(listContext),
        })
      }
      onRemoveFilters={(keys) =>
        void navigate({
          to: '/surveys/$surveyId',
          params: { surveyId },
          search: (previous) => {
            const next = { ...previous };
            for (const key of keys) delete next[key];
            return next;
          },
        })
      }
      onCreated={(createdId) =>
        void navigate({
          to: '/surveys/$surveyId',
          params: { surveyId: createdId },
          search: { builder: true },
        })
      }
      managedSystemNamesById={managedSystemNamesById}
      actorNamesById={actorNamesById}
      renderDetail={(close) => (
        <SurveyDetail
          survey={query.data}
          canManage={gate.canManage}
          onClose={close}
          managedSystemNamesById={managedSystemNamesById}
          actorNamesById={actorNamesById}
        />
      )}
    />
  );
}
