import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useMessages, usePlatform, usePlatformQuery, type QueryState } from '@ap/kernel';
import type { AnnotationQuery, PlatformAdapter } from '@ap/contracts';
import { COMPONENTS_MESSAGES } from '../messages';
import type { Selection } from './useChartRange';

type AnnotationList = Awaited<ReturnType<PlatformAdapter['listAnnotations']>>['data'];
/** What the editor reads and writes: the platform's annotation port, or nothing outside a platform (#1953 C). */
type AnnotationIo = {
  query: Pick<QueryState<AnnotationList>, 'response' | 'refetch'>;
  adapter: Pick<PlatformAdapter, 'saveAnnotation' | 'deleteAnnotation'> | null;
  toast: (text: string) => void;
};
type EditorArgs = { chartId: string; scopeId: string | null; canAnnotate: boolean; axisKind?: AnnotationQuery['axisKind']; from?: string | null; to?: string | null };
type AnnotationTarget = { chartId: string; scopeId: string };

/**
 * The annotation editor: the persisted notes (server-owned, keyed by chartId + Scope), the draft text, save, and the
 * inline delete confirm. `closeEditor` only ends the draft; `cancelDelete` is the Context change's cancellation of
 * every local delete state and in-flight call, and the Reset button must not use it.
 */
export function useAnnotationEditor({ chartId, scopeId, canAnnotate, axisKind, from, to }: EditorArgs) {
  const { adapter, toast } = usePlatform();
  const target = canAnnotate && scopeId !== null ? { chartId, scopeId } : null;
  // A row belongs to one site: the Scope is part of the query identity, so a site switch hides the previous site's notes.
  const query = usePlatformQuery(signal => adapter.listAnnotations({ chartId, scopeId, axisKind, from, to }, signal), [chartId, scopeId, axisKind, from, to], target !== null, 'session');
  return useEditorState(target, { query, adapter, toast });
}

const NO_ANNOTATIONS: AnnotationIo = { query: { response: null, refetch: () => {} }, adapter: null, toast: () => {} };
/** Outside a platform there is no annotation store: the same editor shape with no notes, and save or delete do nothing (Annotate is not drawn). */
export function useNoAnnotationEditor() {
  return useEditorState(null, NO_ANNOTATIONS);
}

