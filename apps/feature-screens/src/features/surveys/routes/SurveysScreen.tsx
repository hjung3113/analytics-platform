// The /surveys list screen (list context from the URL, selection, stale-drop, create), free of the router so the standalone route and the
// platform bridge mount one definition (platform ADR-0071; #764 l). The URL goes through the host seam; the detail slot is the host's:
// `renderDetail` returns it (standalone: the Survey detail aside; the bridge: `undefined`, the platform page draws the drawer from the
// selection). Nothing here reaches the Survey detail tree. Selection comes from the URL only; nothing auto-selects (plan D4/D5).

import {
  type SurveyListFilterKey,
  SurveyListScreen,
  surveyListContextFromSearch,
  surveyListQueryArgs,
} from '@/features/surveys/components/list/SurveyListScreen';
import { useSurvey, useSurveys } from '@/features/surveys/hooks/useSurveys';
import { useSurveyManageGate } from '@/features/surveys/routes/SurveyPermissionGate';
import { validateSurveysSearch } from '@/features/surveys/routes/surveys-search';
import type { Survey } from '@/features/surveys/types';
import { useManagedSystemNamesResult } from '@/lib/cross-system/useManagedSystemNames';
import { useWorkspaceActors } from '@/lib/cross-system/useWorkspaceActors';
import { formatRecordDocumentTitle } from '@/lib/host/document-title-format';
import { useHostNavigate, useHostTitle } from '@/lib/host/host-seam';
import { useHostSearchWriter } from '@/lib/host/useHostSearchWriter';
import * as React from 'react';

export type SurveysDetailSlot = {
  /** Drops the selection (a push write). */
  close: () => void;
  /** The selected record once loaded; `undefined` while loading, missing or nothing selected. */
  survey: Survey | undefined;
  canManage: boolean;
  managedSystemNamesById: ReadonlyMap<string, string> | undefined;
  actorNamesById: ReadonlyMap<string, string> | undefined;
};

export type SurveysScreenProps = {
  /** The host's detail slot, called once per render and handed to the list as returned (`null`/`undefined` = no `detailPanel`). */
  renderDetail: (selectedId: string | null, slot: SurveysDetailSlot) => React.ReactNode;
};

export function SurveysScreen({ renderDetail }: SurveysScreenProps): React.ReactElement {
  const { search, write } = useHostSearchWriter('/surveys', validateSurveysSearch);
  const navigate = useHostNavigate();
  const context = surveyListContextFromSearch(search);
  const { managedSystemId, filters } = surveyListQueryArgs(context);
  // Same arguments as SurveyListScreen, so the stale-selection effect and the list share one query.
  const query = useSurveys(managedSystemId, filters);
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
  useHostTitle(
    selected.isSuccess && !selected.isFetching && selected.data?.id === selectedId
      ? formatRecordDocumentTitle({
          displayId: selected.data.display_id,
          title: selected.data.title,
        })
      : null,
  );

  const removeFilters = React.useCallback(
    (keys: readonly SurveyListFilterKey[]): void => {
      write(
        (previous) =>
          Object.fromEntries(
            Object.entries(previous).filter(([key]) => !(keys as readonly string[]).includes(key)),
          ) as typeof previous,
      );
    },
    [write],
  );

  const handleSelect = React.useCallback(
    (id: string): void => {
      write((previous) => ({ ...previous, selected: id }));
    },
    [write],
  );

  const handleClose = React.useCallback((): void => {
    write(({ selected: _selected, ...rest }) => rest);
  }, [write]);

  // Stale/invalid `selected` (deleted, or not in the caller's scope): once the
  // list has loaded, replace-drop it so Back is not trapped in the invalid URL.
  // While loading — or when the list failed — the deep-linked selection is kept.
  React.useEffect(() => {
    if (!query.isSuccess) return;
    if (selectedId !== null && !surveys.some((survey) => survey.id === selectedId)) {
      write(({ selected: _selected, ...rest }) => rest, { replace: true });
    }
  }, [write, query.isSuccess, selectedId, surveys]);

  return (
    <SurveyListScreen
      context={context}
      selectedId={selectedId}
      onSelect={handleSelect}
      onClose={handleClose}
      onRemoveFilters={removeFilters}
      onCreated={(surveyId) => navigate(`/surveys/${surveyId}?builder=true`)}
      managedSystemNamesById={managedSystemNamesById}
      actorNamesById={actorNamesById}
      renderDetail={(close) =>
        renderDetail(selectedId, {
          close,
          survey: selected.data,
          canManage: selectedGate.canManage,
          managedSystemNamesById,
          actorNamesById,
        })
      }
    />
  );
}
