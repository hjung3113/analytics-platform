import { mapUnknownError } from '../../../../lib/api/errorMapper';
import { mintIdempotencyKey } from '../../../../lib/api/idempotency';
import { updateMilestone } from '../../../../lib/api/milestones';
import { ApiError } from '../../../../lib/api/types';
import type { MilestoneDetailDto, MilestoneDto } from '@ap/feature-shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';

type TitleDraft = { id: string; session: symbol; text: string; originalTitle: string; version: string; error: string | null };

export function useMilestoneTitleEdit(
  milestoneId: string,
  milestone: MilestoneDetailDto | undefined,
) {
  const queryClient = useQueryClient();
  // B2e — title-only edit. Managed System is a create-only field (A3/A8) and
  // never becomes an input here; the PATCH carries the title and If-Match
  // with a fresh idempotency key, nothing else. The If-Match is the row's
  // updated_at captured when editing starts (Astra finding 2): a background
  // refetch that delivers a newer version must not rebase the unsaved draft
  // onto it, or Save would silently overwrite the concurrent change instead
  // of losing the race as a 409 conflict.stale_write.
  const [storedDraft, setDraft] = React.useState<TitleDraft | null>(null);
  const draft = storedDraft?.id === milestoneId ? storedDraft : null;
  if (storedDraft !== draft) setDraft(null);
  const titleDirty = draft !== null && draft.text !== (milestone?.title ?? draft.originalTitle);

  function updateDraft(
    session: symbol | undefined,
    update: (current: TitleDraft) => TitleDraft | null,
  ): void {
    setDraft((current) => current !== null && current.session === session ? update(current) : current);
  }

  function discardTitleEdit(): void {
    updateDraft(draft?.session, () => null);
  }

  function setTitleError(error: string | null): void {
    updateDraft(draft?.session, (current) => ({ ...current, error }));
  }

  function reconcileTitleDraft(session: symbol | undefined, versionChange?: { from: string; to: string }): void {
    updateDraft(session, (current) => {
      if (versionChange === undefined) return null;
      return current.version === versionChange.from ? { ...current, version: versionChange.to } : current;
    });
  }

  const titleMutation = useMutation<MilestoneDto, Error, { id: string; title: string; ifMatch: string; session: symbol }>({
    mutationFn: async ({ id, title, ifMatch }) =>
      updateMilestone(
        id,
        { title },
        { ifMatch, idempotencyKey: mintIdempotencyKey() },
      ),
    onSuccess: async (_, { id, session }) => {
      reconcileTitleDraft(session);
      await queryClient.invalidateQueries({ queryKey: ['milestone', id] });
      await queryClient.invalidateQueries({ queryKey: ['milestones'] });
    },
    onError: async (err, { id, session }) => {
      if (err instanceof ApiError && err.status === 409 && err.code === 'conflict.stale_write') {
        // Stale If-Match: the server row wins. Drop the typed title, refetch,
        // and show the stored title — never layer the draft over it.
        reconcileTitleDraft(session);
        await queryClient.refetchQueries({ queryKey: ['milestone', id], exact: true });
      } else {
        updateDraft(session, (current) => ({ ...current, error: mapUnknownError(err).message }));
      }
    },
  });

  function startTitleEdit(statusMutationPending: boolean): void {
    if (milestone === undefined || titleMutation.isPending || statusMutationPending) return;
    setDraft({
      id: milestoneId, session: Symbol(), text: milestone.title, originalTitle: milestone.title,
      version: milestone.updated_at, error: null,
    });
  }

  function submitTitleEdit(
    event: React.FormEvent<HTMLFormElement>,
    statusMutationPending: boolean,
  ): void {
    event.preventDefault();
    // R3 — serialized with the status mutation: a same-version title request
    // sent while a status change is in flight would be 409-cleared the
    // moment the status write commits. The disabled Save button and this
    // guard (Enter submits the form too) both refuse the race.
    if (milestone === undefined || draft === null || titleMutation.isPending || statusMutationPending) return;
    const title = draft.text.trim();
    if (title === '') {
      setTitleError('제목을 입력해 주세요.');
      return;
    }
    titleMutation.mutate({ id: milestoneId, title, ifMatch: draft.version, session: draft.session });
  }

  return {
    editingTitle: draft !== null,
    titleDraft: draft?.text ?? '',
    setTitleDraft: (text: string) => updateDraft(draft?.session, (current) => ({ ...current, text })),
    titleDraftSession: draft?.session,
    reconcileTitleDraft,
    titleError: draft?.error ?? null,
    setTitleError,
    titleDirty,
    titleMutation,
    startTitleEdit,
    cancelTitleEdit: discardTitleEdit,
    discardTitleEdit,
    submitTitleEdit,
  };
}

export type UseMilestoneTitleEditResult = ReturnType<typeof useMilestoneTitleEdit>;
