import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useI18n, usePlatform, usePlatformQuery } from '@ap/kernel';
import type { Selection } from './useChartRange';

/**
 * The annotation editor: the persisted notes (server-owned, keyed by chartId + Scope), the draft text, save, and the
 * inline delete confirm. `closeEditor` only ends the draft; `cancelDelete` is the Context change's cancellation of
 * every local delete state and in-flight call, and the Reset button must not use it.
 */
export function useAnnotationEditor({ chartId, scopeId, canAnnotate }: { chartId: string; scopeId: string | null; canAnnotate: boolean }) {
  const { lang } = useI18n();
  const { adapter, toast } = usePlatform();
  const [note, setNote] = useState<string | null>(null);
  // A row belongs to one site: the Scope is part of the query identity, so a site switch hides the previous site's notes.
  const query = usePlatformQuery(signal => adapter.listAnnotations({ chartId, scopeId }, signal), [chartId, scopeId], canAnnotate && scopeId !== null, 'session');
  const annotations = useMemo(() => query.response?.data?.items ?? [], [query.response]);
  const refetch = query.refetch;
  const [saving, setSaving] = useState(false);
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
  const openEditor = useCallback(() => { draftGen.current++; setNote(''); }, []);
  const closeEditor = useCallback(() => { draftGen.current++; setNote(null); }, []);
  const cancelDelete = useCallback(() => {
    deleteGen.current++; focusOnConfirm.current = false; setPendingDelete(null); setSettled(null); setDeleting(false);
  }, []);

  async function saveNote(range: Selection) {
    const text = (note ?? '').trim();
    if (!text || scopeId === null || saving) return;
    const gen = draftGen.current;
    const failed = () => { if (gen === draftGen.current) toast(lang === 'ko' ? '주석을 저장하지 못했습니다. 입력은 유지됩니다.' : 'Could not save the annotation. Your text is kept.'); };
    setSaving(true);
    try {
      const res = await adapter.saveAnnotation({ chartId, scopeId, from: range.from, to: range.to, text });
      if (res.outcome !== 'ok') failed();
      else {
        refetch();
        if (gen === draftGen.current) { closeEditor(); toast(lang === 'ko' ? '주석을 저장했습니다.' : 'Annotation saved.'); }
      }
    } catch { failed(); } finally { setSaving(false); }
  }

  async function deleteNote(id: string) {
    if (scopeId === null || deleting) return;
    const mineIds = annotations.filter(a => a.mine).map(a => a.id);
    const nextId = mineIds[mineIds.indexOf(id) + 1] ?? null;
    const gen = deleteGen.current;
    const stale = () => gen !== deleteGen.current;
    const failed = () => {
      if (stale()) return;
      toast(lang === 'ko' ? '주석을 삭제하지 못했습니다.' : 'Could not delete the annotation.');
      setPendingDelete(null); setDeleting(false);
      if (focusOnConfirm.current) setRestoreFocus(id);
      focusOnConfirm.current = false;
    };
    setDeleting(true);
    try {
      const res = await adapter.deleteAnnotation({ chartId, scopeId, id });
      if (stale()) {
        // The server removed the note; the session list is keyed by chart and Scope only, so it must still reload.
        if (res.outcome === 'ok') refetch();
        return;
      }
      if (res.outcome !== 'ok') { failed(); return; }
      toast(lang === 'ko' ? '주석을 삭제했습니다.' : 'Annotation deleted.');
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
    note, setNote, saving, openEditor, closeEditor, saveNote,
    pendingDelete, startDelete: setPendingDelete, deleting, deleteNote, cancelConfirm, cancelDelete,
    deleteButtons, focusOnConfirm,
    settled, endSettled, restoreFocus, setRestoreFocus,
  };
}

/**
 * Focus handoff after a delete (06 §26). A separate hook so its effects run after the frame's Context-reset effect,
 * as they did when everything lived in the component.
 */
export function useAnnotationDeleteFocus(editor: ReturnType<typeof useAnnotationEditor>, anchors: { annotateButton: RefObject<HTMLButtonElement | null>; brushToggle: RefObject<HTMLButtonElement | null> }) {
  const { annotations, settled, endSettled, restoreFocus, setRestoreFocus, deleteButtons, focusOnConfirm } = editor;
  const { annotateButton, brushToggle } = anchors;
  // 06 §26: the confirm row unmounts, so focus moves only if it is still on that row — the next note's delete button, else Annotate.
  useEffect(() => {
    if (!settled || annotations.some(a => a.id === settled.id)) return;
    const onConfirm = focusOnConfirm.current;
    focusOnConfirm.current = false;
    endSettled();
    if (!onConfirm) return;
    const next = settled.nextId ? deleteButtons.current.get(settled.nextId) : undefined;
    const fallback = annotateButton.current && !annotateButton.current.disabled ? annotateButton.current : brushToggle.current;
    (next ?? fallback)?.focus({ preventScroll: true });
  }, [annotations, settled, endSettled, focusOnConfirm, deleteButtons, annotateButton, brushToggle]);
  // Cancel and failure keep the note: focus goes back to the button that opened the confirm.
  useEffect(() => {
    if (restoreFocus === null) return;
    deleteButtons.current.get(restoreFocus)?.focus({ preventScroll: true });
    setRestoreFocus(null);
  }, [restoreFocus, deleteButtons, setRestoreFocus]);
}
