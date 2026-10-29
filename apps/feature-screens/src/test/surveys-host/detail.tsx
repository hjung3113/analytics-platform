// Test-local host for retained detail/list and builder assertions.
import { useBuilderDirtyGuard } from '@/features/surveys/components/builder/hooks/useBuilderDirtyGuard';
import {
  SurveyListScreen,
  surveyListContextFromSearch,
  surveyListContextSearch,
} from '@/features/surveys/components/list/SurveyListScreen';
import { useSurvey } from '@/features/surveys/hooks/useSurveys';
import { SurveyBuilderView } from '@/features/surveys/routes/SurveyBuilderScreen';
import { useSurveyManageGate } from '@/features/surveys/routes/SurveyPermissionGate';
import { validateSurveyDetailSearch } from '@/features/surveys/routes/surveys-search';
import { useManagedSystemNamesResult } from '@/lib/cross-system/useManagedSystemNames';
import { useWorkspaceActors } from '@/lib/cross-system/useWorkspaceActors';
import { SurveyDetail } from '@/test/host-adapters/features/surveys/components/detail/SurveyDetail';
import { DirtyConfirmation, EmptyState } from '@ap/ui';
import {
  Outlet,
  useBlocker,
  useMatchRoute,
  useNavigate,
  useParams,
  useSearch,
} from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';

export { validateSurveyDetailSearch };

// #982: the router plugin skips code-splitting when the route component is an
// exported local (hasExport check). The alias keeps SurveyDetailRoute exported
// for tests while letting the route component split into its own chunk.

// The builder's screen owns the data states and its own Back confirmation; the router-only part stays here: a blocker (browser back,
// sidebar navigation) and the unload prompt over the screen's guard. A dirty Back is confirmed by the screen before it navigates, with
// the guard cleared first, so the blocker never opens a second dialog.
function StandaloneSurveyBuilder({
  surveyQuery,
  onBack,
}: { surveyQuery: ReturnType<typeof useSurvey>; onBack: () => void }) {
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
      <SurveyBuilderView surveyQuery={surveyQuery} onBack={onBack} leaveGuard={leaveGuard} />
      <DirtyConfirmation
        open={dirtyDialogOpen}
        onConfirm={confirmLeaveBuilder}
        onCancel={cancelLeaveBuilder}
      />
    </>
  );
}

export function SurveyDetailRoute() {
  const { surveyId } = useParams({ strict: false }) as { surveyId: string };
  const matchRoute = useMatchRoute();
  const search = useSearch({ strict: false }) as ReturnType<typeof validateSurveyDetailSearch>;
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
        surveyQuery={query}
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
          search: (previous: Record<string, unknown>) => previous,
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
          search: (previous: Record<string, unknown>) => {
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