function useEditorState(target: AnnotationTarget | null, { query, adapter, toast }: AnnotationIo) {
  const m = useMessages(COMPONENTS_MESSAGES);
  const [note, setNote] = useState<string | null>(null);
  const enabled = target !== null;
  const annotations = useMemo(() => (enabled ? query.response?.data?.items ?? [] : []), [enabled, query.response]);
  const refetch = query.refetch;
  const [savingGeneration, setSavingGeneration] = useState<number | null>(null);
  const saving = savingGeneration !== null;
  // Each editor session gets a generation; a save that finishes after cancel/reopen/Scope change must not touch the newer draft.
  const draftGen = useRef(0);
  // Delete (#399): one inline confirm per note. `pendingDelete` is the note being confirmed, `deleting` the in-flight call,
  // `settled` a delete the server accepted whose refetch has not removed the row yet.
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [settled, setSettled] = useState<{ id: string; nextId: string | null } | null>(null);
  const [restoreFocus, setRestoreFocus] = useState<string | null>(null);
  // Bumped when a Context change cancels the delete operation: a call that was in flight then completes into nothing.
  const deleteGen = useRef(0);
  const deleteButtons = useRef(new Map<string, HTMLButtonElement>());
  // Whether keyboard focus is still on the confirm row: set by focus in, cleared when focus leaves the group — to another element or to the
  // page (blur to body). A window blur keeps the element active and leaves it set; removing the focused row fires no event the group sees.
  const focusOnConfirm = useRef(false);
  const openEditor = useCallback(() => {
    if (!enabled) return;
    draftGen.current++;
    setSavingGeneration(null);
    setNote('');
  }, [enabled]);
  const closeEditor = useCallback(() => {
    draftGen.current++;
    setSavingGeneration(null);
    setNote(null);
  }, []);
  const cancelDelete = useCallback(() => {
    deleteGen.current++; focusOnConfirm.current = false; setPendingDelete(null); setSettled(null); setDeleting(false);
  }, []);
  useLayoutEffect(() => {
    if (enabled) return;
    closeEditor();
    cancelDelete();
    setRestoreFocus(null);
  }, [enabled, closeEditor, cancelDelete]);

  async function saveNote(range: Selection) {
    const text = (note ?? '').trim();
    if (!target || !text || saving || !adapter) return;
    const gen = draftGen.current;
    const failed = () => { if (gen === draftGen.current) toast(m('chartAnnotationSaveError')); };
    setSavingGeneration(gen);
    try {
      const res = await adapter.saveAnnotation({ ...target, from: range.from, to: range.to, text });
      if (res.outcome !== 'ok') failed();
      else {
        refetch();
        if (gen === draftGen.current) { closeEditor(); toast(m('chartAnnotationSaved')); }
      }
    } catch { failed(); } finally {
      setSavingGeneration(current => current === gen ? null : current);
    }
  }

  async function deleteNote(id: string) {
    if (!target || deleting || !adapter) return;
    const mineIds = annotations.filter(a => a.mine).map(a => a.id);
    const nextId = mineIds[mineIds.indexOf(id) + 1] ?? null;
    const gen = deleteGen.current;
    const stale = () => gen !== deleteGen.current;
    const failed = () => {
      if (stale()) return;
      toast(m('chartAnnotationDeleteError'));
      setPendingDelete(null); setDeleting(false);
      if (focusOnConfirm.current) setRestoreFocus(id);
      focusOnConfirm.current = false;
    };
    setDeleting(true);
    try {
      const res = await adapter.deleteAnnotation({ ...target, id });
      if (stale()) {
        // The server removed the note; the session list is keyed by chart and Scope only, so it must still reload.
        if (res.outcome === 'ok') refetch();
        return;
      }
      if (res.outcome !== 'ok') { failed(); return; }
      toast(m('chartAnnotationDeleted'));
      setSettled({ id, nextId });
      refetch();
    } catch { failed(); }
  }

  /** The delete the server accepted is gone from the list: drop the settled marker and the confirm. */
  const endSettled = useCallback(() => { setSettled(null); setPendingDelete(null); setDeleting(false); }, []);

  /** The confirm row's Cancel: keep the note and hand focus back to the button that opened the confirm. */
  function cancelConfirm(id: string) {
    if (deleting) return;
    setPendingDelete(null); setRestoreFocus(id);
  }

  return {
    query, annotations, refetch,
    note: enabled ? note : null, setNote, saving, openEditor, closeEditor, saveNote,
    pendingDelete, startDelete: (id: string) => { if (enabled) setPendingDelete(id); }, deleting, deleteNote, cancelConfirm, cancelDelete,
    deleteButtons, focusOnConfirm,
    settled, endSettled, restoreFocus, setRestoreFocus,
  };
}

export type AnnotationEditor = ReturnType<typeof useEditorState>;

/**
 * Focus handoff after a delete (06 §26). A separate hook so its effects run after the frame's Context-reset effect,
 * as they did when everything lived in the component.
 */
export function useAnnotationDeleteFocus(editor: AnnotationEditor, anchors: { annotateButton: RefObject<HTMLButtonElement | null>; brushToggle: RefObject<HTMLButtonElement | null>; returnToAnnotate?: () => void }) {
  const { annotations, settled, endSettled, restoreFocus, setRestoreFocus, deleteButtons, focusOnConfirm } = editor;
  const { annotateButton, brushToggle, returnToAnnotate } = anchors;
  // 06 §26: the confirm row unmounts, so focus moves only if it is still on that row — the next note's delete button, else Annotate.
  useEffect(() => {
    if (!settled || annotations.some(a => a.id === settled.id)) return;
    const onConfirm = focusOnConfirm.current;
    focusOnConfirm.current = false;
    endSettled();
    if (!onConfirm) return;
    const next = settled.nextId ? deleteButtons.current.get(settled.nextId) : undefined;
    if (!next && returnToAnnotate) { returnToAnnotate(); return; }
    const fallback = annotateButton.current && !annotateButton.current.disabled ? annotateButton.current : brushToggle.current;
    (next ?? fallback)?.focus({ preventScroll: true });
  }, [annotations, settled, endSettled, focusOnConfirm, deleteButtons, annotateButton, brushToggle, returnToAnnotate]);
  // Cancel and failure keep the note: focus goes back to the button that opened the confirm.
  useEffect(() => {
    if (restoreFocus === null) return;
    deleteButtons.current.get(restoreFocus)?.focus({ preventScroll: true });
    setRestoreFocus(null);
  }, [restoreFocus, deleteButtons, setRestoreFocus]);
}
