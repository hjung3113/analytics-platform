import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PEOPLE_LOOKUP_MAX, type ApprovalRequestInfo, type GroupMember, type SavedViewSupport, type Result, type SavedView, type SavedViewListItem, type SavedViewStore, type ViewVisibility } from '@ap/contracts';
import { diagnoseSavedView, useEquipmentAxes, useI18n, useMessages, type SavedViewDiagnosis } from '@ap/kernel';
import { captureApplied, useHostPlatform, useSavedViews, type SavedViews, type SelectOutcome } from '@ap/kernel/host';
import { DirtyConfirmation } from '@ap/ui';
import { failureText, SaveViewDialog, ShareTargetPicker, ViewManagement, ViewSelector, type ShareGroupsState, type ShareTargetDraft, type ViewFilter, type ViewSelectorState } from '@ap/components';
import { SHELL_MESSAGES } from '../messages';

/**
 * The Saved View selector of the query tool row (06 §21): current view, `수정됨`, the save menu and the requested `뷰 관리` surface.
 * Not the feature-bridge `savedViewsSlot` (a feature sidebar slot). Drawn only with an injected store, a `features.savedView` menu and its
 * registered support, and never inside a board pane. Every store write goes through `useSavedViews`; the shell reads groups, approval requests and people from the host store only.
 * The surface lives for one generation: when the store, session, revision, Scope, menu or support changes it is replaced, and anything a replaced or unmounted surface
 * still awaits (a write, a pick, a group) ends without a toast or state change. The hook returns a completed Result unchanged; showing it is this surface's job while it is alive.
 */
export function SavedViewControl() {
  const { screenMode, savedViewStore, session, revision, scope, user, route } = useHostPlatform();
  const views = useSavedViews();
  // The inputs that start a new `useSavedViews` generation, except `scope.status`: validating → valid keeps the same user, menu and Scope, so an open surface stays.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the inputs are triggers only
  const generation = useMemo(() => ({}), [savedViewStore, session, revision, scope.scopeId, user.id, route?.menu.id, views.support]);
  if (screenMode === 'pane' || views.status === 'disabled' || !savedViewStore || !views.support) return null;
  return <Ready key={generationKey(generation)} views={views} store={savedViewStore} support={views.support} />;
}

const generationKeys = new WeakMap<object, number>();
let lastKey = 0;
const generationKey = (generation: object): number => {
  let key = generationKeys.get(generation);
  if (key === undefined) { key = ++lastKey; generationKeys.set(generation, key); }
  return key;
};

type Pending = { unit: 'condition-set' | 'menu-view'; name: string };
const entriesOf = (items: readonly SavedViewListItem[]) => items.flatMap(item => item.denied ? [] : [item]);
const sameIds = (a: readonly string[], b: readonly string[]) => a.length === b.length && [...a].sort().join('\n') === [...b].sort().join('\n');
/** Whether the stored view already holds what the share step asks for: the same people or groups, or an official request on its way or granted. */
function shareApplied(view: SavedView, official: boolean, wanted: ViewVisibility): boolean {
  if (official) return view.approval === 'pending' || view.approval === 'approved';
  const now = view.visibility;
  if (now.kind === 'people' && wanted.kind === 'people') return sameIds(now.userIds, wanted.userIds);
  if (now.kind === 'groups' && wanted.kind === 'groups') return sameIds(now.groupIds, wanted.groupIds);
  return false;
}

