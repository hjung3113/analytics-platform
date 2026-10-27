import { SurveyDetail } from '@/features/surveys/components/detail/SurveyDetail';
import {
  type SurveyListFilterKey,
  SurveyListScreen,
  surveyListContextFromSearch,
  surveyListQueryArgs,
} from '@/features/surveys/components/list/SurveyListScreen';
import { useSurvey, useSurveys } from '@/features/surveys/hooks/useSurveys';
import { useSurveyManageGate } from '@/features/surveys/routes/SurveyPermissionGate';
import {
  type SurveysSearch,
  surveysSearchSchema,
  validateSurveysSearch,
} from '@/features/surveys/routes/surveys-search';
export { CreateSurveyDialog } from '@/features/surveys/components/create/CreateSurveyDialog';
import { useManagedSystemNamesResult } from '@/lib/cross-system/useManagedSystemNames';
import { useWorkspaceActors } from '@/lib/cross-system/useWorkspaceActors';
import { formatRecordDocumentTitle, useDocumentTitle } from '@/lib/router/document-title';
import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router';
import * as React from 'react';

export { surveysSearchSchema, validateSurveysSearch };

// #982: the router plugin skips code-splitting when the route component is an
// exported local (hasExport check). The alias keeps the page exported for
// tests while letting the route component split into its own chunk.
const SurveysIndexRouteSplit = SurveysIndexRoute;

export const Route = createFileRoute('/_authed/surveys/')({
  validateSearch: validateSurveysSearch,
  component: SurveysIndexRouteSplit,
});

export function SurveysIndexRoute() {
  const search = useSearch({ strict: false }) as SurveysSearch;
  const navigate = useNavigate({ from: '/surveys/' });
  const context = surveyListContextFromSearch(search);
  const { managedSystemId, filters } = surveyListQueryArgs(context);
  // Same arguments as SurveyListScreen, so the stale-selection effect and the
  // list share one query. Creation and filter chips live in the screen.
  const query = useSurveys(managedSystemId, filters);
  const removeFilters = (keys: readonly SurveyListFilterKey[]) => {
    void navigate({
      to: '/surveys',
      search: (previous) => {
        const next = { ...previous };
        for (const key of keys) delete next[key];
        return next;
      },
    });
  };
  const managedSystemNames = useManagedSystemNamesResult();
  const managedSystemNamesById = managedSystemNames.isSuccess
    ? managedSystemNames.namesById
    : undefined;
  const { actors, isSuccess: actorsResolved } = useWorkspaceActors();
  const actorNamesById = React.useMemo(
    () =>
      actorsResolved
        ? new Map((actors ?? []).map((actor) => [actor.id, actor.display_name]))
        : undefined,
    [actors, actorsResolved],
  );
  const selectedId = search.selected ?? null;
  const selected = useSurvey(selectedId ?? '');
  const selectedGate = useSurveyManageGate(selected.data?.primary_managed_system_id);
  const surveys = query.data ?? [];
  useDocumentTitle(
    selected.isSuccess && !selected.isFetching && selected.data?.id === selectedId
      ? formatRecordDocumentTitle({
          displayId: selected.data.display_id,
          title: selected.data.title,
        })
      : null,
  );

  const handleSelect = React.useCallback(
    (id: string): void => {
      void navigate({ to: '/surveys', search: (prev) => ({ ...prev, selected: id }) });
    },
    [navigate],
  );

  function handleClose(): void {
    void navigate({
      to: '/surveys',
      search: ({ selected: _selected, ...rest }) => rest,
    });
  }

  // Stale/invalid `selected` (deleted, or not in the caller's scope): once the
  // list has loaded, replace-drop it so Back is not trapped in the invalid URL.
  // While loading — or when the list failed — the deep-linked selection is kept.
  React.useEffect(() => {
    if (!query.isSuccess) return;
    if (selectedId !== null && !surveys.some((survey) => survey.id === selectedId)) {
      void navigate({
        to: '/surveys',
        replace: true,
        search: ({ selected: _selected, ...rest }) => rest,
      });
    }
  }, [navigate, query.isSuccess, selectedId, surveys]);

  return (
    <SurveyListScreen
      context={context}
      selectedId={selectedId}
      onSelect={handleSelect}
      onClose={handleClose}
      onRemoveFilters={removeFilters}
      onCreated={(surveyId) =>
        void navigate({
          to: '/surveys/$surveyId',
          params: { surveyId },
          search: { builder: true },
        })
      }
      managedSystemNamesById={managedSystemNamesById}
      actorNamesById={actorNamesById}
      renderDetail={(close) =>
        selected.data ? (
          <SurveyDetail
            survey={selected.data}
            canManage={selectedGate.canManage}
            onClose={close}
            managedSystemNamesById={managedSystemNamesById}
            actorNamesById={actorNamesById}
          />
        ) : null
      }
    />
  );
}
