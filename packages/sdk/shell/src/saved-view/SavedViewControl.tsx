import { PICK_FAILURE_KEYS, useSavedViewPickWarning, type PickFailure } from './useSavedViewPickWarning';
import { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { PEOPLE_LOOKUP_MAX, type ApprovalRequestInfo, type GroupMember, type SavedViewSupport, type Result, type SavedView, type SavedViewListItem, type SavedViewStore, type ViewVisibility } from '@ap/contracts';
import { CONTEXT_LABELS, diagnoseSavedView, useEquipmentAxes, useI18n, useMessages, type SavedViewDiagnosis } from '@ap/kernel';
import { captureApplied, prepareSavedViewPreview, useAnalysisSelectionLabels, useHostPlatform, useMyMenus, useSavedViews, type SavedViews } from '@ap/kernel/host';
import { DirtyConfirmation } from '@ap/ui';
import { failureText, SaveViewDialog, ShareTargetPicker, ViewManagement, ViewSelector, type SaveViewDialogProps, type ShareGroupsState, type ShareTargetDraft, type ViewFilter, type ViewSelectorState } from '@ap/components';
import { SHELL_MESSAGES } from '../messages';
import { QueryBarTools } from '../context/queryBarTools';
import { OpenApprovalReview } from './approvalReview';

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
  const reportViewAvailable = useContext(QueryBarTools)?.reportViewAvailable;
  const available = screenMode !== 'pane' && views.status !== 'disabled' && !!savedViewStore && !!views.support;
  useLayoutEffect(() => {
    reportViewAvailable?.(available);
    return () => reportViewAvailable?.(false);
  }, [available, reportViewAvailable]);
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

type Pending = { unit: 'condition-set' | 'menu-view'; name: string; myMenu?: true };
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

function Ready({ views, store, support }: { views: SavedViews; store: Pick<SavedViewStore, 'get' | 'listGroups' | 'listApprovalRequests' | 'searchPeople' | 'listMyMenus'>; support: SavedViewSupport }) {
  const host = useHostPlatform();
  const { selectionRequest } = useMyMenus();
  const selectionLabel = useAnalysisSelectionLabels(host);
  const openReview = useContext(OpenApprovalReview);
  const reviewAttempt = useRef(0);
  const tools = useContext(QueryBarTools);
  const external = tools?.folded ? tools : null;
  const axes = useEquipmentAxes();
  const { lang, t, tx } = useI18n();
  const m = useMessages(SHELL_MESSAGES);
  const userId = host.user.id;
  // False once this surface was replaced or unmounted: its pending writes may finish, but nothing of theirs reaches the screen, the toasts or the parent.
  const alive = useRef(true);
  useLayoutEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const toast = (text: string, options?: Parameters<typeof host.toast>[1]) => { if (alive.current) host.toast(text, options); };
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

  const reasons = views.saveBlocked.map(reason => {
    const text = typeof reason === 'string' ? reason : tx(reason);
    return text.trim() ? text : m('savedViewBlocked');
  });
  const [firstReason] = reasons;
  const saveBlock = firstReason === undefined ? undefined : {
    summary: reasons.length === 1 ? firstReason : m('savedViewBlockedMore', { reason: firstReason, count: reasons.length - 1 }),
    reasons: reasons.join('\n'),
  };
  const blockedMessage = saveBlock?.reasons ?? m('savedViewBlocked');
  const fail = (reason: Extract<Result<never>, { ok: false }>['reason']) => failureText({ ok: false, reason }, tx);
  const report = (result: Result<unknown> & { code?: 'blocked' }, done: string): boolean => {
    if (result.ok) toast(done); else toast(result.code === 'blocked' ? blockedMessage : fail(result.reason), { tone: 'warning' });
    return result.ok;
  };
  const pickFailed = useSavedViewPickWarning(toast);
  const pickFailureText = (reason: PickFailure) => m(PICK_FAILURE_KEYS[reason]);

  // Focus goes back to the selector after a surface that has no trigger of its own; deferred so it lands after the dialog's own cleanup.
  const [returnFocus, setReturnFocus] = useState(0);
  useEffect(() => {
    if (returnFocus === 0) return;
    const timer = setTimeout(() => (external?.anchorRef.current ?? wrapper.current?.querySelector<HTMLElement>('button'))?.focus(), 0);
    return () => clearTimeout(timer);
  }, [returnFocus, external?.anchorRef]);

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

  // The queue supplies actionable applications and rejection receipts when 뷰 관리 opens or the list changes.
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
  const readPending = async (id: string) => {
    const item = await store.get(id);
    if (!item || item.denied || !item.capabilities.canView || item.view.id !== id || item.view.kind !== 'menu-view'
      || item.view.menuId !== support.menuId || item.view.approval !== 'pending') return null;
    return { view: item.view, capabilities: item.capabilities };
  };
  const startReview = async (id: string) => {
    if (!openReview) return;
    const attempt = ++reviewAttempt.current;
    const unavailable = { ok: false, reason: 'unavailable' } as const;
    const current = () => alive.current && reviewAttempt.current === attempt && host.isCurrentGeneration();
    try {
      const item = await readPending(id);
      if (!current()) return;
      if (!item) { pickFailed(unavailable); return; }
      const ownRequest = item.view.ownerId === userId;
      // Owners can review from the view read alone. Any queue metadata already loaded for them is display-only.
      const metadata = ownRequest ? requests[id] : (await store.listApprovalRequests({ userId, menuId: support.menuId })).find(info => info.viewId === id);
      if (!current()) return;
      const request = metadata?.targetVersion === item.view.version && metadata.requestedBy === item.view.ownerId ? metadata : undefined;
      if (ownRequest ? !item.capabilities.canWithdraw : !request || !item.capabilities.canApprove) { pickFailed(unavailable); return; }
      const proposal = prepareSavedViewPreview(item.view, support, host);
      const canApprove = 'href' in proposal;
      const copy = request?.approvedCopy;
      const previous = copy?.id === id && copy.approval === 'approved' ? prepareSavedViewPreview(copy, support, host) : null;
      const scope = host.session.scopes.find(option => option.id === host.scope.scopeId)?.label ?? host.scope.scopeId ?? t('scopeNone');
      openReview({ proposal: canApprove
        ? { view: item.view, href: proposal.href }
        : { view: item.view, reason: pickFailureText(proposal.reason) },
        ...(copy && previous && 'href' in previous ? { approved: { view: copy, href: previous.href } } : {}),
        ...(request && { request }),
        requester: ownerName(item.view.ownerId),
        frame: { scope, canDecide: !ownRequest, canApprove, canWithdraw: ownRequest, onAction: async (action, reason) => {
          if (!current()) return unavailable;
          let result: Result<unknown>;
          if (action === 'withdraw') {
            if (!ownRequest) return unavailable;
            const latest = await readPending(id).catch(() => null);
            if (!current() || !latest || latest.view.ownerId !== userId || !latest.capabilities.canWithdraw) return unavailable;
            result = await views.withdraw(id, { expectedVersion: latest.view.version });
          } else {
            if (ownRequest || !request || (action === 'approve' && !canApprove)) return unavailable;
            result = await views.decide(id, action, reason, { expectedVersion: request.targetVersion });
          }
          if (result.ok) toast(m('savedViewReviewDone'));
          return result;
        } },
      });
      setManageOpen(false);
    } catch { if (current()) pickFailed(unavailable); }
  };
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
  const [scopeAsk, setScopeAsk] = useState<((ok: boolean) => void) | null>(null);
  const confirmScope = () => new Promise<boolean>(resolve => { setScopeAsk(() => resolve); });
  // Context keys read as condition names; panel input keys (#2862) read as the menu's declared selection label, the key only
  // when none is declared (#3139, ADR-0034); any other key stays as declared.
  const panelText = (key: string) => { const label = selectionLabel(key); return label ? tx(label) : key; };
  const keyText = (keys: readonly string[], panelKeys: readonly string[] = []) => keys.map(key => panelKeys.includes(key) ? panelText(key) : Object.hasOwn(CONTEXT_LABELS, key) ? tx(CONTEXT_LABELS[key as keyof typeof CONTEXT_LABELS]) : key).join(', ');
  const saveCurrent = async (): Promise<boolean> => {
    if (saveBlock) return false;
    if (unapplied && !(await confirmDraft())) return false;
    // Saving across Scopes drops the Site-bound values saved elsewhere: ask first, and point at 새 뷰로 저장 (#2175).
    if (views.crossScopeSave && !(await confirmScope())) return false;
    return report(await views.saveToSelected(), m('savedViewUpdated'));
  };
  const openSave = (mode: 'new' | 'update') => {
    if (saveBlock) return Promise.resolve(false);
    return new Promise<boolean>(resolve => { saveAsDone.current = { resolve, ok: false }; setSaveMode(mode); setSaveOpen(true); });
  };
  const closeSave = (open: boolean) => {
    setSaveOpen(open);
    if (open) return;
    const done = saveAsDone.current;
    saveAsDone.current = null;
    // Sharing finishes in the picker, so a pending switch waits for the user to pick again.
    done?.resolve(done.ok && !pending.current);
  };
  const submit: SaveViewDialogProps['onSubmit'] = async input => {
    if (saveBlock) return { ok: false, reason: 'invalid', detail: blockedMessage };
    let result: Awaited<ReturnType<SavedViews['saveAs']>>;
    if (input.mode === 'update') { if (views.crossScopeSave && !(await confirmScope())) return { ok: false, reason: 'unavailable' }; result = await views.saveToSelected(); }
    else if (input.visibility === 'share') { pending.current = { unit: input.unit, name: input.name, myMenu: input.myMenu }; setHandoff(true); return { ok: true, value: null }; }
    else result = await views.saveAs({ name: input.name, kind: input.unit, myMenu: input.myMenu });
    if (!result.ok && 'code' in result) return { ...result, detail: blockedMessage };
    if (result.ok) { toast(input.mode === 'update' ? m('savedViewUpdated') : m('savedViewSavedAs', { name: input.name })); if (saveAsDone.current) saveAsDone.current.ok = true; }
    return result;
  };

  // Visibility is decided only here, after the user confirmed `공유 대상 저장`. The picker closes only on a store `ok`; a refusal keeps the name,
  // the unit and the chosen targets, and a view this step already created is shared again on retry instead of being saved twice.
  const confirmShare = async (draft: ShareTargetDraft): Promise<boolean> => {
    const made = pending.current;
    if (!made || saveBlock) return false;
    setShareError(null);
    const refused = (reason: Parameters<typeof fail>[0], saved: boolean) => {
      const text = saved
        ? m('savedViewSavedShareFailed', { name: made.name, reason: fail(reason) })
        : m('savedViewSaveFailed', { name: made.name, reason: fail(reason) });
      setShareError(text);
      return false;
    };
    try {
      if (!created.current) {
        const saved = await views.saveAs({ name: made.name, kind: made.unit, myMenu: made.myMenu });
        if (!alive.current) return false;
        if (!saved.ok) return 'code' in saved ? false : refused(saved.reason, false);
        created.current = { id: saved.value.view.id, version: saved.value.view.version };
      }
      const { id, version } = created.current;
      const at = { expectedVersion: version };
      const visibility: ViewVisibility = draft.mode === 'people' ? { kind: 'people', userIds: draft.people.map(p => p.userId) } : { kind: 'groups', groupIds: [...draft.groupIds] };
      if (draft.mode !== 'private' && views.readSaveBlocks().length > 0) return false;
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
      if (shared === null) { toast(m('savedViewSavedAs', { name: made.name })); return true; }
      toast(draft.mode === 'official' ? m('savedViewSavedOfficialRequested', { name: made.name }) : m('savedViewSavedShared', { name: made.name }));
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
    const patch = next.kind === 'menu-view' ? { menuSchemaVersion: support.menuSchemaVersion, context: next.context, page: next.page, chartOptions: next.chartOptions, layout: next.layout, panels: next.panels, ...(next.tables === undefined ? {} : { tables: next.tables }) } : { context: next.context };
    report(await views.update(id, patch, { expectedVersion: item.view.version }), done);
  };

  // Context keys read as Korean condition names; a menu-declared page key has no shared label and stays as declared.
  const excluded = views.unsupported.map(item => item.kind === 'context' ? keyText([item.key]) : item.key);
  const panelCount = (view: SavedView) => view.kind === 'menu-view' && !view.panelsUnreadable
    ? view.panels?.instances?.length ?? 0 : 0;
  const panels = selected ? panelCount(selected.view) : 0;
  const scoped = views.scopeExcluded;
  // The unsupported list and the other-Scope list stay apart: one is the menu's limit, the other a rule of the Scope (#2175).
  const scopeNote = scoped ? m('savedViewScopeExcluded', { keys: keyText(scoped.keys, scoped.panelKeys) }) : '';
  // The saved Scope is named only when the viewer's own Scope list has it; a shared viewer gets no raw id of a Scope they hold no grant for (#2175).
  const scopeName = (id: string) => host.session.scopes.find(option => option.id === id)?.label ?? null;
  const savedIn = scoped ? scopeName(scoped.savedScopeId) : null;
  const scopeFull = scoped ? (savedIn === null ? m('savedViewScopeExcludedOther', { keys: keyText(scoped.keys, scoped.panelKeys) }) : m('savedViewScopeExcludedFull', { scope: savedIn, keys: keyText(scoped.keys, scoped.panelKeys) })) : '';
  const note = (excluded.length > 0 || panels > 0 || scoped)
    ? [panels > 0 ? m('savedViewPanelCount', { count: panels }) : '', excluded.length > 0 ? m('savedViewExcludedKeys', { keys: excluded.join(', ') }) : '', scopeNote].filter(Boolean).join(' · ')
    : '';
  const noteTitle = [note, scopeFull].filter(Boolean).join('\n');
  const noteText = note && <span role="status" className="break-words text-xs text-text-secondary" title={noteTitle}>{note}</span>;
  const cross = views.crossScopeSave;
  // Context keys take this Scope's values; held panel sets do not, they are saved as the panels' inputs now are (#2862 R2862C-2 C5).
  const crossPanels = cross?.panelKeys ?? [];
  const crossContext = cross ? cross.keys.filter(key => !crossPanels.includes(key)) : [];
  const crossScope = cross ? scopeName(cross.savedScopeId) : null;
  const crossScopeMessage = !cross ? '' : crossContext.length === 0
    ? (crossScope === null ? m('savedViewCrossScopePanelsOnlyOther', { keys: crossPanels.map(panelText).join(', ') }) : m('savedViewCrossScopePanelsOnly', { scope: crossScope, keys: crossPanels.map(panelText).join(', ') }))
    : [
      crossScope === null ? m('savedViewCrossScopeMessageOther', { keys: keyText(crossContext) }) : m('savedViewCrossScopeMessage', { scope: crossScope, keys: keyText(crossContext) }),
      crossPanels.length ? m('savedViewCrossScopePanels', { keys: crossPanels.map(panelText).join(', ') }) : '',
    ].filter(Boolean).join(' ');
  const picker = external ? { open: external.active === 'view', onOpenChange: (open: boolean) => { if (!open) external.close(); }, anchorRef: external.anchorRef, note: noteText } : undefined;

  return <span ref={wrapper} className="inline-flex flex-wrap items-center gap-1">
    <ViewSelector
      picker={picker}
      views={items} currentId={selected?.view.id ?? null} defaultId={views.defaultId} state={state} discardsChanges={discards}
      selectionDisabled={host.queryPolicy.autoApplyingDefault === true}
      selectionRequest={selectionRequest && {
        ...selectionRequest,
        onSelect: id => { void views.select(id, { via: 'my-menus' }).then(pickFailed); },
      }}
      loading={views.status === 'loading'} error={views.status === 'unavailable'} onRetry={views.refresh}
      groups={groups.entries.map(entry => ({ id: entry.group.id, name: entry.group.name }))} query={query} onQuery={setQuery} filter={filter} onFilter={setFilter} userId={userId} ownerLabel={ownerName} staleIds={staleIds} panelCount={panelCount}
      onSelect={id => { void views.select(id).then(pickFailed); }}
      onSave={saveCurrent} onSaveAs={() => openSave('new')} saveTriggerRef={saveTrigger}
      saveBlock={saveBlock}
      onRevert={() => { void views.revertToSaved().then(pickFailed); }}
      onToggleMyMenu={store.listMyMenus ? async id => {
        const item = entriesOf(items).find(entry => entry.view.id === id);
        if (item?.view.kind !== 'menu-view' || !item.capabilities.canEdit) return;
        const result = await views.update(id, { myMenu: !item.view.myMenu }, { expectedVersion: item.view.version });
        if (!result.ok) toast(fail(result.reason), { tone: 'warning' });
      } : undefined}
      onMakeDefault={id => { void views.setDefault(id).then(result => report(result, id === null ? m('savedViewDefaultCleared') : m('savedViewDefaultSet'))); }}
      onDelete={id => { void views.remove(id).then(result => report(result, m('savedViewDeleted'))); }}
      onManage={() => setManageOpen(true)}
    />
    {!external && note && <span role="status" className="max-w-56 truncate text-xs text-text-secondary" title={noteTitle}>{note}</span>}
    <SaveViewDialog
      key={saveMode} open={saveOpen} onOpenChange={closeSave} units={['menu-view', 'condition-set']} {...(updatable ? { updatable } : {})} initialMode={saveMode}
      context={captureApplied({ global: host.global, page: [] }, support).context} hasDraft={unapplied} returnFocusRef={external?.anchorRef ?? saveTrigger}
      visibilityOptions={[{ value: 'private', label: m('savedViewVisibilityPrivate') }, { value: 'share', label: m('savedViewVisibilityShare') }]}
      showMyMenus={store.listMyMenus !== undefined}
      onSubmit={submit}
      saveBlock={saveBlock}
    />
    <ShareTargetPicker
      lang={lang}
      open={shareOpen} onOpenChange={next => { setShareOpen(next); if (!next) { pending.current = null; created.current = null; setShareError(null); } }} value={{ mode: 'groups', people: [], groupIds: [] }}
      groups={{ ...groups, retry: () => setGroupTick(n => n + 1) }} currentUserId={userId} searchPeople={searchPeople}
      onCreateGroup={views.createGroup}
      onUpdateGroup={views.updateGroup} onConfirm={confirmShare} confirmError={shareError}
      saveBlock={saveBlock}
    />
    <ViewManagement
      open={manageOpen} onOpenChange={next => { setManageOpen(next); if (!next) { reviewAttempt.current += 1; setReturnFocus(n => n + 1); } }} entries={items} diagnoses={diagnoses} requests={requests} currentUserId={userId} personName={id => people.get(id) ?? id} groupName={id => groupNames.get(id) ?? id}
      onOpenReview={openReview ? id => { void startReview(id); } : undefined}
      onDecide={async (id, decision, noteText, expectedVersion) => { return views.decide(id, decision, noteText, { expectedVersion }); }}
      onRevoke={async (id, expectedVersion) => { return views.revoke(id, { expectedVersion }); }}
      onMigrate={id => { void migrate(id); }}
    />
    <DirtyConfirmation
      open={scopeAsk !== null} onCancel={() => { scopeAsk?.(false); setScopeAsk(null); }} onConfirm={() => { scopeAsk?.(true); setScopeAsk(null); }}
      title={m('savedViewCrossScopeTitle')}
      message={crossScopeMessage}
      confirmLabel={m('savedViewCrossScopeConfirm')} cancelLabel={t('cancel')}
      confirmBlock={saveBlock}
    />
    <DirtyConfirmation
      open={draftAsk !== null} onCancel={() => { draftAsk?.(false); setDraftAsk(null); }} onConfirm={() => { draftAsk?.(true); setDraftAsk(null); }}
      title={m('savedViewDraftTitle')}
      message={m('savedViewDraftMessage')}
      confirmLabel={m('savedViewDraftConfirm')} cancelLabel={t('cancel')}
      confirmBlock={saveBlock}
    />
  </span>;
}