function Ready({ views, store, support }: { views: SavedViews; store: Pick<SavedViewStore, 'get' | 'listGroups' | 'listApprovalRequests' | 'searchPeople'>; support: SavedViewSupport }) {
  const host = useHostPlatform();
  const axes = useEquipmentAxes();
  const { t, tx } = useI18n();
  const m = useMessages(SHELL_MESSAGES);
  const userId = host.user.id;
  // False once this surface was replaced or unmounted: its pending writes may finish, but nothing of theirs reaches the screen, the toasts or the parent.
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const toast = (text: string, tone: Parameters<typeof host.toast>[1]) => { if (alive.current) host.toast(text, tone); };
  const wrapper = useRef<HTMLSpanElement>(null);
  const saveTrigger = useRef<HTMLButtonElement>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ViewFilter>('all');
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveMode, setSaveMode] = useState<'new' | 'update'>('new');
  const [shareOpen, setShareOpen] = useState(false);
  const [handoff, setHandoff] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [groups, setGroups] = useState<{ status: ShareGroupsState['status']; entries: ShareGroupsState['entries'] }>({ status: 'loading', entries: [] });
  const [groupTick, setGroupTick] = useState(0);
  const [requests, setRequests] = useState<Record<string, ApprovalRequestInfo>>({});
  const [shareError, setShareError] = useState<string | null>(null);
  const [draftAsk, setDraftAsk] = useState<((go: boolean) => void) | null>(null);
  const pending = useRef<Pending | null>(null);
  // A view the share step already created: a retry shares it instead of saving a second one.
  const created = useRef<{ id: string; version: number } | null>(null);
  // Settles the selector's pending switch: true only when the save finished.
  const saveAsDone = useRef<{ resolve: (ok: boolean) => void; ok: boolean } | null>(null);
  const searchPeople = useCallback((q: string, signal: AbortSignal): Promise<readonly GroupMember[]> => store.searchPeople(q, signal), [store]);

  const fail = (reason: Extract<Result<never>, { ok: false }>['reason']) => failureText({ ok: false, reason }, tx);
  const report = (result: Result<unknown>, done: string): boolean => {
    if (result.ok) toast(done, 'info'); else toast(fail(result.reason), 'warning');
    return result.ok;
  };
  const pickFailed = (outcome: SelectOutcome) => {
    if (outcome.ok) return;
    const keys = {
      'wrong-menu': 'savedViewWrongMenu',
      'stale-schema': 'savedViewStaleSchema',
      unavailable: 'savedViewUnavailable',
      denied: 'savedViewDenied',
    } as const;
    toast(m(keys[outcome.reason]), 'warning');
  };

  // Focus goes back to the selector after a surface that has no trigger of its own; deferred so it lands after the dialog's own cleanup.
  const [returnFocus, setReturnFocus] = useState(0);
  useEffect(() => {
    if (returnFocus === 0) return;
    const timer = setTimeout(() => wrapper.current?.querySelector<HTMLElement>('button')?.focus(), 0);
    return () => clearTimeout(timer);
  }, [returnFocus]);

  // The save dialog hands over to the share step only after it closed, so focus returns to the save menu button first and the picker remembers it.
  useEffect(() => {
    if (saveOpen || !handoff) return;
    const timer = setTimeout(() => { setHandoff(false); setShareOpen(true); }, 0);
    return () => clearTimeout(timer);
  }, [saveOpen, handoff]);

  useEffect(() => {
    let live = true;
    setGroups(previous => ({ ...previous, status: 'loading' }));
    store.listGroups().then(entries => { if (live) setGroups({ status: 'ready', entries }); }, () => { if (live) setGroups(previous => ({ ...previous, status: 'error' })); });
    return () => { live = false; };
  }, [shareOpen, store, groupTick]);

  const items = useMemo(() => [...views.menuViews, ...views.conditionSets], [views.menuViews, views.conditionSets]);
  const diagnoses = useMemo(() => {
    const result: Record<string, SavedViewDiagnosis> = {};
    const known = axes.map(axis => axis.id);
    for (const item of entriesOf(items)) result[item.view.id] = diagnoseSavedView(item.view, support, { capabilities: item.capabilities, knownAxisIds: known });
    return result;
  }, [items, support, axes]);

  // What a waiting application changes comes from the store, for the requester or an approver only; read when 뷰 관리 opens or the list changes.
  useEffect(() => {
    if (!manageOpen) return;
    let live = true;
    Promise.all([store.listApprovalRequests({ userId, menuId: support.menuId }), store.listApprovalRequests({ userId, menuId: null })]).then(
      lists => { if (live) setRequests(Object.fromEntries(lists.flat().map(({ viewId, ...rest }) => [viewId, { viewId, ...rest }]))); },
      () => { if (live) setRequests({}); },
    );
    return () => { live = false; };
  }, [manageOpen, store, userId, support.menuId, items]);
  // Names of people the surface actually shows (owners, people shared with, requesters of visible entries), by exact id through the adapter; a denied entry contributes nothing.
  const [looked, setLooked] = useState<ReadonlyMap<string, string>>(new Map());
  const lookupKey = useMemo(() => {
    const ids = new Set<string>();
    for (const { view } of entriesOf(items)) { ids.add(view.ownerId); if (view.visibility.kind === 'people') view.visibility.userIds.forEach(id => ids.add(id)); }
    Object.values(requests).forEach(request => ids.add(request.requestedBy));
    ids.delete(userId);
    return [...ids].sort().join('\n');
  }, [items, requests, userId]);
  const { adapter } = host;
  useEffect(() => {
    if (lookupKey === '') return;
    const ids = lookupKey.split('\n');
    const controller = new AbortController();
    let live = true;
    const chunks: string[][] = [];
    for (let at = 0; at < ids.length; at += PEOPLE_LOOKUP_MAX) chunks.push(ids.slice(at, at + PEOPLE_LOOKUP_MAX));
    // A failed chunk falls through silently: the name then comes from the group members or the opaque id.
    Promise.all(chunks.map(chunk => adapter.lookupPeople(chunk, controller.signal).then(found => found, () => [] as readonly GroupMember[]))).then(found => {
      if (!live) return;
      setLooked(previous => new Map([...previous, ...found.flat().filter(person => person.displayName !== '').map(person => [person.userId, person.displayName] as const)]));
    });
    return () => { live = false; controller.abort(); };
  }, [lookupKey, adapter]);
  const people = useMemo(() => new Map([...groups.entries.flatMap(entry => entry.members.map(member => [member.userId, member.displayName] as const)), ...looked]), [groups.entries, looked]);
  const groupNames = useMemo(() => new Map(groups.entries.map(entry => [entry.group.id, entry.group.name] as const)), [groups.entries]);

  const { modified, unsaved, unapplied } = views.state;
  const ownerName = (id: string) => (id === userId ? host.user.name : people.get(id) ?? id);
  const staleIds = useMemo(() => new Set(Object.entries(diagnoses).flatMap(([id, found]) => (found.status === 'stale' ? [id] : []))), [diagnoses]);
  const state: ViewSelectorState = modified ? 'modified' : unsaved ? 'unsaved' : unapplied ? 'unapplied' : 'clean';
  const selected = views.selected;
  // Conditions the screen was opened with (or that a cleared selection left) are not the user's edit: with no view, only a change after that point is worth a confirmation.
  const appliedNow = useMemo(() => JSON.stringify(captureApplied({ global: host.global, page: host.page }, support)), [host.global, host.page, support]);
  const selectedId = selected?.view.id ?? null;
  // An edited view that a reread no longer lists readably (deleted elsewhere, access revoked) leaves the edit the user's own: `kept` holds it dirty until the selection changes (#2046).
  // A selection cleared while the view is still listed (address arrival, a failed pick, the user's own delete) starts clean as before.
  const [baseline, setBaseline] = useState({ id: selectedId, key: appliedNow, edited: modified, kept: false });
  if (baseline.id !== selectedId) {
    const lost = selectedId === null && baseline.id !== null && baseline.edited && !entriesOf(items).some(entry => entry.view.id === baseline.id);
    setBaseline({ id: selectedId, key: appliedNow, edited: modified, kept: lost });
  } else if (selectedId !== null && baseline.edited !== modified) setBaseline({ ...baseline, edited: modified });
  const discards = modified || unapplied || (unsaved && (baseline.kept || appliedNow !== baseline.key));
  const updatable = selected?.capabilities.canEdit ? { name: selected.view.name, unit: selected.view.kind } : undefined;

  // A save holds the applied conditions only; with an unapplied draft the user is told the draft is lost, and cancelling saves nothing.
  const confirmDraft = () => new Promise<boolean>(resolve => { setDraftAsk(() => resolve); });
  const saveCurrent = async (): Promise<boolean> => {
    if (unapplied && !(await confirmDraft())) return false;
    return report(await views.saveToSelected(), m('savedViewUpdated'));
  };
  const openSave = (mode: 'new' | 'update') => new Promise<boolean>(resolve => { saveAsDone.current = { resolve, ok: false }; setSaveMode(mode); setSaveOpen(true); });
  const closeSave = (open: boolean) => {
    setSaveOpen(open);
    if (open) return;
    const done = saveAsDone.current;
    saveAsDone.current = null;
    // Sharing finishes in the picker, so a pending switch waits for the user to pick again.
    done?.resolve(done.ok && !pending.current);
  };
  const submit = async (input: { mode: 'new' | 'update'; unit: 'condition-set' | 'menu-view'; name: string; visibility: string }): Promise<Result<unknown>> => {
    let result: Result<unknown>;
    if (input.mode === 'update') result = await views.saveToSelected();
    else if (input.visibility === 'share') { pending.current = { unit: input.unit, name: input.name }; setHandoff(true); return { ok: true, value: null }; }
    else result = await views.saveAs({ name: input.name, kind: input.unit });
    if (result.ok) { toast(input.mode === 'update' ? m('savedViewUpdated') : m('savedViewSavedAs', { name: input.name }), 'info'); if (saveAsDone.current) saveAsDone.current.ok = true; }
    return result;
  };

  // Visibility is decided only here, after the user confirmed `공유 대상 저장`. The picker closes only on a store `ok`; a refusal keeps the name,
  // the unit and the chosen targets, and a view this step already created is shared again on retry instead of being saved twice.
  const confirmShare = async (draft: ShareTargetDraft): Promise<boolean> => {
    const made = pending.current;
    if (!made) return false;
    setShareError(null);
    const refused = (reason: Extract<Result<never>, { ok: false }>['reason'], saved: boolean) => {
      const text = saved
        ? m('savedViewSavedShareFailed', { name: made.name, reason: fail(reason) })
        : m('savedViewSaveFailed', { name: made.name, reason: fail(reason) });
      setShareError(text);
      return false;
    };
    try {
      if (!created.current) {
        const saved = await views.saveAs({ name: made.name, kind: made.unit });
        if (!alive.current) return false;
        if (!saved.ok) return refused(saved.reason, false);
        created.current = { id: saved.value.view.id, version: saved.value.view.version };
      }
      const { id, version } = created.current;
      const at = { expectedVersion: version };
      const visibility: ViewVisibility = draft.mode === 'people' ? { kind: 'people', userIds: draft.people.map(p => p.userId) } : { kind: 'groups', groupIds: [...draft.groupIds] };
      const shared = draft.mode === 'private' ? null : draft.mode === 'official' ? await views.requestOfficial(id, at) : await views.setVisibility(id, visibility, at);
      if (!alive.current) return false;
      if (shared !== null && !shared.ok) {
        if (shared.reason !== 'conflict') return refused(shared.reason, true);
        // The view changed since this step read it, possibly by this step's own earlier try whose answer was lost: reread it, so a retry goes at
        // the current version, and a share that is already in place counts as done instead of a refusal (#2046).
        let now: SavedViewListItem | null;
        try { now = await store.get(id); } catch { now = null; }
        if (!alive.current) return false;
        // The conflict text says the latest version was loaded: a denied reread says so, a failed or missing one is unavailable.
        if (now?.denied) return refused('forbidden', true);
        if (!now || created.current?.id !== id) return refused('unavailable', true);
        created.current = { id, version: now.view.version };
        if (!shareApplied(now.view, draft.mode === 'official', visibility)) return refused('conflict', true);
      }
      pending.current = null;
      created.current = null;
      if (shared === null) { toast(m('savedViewSavedAs', { name: made.name }), 'info'); return true; }
      toast(draft.mode === 'official' ? m('savedViewSavedOfficialRequested', { name: made.name }) : m('savedViewSavedShared', { name: made.name }), 'info');
      return true;
    } catch {
      return alive.current ? refused('unavailable', created.current !== null) : false;
    }
  };

  const migrate = async (id: string) => {
    const item = entriesOf(items).find(entry => entry.view.id === id);
    const diagnosis = diagnoses[id];
    if (!item || diagnosis?.status !== 'stale' || !diagnosis.migration) return;
    let next: SavedView;
    try { next = diagnosis.migration.apply(); } catch { report({ ok: false, reason: 'unavailable' }, ''); return; }
    const done = m('savedViewMigrated', { name: item.view.name });
    const patch = next.kind === 'menu-view' ? { menuSchemaVersion: support.menuSchemaVersion, context: next.context, page: next.page, chartOptions: next.chartOptions, layout: next.layout, panels: next.panels } : { context: next.context };
    report(await views.update(id, patch, { expectedVersion: item.view.version }), done);
  };

  const excluded = views.unsupported.map(item => item.key);
  const panelCount = (view: SavedView) => view.kind === 'menu-view' && Array.isArray(view.panels) ? view.panels.length : 0;
  const panels = selected ? panelCount(selected.view) : 0;
  const note = (excluded.length > 0 || panels > 0)
    ? [panels > 0 ? m('savedViewPanelCount', { count: panels }) : '', excluded.length > 0 ? m('savedViewExcludedKeys', { keys: excluded.join(', ') }) : ''].filter(Boolean).join(' · ')
    : '';

  return <span ref={wrapper} className="inline-flex flex-wrap items-center gap-1">
    <ViewSelector
      views={items} currentId={selected?.view.id ?? null} defaultId={views.defaultId} state={state} discardsChanges={discards}
      loading={views.status === 'loading'} error={views.status === 'unavailable'} onRetry={views.refresh}
      groups={groups.entries.map(entry => ({ id: entry.group.id, name: entry.group.name }))} query={query} onQuery={setQuery} filter={filter} onFilter={setFilter} userId={userId} ownerLabel={ownerName} staleIds={staleIds} panelCount={panelCount}
      onSelect={id => { void views.select(id).then(pickFailed); }}
      onSave={saveCurrent} onSaveAs={() => openSave('new')} saveTriggerRef={saveTrigger}
      onRevert={() => { void views.revertToSaved().then(pickFailed); }}
      onMakeDefault={id => { void views.setDefault(id).then(result => report(result, id === null ? m('savedViewDefaultCleared') : m('savedViewDefaultSet'))); }}
      onDelete={id => { void views.remove(id).then(result => report(result, m('savedViewDeleted'))); }}
      onManage={() => setManageOpen(true)}
    />
    {note && <span role="status" className="max-w-56 truncate text-xs text-text-secondary" title={note}>{note}</span>}
    <SaveViewDialog
      key={saveMode} open={saveOpen} onOpenChange={closeSave} units={['menu-view', 'condition-set']} {...(updatable ? { updatable } : {})} initialMode={saveMode}
      context={captureApplied({ global: host.global, page: [] }, support).context} hasDraft={unapplied} returnFocusRef={saveTrigger}
      visibilityOptions={[{ value: 'private', label: m('savedViewVisibilityPrivate') }, { value: 'share', label: m('savedViewVisibilityShare') }]}
      onSubmit={submit}
    />
    <ShareTargetPicker
      lang={lang}
      open={shareOpen} onOpenChange={next => { setShareOpen(next); if (!next) { pending.current = null; created.current = null; setShareError(null); } }} value={{ mode: 'groups', people: [], groupIds: [] }}
      groups={{ ...groups, retry: () => setGroupTick(n => n + 1) }} currentUserId={userId} searchPeople={searchPeople}
      onCreateGroup={views.createGroup}
      onUpdateGroup={views.updateGroup} onConfirm={confirmShare} confirmError={shareError}
    />
    <ViewManagement
      open={manageOpen} onOpenChange={next => { setManageOpen(next); if (!next) setReturnFocus(n => n + 1); }} entries={items} diagnoses={diagnoses} requests={requests} currentUserId={userId} personName={id => people.get(id) ?? id} groupName={id => groupNames.get(id) ?? id}
      onDecide={async (id, decision, noteText, expectedVersion) => { return views.decide(id, decision, noteText, { expectedVersion }); }}
      onRevoke={async (id, expectedVersion) => { return views.revoke(id, { expectedVersion }); }}
      onMigrate={id => { void migrate(id); }}
    />
    <DirtyConfirmation
      open={draftAsk !== null} onCancel={() => { draftAsk?.(false); setDraftAsk(null); }} onConfirm={() => { draftAsk?.(true); setDraftAsk(null); }}
      title={m('savedViewDraftTitle')}
      message={m('savedViewDraftMessage')}
      confirmLabel={m('savedViewDraftConfirm')} cancelLabel={t('cancel')}
    />
  </span>;
}
