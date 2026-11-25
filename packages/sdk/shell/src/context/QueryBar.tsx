import { TargetPicker, TARGET_KEYS, type TargetPickerRequest } from './TargetPicker';
import { useCustomGroupOptions } from './customGroupOptions';
import { createPortal } from 'react-dom';
import { isValidElement, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, MoreHorizontal, Pin, PinOff } from 'lucide-react';
import { CUSTOM_GROUP_AXIS, formatPeriod, periodDates, periodFromDates, type GlobalContext, type IdSet } from '@ap/contracts';
import { useConditionPreset, queryMissingSentence, useI18n, useMessages, useQueryDraft } from '@ap/kernel';
import { useHostPlatform } from '@ap/kernel/host';
import { useRegisterContextEditorFocus, useCollapsePreference, AccessRequestEntry, WorkspaceQueryBarRow, formatQuerySummary, presetOutsideAxes, scopeRequestTarget, useScopeAccessRequest, querySummaryItems, SegmentedRadio, summaryPreset, useCompactPageDensity, useQueryBarExtension, useReportQueryBarStatus } from '@ap/components';
import { AnalysisSelectionChipZone } from '@ap/components';
import { Alert, AlertDescription, Button, cn, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, Popover, PopoverContent, PopoverTrigger, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@ap/ui';
import { PeriodFields, type PeriodDates } from './PeriodFields';
import { useSessionKey } from '../frame/sessionKey';
import { SHELL_MESSAGES } from '../messages';
import { ShareControl } from './ShareControl';
import { QueryHistoryControl } from './QueryHistoryControl';
import { SavedViewControl } from '../saved-view/SavedViewControl';
import { QueryBarTools, type QueryBarTool } from './queryBarTools';
import { CONTEXT_CHIP, CONTEXT_CHIP_FILLED, CONTEXT_CHIP_TONE } from './contextChip';

const CONDITION_CHIP = { query: cn(CONTEXT_CHIP, CONTEXT_CHIP_TONE), page: cn(CONTEXT_CHIP, CONTEXT_CHIP_FILLED) };

export type QueryBarProps = {
  label?: { visible: string; region: string };
  /** Reserved for query history; selecting history must only restore the draft. */
  historySlot?: ReactNode;
  /** The Saved View selector (06 §21); sits beside history in the tool row, so no extra fixed row exists. */
  viewSlot?: ReactNode;
};

/** Remount transient editor state on logical screen/session switches; Kernel owns retained drafts. */
export function QueryBar(props: QueryBarProps) {
  const { route, paneId, session, revision, global, queryPolicy, queryDraft } = useHostPlatform();
  const m = useMessages(SHELL_MESSAGES);
  const [identity, setIdentity] = useState({ session, generation: 0 });
  if (identity.session !== session) setIdentity({ session, generation: identity.generation + 1 });
  const pending = queryDraft.applying || queryPolicy.autoApplyingDefault === true;
  const applyingText = m('queryApplying');
  const sessionKey = useSessionKey();
  const screenKey = `${sessionKey}:${paneId ?? 'main'}:${route?.menu.id}:${JSON.stringify(route?.params)}`;
  const [saidFor, setSaidFor] = useState(screenKey);
  const [announced, setAnnounced] = useState('');
  if (saidFor !== screenKey) {
    setSaidFor(screenKey);
    setAnnounced('');
  }
  useEffect(() => {
    setAnnounced(pending ? applyingText : '');
  }, [pending, applyingText, screenKey]);
  return <>
    <WorkspaceQueryBarRow render={(workspace, pinText) => <QueryBarSession key={JSON.stringify([identity.generation, revision, global.scopeId, paneId, route?.menu.id, route?.params])} {...props} workspace={workspace} pinText={pinText} />} />
    {/* Persistent polite region: mounts empty before pending status arrives, stays mounted across remounts, and portals outside the root so modal hideOthers does not hide sibling test probes directly. */}
    {typeof document !== 'undefined' && createPortal(<div aria-live="polite" aria-atomic="false" className="sr-only">{announced}</div>, document.body)}
  </>;
}
/**
 * The view slot keeps one React position while the bar folds: the action group is drawn in the header row when folded and under the
 * editor when open, and a node that moves between two React parents would remount (and lose a selected, edited view). The slot is
 * portalled into one host element that the visible action group adopts, so folding moves the DOM node but never the component.
 * Key each provider so registering or removing the compact workspace line also preserves the slot across layouts.
 */
function useStableSlot(slot: ReactNode) {
  const [host] = useState(() => (slot === undefined || slot === null || typeof document === 'undefined' ? null : Object.assign(document.createElement('span'), { className: 'inline-flex' })));
  const adopt = (parent: HTMLElement | null) => { if (host && parent && host.parentElement !== parent) parent.appendChild(host); };
  return { adopt, portal: host && slot ? createPortal(slot, host) : null, present: host !== null };
}

function QueryBarSession({ label, historySlot, viewSlot, workspace, pinText }: QueryBarProps & { workspace: boolean; pinText: { pin: string; unpin: string } }) {
  const stableView = useStableSlot(viewSlot);
  const stableHistory = useStableSlot(historySlot);
  const builtInView = isValidElement(viewSlot) && viewSlot.type === SavedViewControl;
  const builtInHistory = isValidElement(historySlot) && historySlot.type === QueryHistoryControl;
  const platform = useHostPlatform();
  const { route, global, scope, screenMode, equipmentAxes, session } = platform;
  const query = useQueryDraft();
  const { draft, dirty, missing, canApply, applying, setDraftGlobal, setDraftPage, apply, revert, reset } = query;
  const extension = useQueryBarExtension();
  const compact = useCompactPageDensity();
  const inset = compact ? 'px-4' : 'px-3';
  const { lang, t } = useI18n();
  const m = useMessages(SHELL_MESSAGES);
  const id = useId();
  const disclosure = useRef<HTMLButtonElement>(null);
  const [foldedLane, setFoldedLane] = useState<HTMLDivElement | null>(null);
  const [summaryProbe, setSummaryProbe] = useState<HTMLSpanElement | null>(null);
  const editor = useRef<HTMLDivElement>(null);
  const overflow = useRef<HTMLButtonElement>(null);
  const nextTool = useRef<QueryBarTool | null>(null);
  const [tool, setTool] = useState<QueryBarTool | null>(null);
  const [viewAvailable, setViewAvailable] = useState(false);
  const closeTool = useCallback(() => setTool(null), []);
  const focusOnOpen = useRef<'first' | 'period' | null>(null);
  const focusedApply = useRef<HTMLButtonElement | null>(null);
  const [targetRequest, setTargetRequest] = useState<TargetPickerRequest>();
  const clearTargetRequest = useCallback(() => setTargetRequest(undefined), []);
  const board = screenMode === 'pane';
  const preference = `platform:query-bar-collapsed:${route?.menu.id}`;
  // `null` = no stored choice yet. Without one, an arrival whose URL already carries an applied query starts collapsed (#1892);
  // a bar that cannot run yet (required conditions missing) starts expanded. A stored choice always wins.
  const collapsePreference = useCollapsePreference(preference, '', { defaultCollapsed: board ? true : null, persist: !board });
  const [pinned, setPinned] = useState(false);
  const [pagePinTarget, setPagePinTarget] = useState<HTMLDivElement | null>(null);
  const queryOpener = useRef<HTMLButtonElement | null>(null);
  const interactedOutside = useRef(false);
  const pinTrigger = useRef<HTMLButtonElement>(null);
  const [seenApply, setSeenApply] = useState(query.appliedRevision);
  if (query.appliedRevision !== seenApply) {
    setSeenApply(query.appliedRevision);
    if (query.appliedRevision !== undefined && !(workspace && pinned)) collapsePreference.choose(true);
  }
  const choice = collapsePreference.choice === null ? null : !collapsePreference.choice;
  const setChoice = (open: boolean) => collapsePreference.choose(!open);
  // Until the decision is taken an address with an applied period is drawn collapsed already, so the common deep link has no open-then-fold flash.
  const expanded = choice ?? !(global.from !== null && global.to !== null);
  // The pinned workspace still uses the context line's overflow as the tools' opener.
  const overflowTools = !expanded || (workspace && pinned);
  if (!overflowTools && tool !== null) setTool(null);
  const tools = { folded: overflowTools, active: tool, close: closeTool, anchorRef: overflow, reportViewAvailable: setViewAvailable };
  // Scope and metric validation settle after mount, so the arrival decision is taken once they have; an edit seals it as expanded.
  // A Scope that is absent or failed is a finished state that cannot run a query: it settles the decision as expanded, it does not wait.
  const scopeStatus = platform.scope.status;
  const scopeSettled = scopeStatus === 'valid' || scopeStatus === 'forbidden' || scopeStatus === 'unknown_scope' || scopeStatus === 'error' || (scopeStatus === 'none' && global.scopeId === null);
  const pendingDefault = platform.queryPolicy.autoApplyingDefault === true;
  const settled = !pendingDefault && platform.metricInit.phase === 'skip' && (platform.queryPolicy.ready || scopeSettled);
  if (choice === null && !pendingDefault && (dirty.length > 0 || settled)) {
    const applied = settled && platform.queryPolicy.ready && global.from !== null && global.to !== null && canApply && missing.length === 0 && dirty.length === 0 && !applying && !platform.queryPolicy.idle;
    setChoice(!applied);
  }
  const [editError, setEditError] = useState<string | null>(null);
  const [presetNotice, setPresetNotice] = useState({ id: '', text: '' });
  const conditionPreset = useConditionPreset();
  const accessRequest = useScopeAccessRequest();
  // Place (d) (ADR-0154 decision 6): a request entry under the room field while the validated Scope is only partially granted.
  const roomScope = scope.status === 'valid' && scope.validatedFor === session && scope.scopeId !== null ? session.scopes.find(option => option.id === scope.scopeId) : undefined;
  const roomRequest = (roomNames: IdSet, name: string) => accessRequest && roomScope && roomScope.grantedRooms < roomScope.totalRooms
    ? <AccessRequestEntry slot={accessRequest} size="field" label={t('accessRequestField', { name })} target={scopeRequestTarget(roomScope.id, roomNames, scope.grantedRooms)} />
    : null;
  const focusEditor = useCallback((to: 'first' | 'period') => {
    const selector = to === 'period' ? 'input[type="date"]:enabled' : 'button:enabled, input:enabled';
    const target = editor.current?.querySelector<HTMLElement>(selector) ?? (workspace ? pinTrigger.current : null);
    target?.focus({ preventScroll: true });
  }, [workspace]);
  useLayoutEffect(() => {
    if (workspace && expanded) {
      if (pinned) pinTrigger.current?.focus({ preventScroll: true });
      return;
    }
    if (expanded && focusOnOpen.current) focusEditor(focusOnOpen.current);
    focusOnOpen.current = null;
  }, [expanded, focusEditor, pinned, workspace]);
  useLayoutEffect(() => {
    const previous = focusedApply.current;
    if (!expanded && previous) {
      if (document.activeElement === document.body || document.activeElement === previous) disclosure.current?.focus();
      focusedApply.current = null;
    }
  }, [expanded, seenApply]);
  const focusQueryHandle = () => {
    const target = queryOpener.current?.isConnected ? queryOpener.current : disclosure.current;
    target?.focus({ preventScroll: true });
  };
  const toggle = (open: boolean) => {
    focusOnOpen.current = open ? 'first' : null;
    setChoice(open);
    if (!board) collapsePreference.toggle(!open);
    if (!open) {
      if (workspace) {
        setPinned(false);
        if (pinned) focusQueryHandle();
      } else disclosure.current?.focus();
    }
  };
  const write = (patch: Partial<GlobalContext>) => {
    try {
      // Explicitly removing the last membership owner must clear its basis in the same draft write.
      const next = { ...draft.global, ...patch };
      const removesOwner = 'condition' in patch || 'prcGroups' in patch;
      setDraftGlobal(removesOwner && next.condition === null && next.prcGroups === null ? { ...patch, membershipBasis: null } : patch);
      setEditError(null);
    }
    catch { setEditError(m('queryInvalidEdit')); }
  };
  const g = draft.global;
  const source = JSON.stringify([platform.url, g.from, g.to]);
  const [invalidDates, setInvalidDates] = useState<{ source: string; dates: PeriodDates } | null>(null);
  if (invalidDates && invalidDates.source !== source) setInvalidDates(null);
  const dates = invalidDates?.source === source ? invalidDates.dates : periodDates(g);
  const editPeriod = (next: PeriodDates) => {
    const period = periodFromDates(next);
    setInvalidDates(period ? null : { source, dates: next });
    if (period) write(period);
  };
  const cap = route!.menu.context;
  // A chosen custom group the query will refuse (ADR-0164): resolved here, where it outlives the folding editor, and said with the other reasons before Apply.
  const groups = useCustomGroupOptions({ scopeId: g.scopeId, selectedGroupIds: g.condition?.[CUSTOM_GROUP_AXIS] ?? NO_GROUPS, canEditCondition: cap.condition === 'apply' });
  const reasons = missing.map(item => ({ key: item.key, reason: item.key === 'customGroupMembershipBasis' ? m('customGroupCurrentOnly') : queryMissingSentence(lang, item.label) }));
  if (route!.menu.requiresScope && (scope.status !== 'valid' || scope.validatedFor !== session)) reasons.push({ key: 'scope', reason: m('queryScopeRequired') });
  if (applying || pendingDefault) reasons.push({ key: 'commit', reason: m('queryApplying') });
  const periodInputInvalid = invalidDates?.source === source;
  if (periodInputInvalid) reasons.push({ key: 'period-input', reason: m('queryInvalidPeriodInput') });
  if (editError) reasons.push({ key: 'edit', reason: editError });
  for (const issue of extension?.issues ?? []) reasons.push({ key: issue.key, reason: `${issue.label}: ${issue.reason}` });
  for (const group of groups.blocked) reasons.push({ key: `customGroup:${group.id}`, reason: m('customGroupBlockedNote', { id: group.id, reason: group.reason }) });
  if (!canApply && !reasons.length) reasons.push({ key: 'validation', reason: m('queryValidationError') });
  const reasonId = `${id}-reasons`;
  const summaryOptions = { lang, axes: equipmentAxes, context: cap, pageSummary: extension?.pageSummary };
  // The seeded default period is not a change (#913) but is not applied either: until Apply the summary still reads as the draft.
  // The period is one change however many of its ends moved (`오늘` moves both, `최근 7일` only `from`).
  const changes = new Set(dirty.map(key => key === 'from' || key === 'to' ? 'time' : key)).size;
  const notApplied = global.from === null && g.from !== null;
  const editing = dirty.length > 0 || notApplied;
  const conditionEditorKeys = pendingDefault ? [] : [
    ...TARGET_KEYS.filter(key => cap[key] === 'apply'),
    ...(cap.time === 'apply' && (g.from === null || g.to === null) ? ['time'] : []),
  ];
  const periodAwaitingApply = (global.from === null || global.to === null) && g.from !== null && g.to !== null;
  useReportQueryBarStatus({ folded: !expanded, editing, reasonKeys: workspace && !expanded ? [] : reasons.map(r => r.key), conditionEditorKeys, periodAwaitingApply });
  // The page-condition layer's «조회 조건에서 바꾸기»: open the editor when folded, else move focus into it.
  const requestEditor = (request?: TargetPickerRequest) => {
    if (workspace && !expanded) {
      queryOpener.current = request?.opener instanceof HTMLButtonElement ? request.opener : null;
      interactedOutside.current = false;
    }
    if (!request) {
      if (expanded) focusEditor('first');
      else toggle(true);
      return;
    }
    if (request.key !== 'time') {
      setTargetRequest(request);
      if (!expanded) setChoice(true);
      return;
    }
    if (expanded) focusEditor('period');
    else { focusOnOpen.current = 'period'; setChoice(true); }
  };
  useRegisterContextEditorFocus(requestEditor);
  // Page conditions are described by the extension. The raw address also carries drill, focus and layout state.
  const summary = formatQuerySummary(g, { ...summaryOptions, preset: summaryPreset(conditionPreset, 'draft') });
  const applied = formatQuerySummary(global, { ...summaryOptions, pageSummary: extension?.appliedPageSummary, preset: summaryPreset(conditionPreset, 'applied') });
  const foldedSummary = editing ? summary : applied;
  const invalid = (key: string) => missing.some(item => item.key === key);
  const issues = reasons.length
    ? <Alert id={reasonId} role="status"><AlertDescription><div className="flex flex-wrap items-center gap-1 break-keep">{reasons.map(r => conditionEditorKeys.includes(r.key)
      ? <Button key={r.key} type="button" variant="outline" size="toolbar" onClick={event => requestEditor({ key: r.key, opener: event.currentTarget })}>{r.reason}</Button>
      : <p key={r.key}>{r.reason}</p>)}</div></AlertDescription></Alert>
    : <span id={reasonId} className="sr-only" />;
  const revertDraft = () => { revert(); setInvalidDates(null); setEditError(null); };
  const resetDraft = () => { reset(); setInvalidDates(null); setEditError(null); };
  const draftStatus = changes > 0 ? <span className="text-xs text-text-secondary">{m('queryUnappliedChanges', { count: changes })}</span>
    : notApplied && <span className="text-xs text-text-secondary">{m('queryNotApplied')}</span>;
  const applyAction = <>
    <TooltipProvider delayDuration={200}><Tooltip><TooltipTrigger asChild>
      <span className={extension?.applyHint !== undefined ? 'inline-flex cursor-not-allowed opacity-50' : 'inline-flex'}>
        <Button type="button" size="toolbar" disabled={pendingDefault || (extension?.applyHint === undefined && (!canApply || reasons.length > 0))} aria-disabled={extension?.applyHint !== undefined ? true : undefined}
          aria-describedby={extension?.applyHint === undefined ? reasonId : `${reasonId} ${reasonId}-apply-hint`} onClick={event => {
            if (extension?.applyHint !== undefined) return;
            focusedApply.current = document.activeElement === event.currentTarget ? event.currentTarget : null;
            apply();
          }}>{t('apply')}</Button>
      </span>
    </TooltipTrigger>{extension?.applyHint !== undefined && <TooltipContent>{extension.applyHint}</TooltipContent>}</Tooltip></TooltipProvider>
    {extension?.applyHint !== undefined && <span id={`${reasonId}-apply-hint`} className="sr-only">{extension.applyHint}</span>}
  </>;
  const actions = <div role="group" aria-label={m('queryActionsLabel')} className={board ? 'flex shrink-0 items-center gap-2' : 'flex flex-wrap items-center gap-2'}>
    {draftStatus}
    <Button type="button" variant="ghost" size="toolbar" disabled={pendingDefault} onClick={revertDraft}>{m('queryRevertDraft')}</Button>
    <Button type="button" variant="ghost" size="toolbar" disabled={pendingDefault} onClick={resetDraft}>{t('resetContext')}</Button>
    {stableHistory.present && <span ref={stableHistory.adopt} className="contents" />}
    {stableView.present && <span ref={stableView.adopt} className="contents" />}
    {applyAction}
  </div>;
  const foldedActions = <div role="group" aria-label={m('queryActionsLabel')} className="flex shrink-0 items-center gap-2">
    {(!workspace || !expanded) && draftStatus}
    {(!workspace || !expanded && builtInHistory) && stableHistory.present && <span ref={stableHistory.adopt} className={workspace ? 'hidden' : 'contents'} />}
    {(!workspace || !expanded && builtInView) && stableView.present && <span ref={stableView.adopt} className={workspace ? 'hidden' : 'contents'} />}
    {editing && (!workspace || !expanded) && applyAction}
    <ShareControl overflowRef={overflow} align="end" renderOverflow={({ label: shareLabel, description: shareDescription, busy, copy }) => <DropdownMenu modal={false}>
      <TooltipProvider delayDuration={200}><Tooltip><TooltipTrigger asChild>
        <DropdownMenuTrigger asChild><Button ref={overflow} type="button" variant="ghost" size="icon-sm" aria-label={m('queryActionsLabel')} title={m('queryActionsLabel')}><MoreHorizontal className="size-4" aria-hidden /></Button></DropdownMenuTrigger>
      </TooltipTrigger><TooltipContent>{m('queryActionsLabel')}</TooltipContent></Tooltip></TooltipProvider>
      <DropdownMenuContent align="end" onCloseAutoFocus={event => {
        if (nextTool.current === null) return;
        event.preventDefault();
        setTool(nextTool.current);
        nextTool.current = null;
      }}>
        <DropdownMenuItem disabled={pendingDefault} onSelect={revertDraft}>{m('queryRevertDraft')}</DropdownMenuItem>
        <DropdownMenuItem disabled={pendingDefault} onSelect={resetDraft}>{t('resetContext')}</DropdownMenuItem>
        {overflowTools && builtInHistory && platform.queryHistoryStore && <DropdownMenuItem disabled={pendingDefault} onSelect={() => { nextTool.current = 'history'; }}>{m('historyButton')}</DropdownMenuItem>}
        {overflowTools && builtInView && viewAvailable && <DropdownMenuItem disabled={pendingDefault} onSelect={() => { nextTool.current = 'view'; }}>{m('queryViewSelect')}</DropdownMenuItem>}
        <DropdownMenuItem disabled={busy} aria-description={shareDescription} onSelect={copy}>{shareLabel}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>} />
  </div>;
  const remove = (key: string) => {
    const fields: Record<string, Partial<GlobalContext>> = { time: { from: null, to: null }, roomNames: { roomNames: null }, line: { lineNames: null }, prcGroup: { prcGroups: null }, selection: { selection: null }, lot: { lotIds: null }, ppid: { ppid: null }, recipe: { recipeIds: null }, metric: { metricId: null, metricVersion: null } };
    if (key.startsWith('condition:')) {
      const next = { ...g.condition }; delete next[key.slice('condition:'.length)];
      write({ condition: Object.keys(next).length ? next : null });
    } else write(fields[key]);
  };
  const switcher = cap.condition === 'apply' ? conditionPreset : null;
  const draftPreset = summaryPreset(switcher, 'draft');
  const activePreset = switcher?.presets.find(item => item.id === switcher.activeId);
  const outside = draftPreset ? presetOutsideAxes(g, draftPreset) : [];
  const presetName = activePreset ? activePreset.label[lang] : '';
  const carried = querySummaryItems(g, summaryOptions).filter(item => item.key !== 'membershipBasis' && (['lot', 'ppid', 'recipe', 'metric'].includes(item.contextKey) || cap[item.contextKey] !== 'apply' || (item.key.startsWith('condition:') && outside.includes(item.key.slice('condition:'.length)))));
  const switchPreset = (next: string) => {
    if (!switcher) return;
    setDraftPage({ [switcher.key]: next });
    const nextPreset = switcher.presets.find(item => item.id === next);
    const left = nextPreset ? Object.keys(g.condition ?? {}).filter(axis => g.condition?.[axis]?.length && !nextPreset.axes.includes(axis)).length : 0;
    const name = nextPreset?.label[lang] ?? next;
    setPresetNotice({ id: next, text: left ? m('queryPresetNoticeWithUnused', { name, count: left }) : m('queryPresetNotice', { name }) });
  };
  const content = <div ref={editor} id={workspace ? undefined : `${id}-editor`} className={`grid min-w-0 gap-3 ${workspace ? 'pb-2' : `${inset} pb-2`}`} onKeyDown={event => {
    // Child Radix popovers handle their first Escape before it reaches this inline surface.
    if (!workspace && event.key === 'Escape' && !event.defaultPrevented && event.currentTarget.contains(event.target as Node)) { event.preventDefault(); toggle(false); }
  }}>
    <div role="group" aria-label={m('queryPeriodAndScope')} className="flex min-w-0 flex-wrap items-start gap-3">
      {cap.time === 'apply' && <div role="group" aria-label={t('period')} className="flex min-w-0 max-w-full flex-wrap items-center gap-1 text-xs text-text-secondary">
        <span>{t('period')}</span>
        <span className="sr-only">{formatPeriod(g.from, g.to, lang)}</span>
        <PeriodFields dates={dates} onChange={editPeriod} disabled={pendingDefault} invalid={invalid('time') || periodInputInvalid} reasonId={reasonId} />
      </div>}
      {TARGET_KEYS.some(key => cap[key] === 'apply') && <div className="grid min-w-0 gap-1">
        <TargetPicker compact openRequest={targetRequest} onRequestHandled={clearTargetRequest} disabled={pendingDefault} global={g} cap={cap} onChange={write} presetAxes={activePreset?.axes} invalid={TARGET_KEYS.some(invalid) || groups.blocked.length > 0} reasonId={reasonId} groups={groups} />
        {cap.roomNames === 'apply' && roomRequest(g.roomNames, t('roomNames'))}
      </div>}
      {switcher && <div className="flex min-w-0 flex-wrap items-center gap-1 text-xs text-text-secondary">
        <span id={`${id}-preset`}>{m('queryConditionSet')}</span>
        <SegmentedRadio disabled={pendingDefault} label={m('queryConditionSet')} labelledBy={`${id}-preset`} value={switcher.activeId} onChange={switchPreset} options={switcher.presets.map(item => ({ value: item.id, label: item.label[lang] }))} />
        <p role="status" className="sr-only">{presetNotice.id === switcher.activeId ? presetNotice.text : ''}</p>
      </div>}
    </div>
    {carried.length > 0 && <div role="group" aria-label={m('queryCarriedConditions')} className="flex flex-wrap gap-2 text-xs">
      {carried.map(item => <span key={item.key} className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-md border border-border-subtle p-2 [overflow-wrap:anywhere]">
        {item.label} {item.value} · {item.key.startsWith('condition:') && outside.includes(item.key.slice('condition:'.length)) ? m('queryNotAppliedInPreset', { name: presetName }) : item.capability === 'unsupported' ? t('notUsed') : item.capability === 'reference' ? t('referenceOnly') : t('applied')}
        <Button type="button" variant="ghost" size="toolbar" disabled={pendingDefault} aria-label={`${t('clear')} ${item.label}`} onClick={() => remove(item.key)}>×</Button>
      </span>)}
    </div>}
    {board && <><p className="text-xs [overflow-wrap:anywhere]">{m('queryEditingConditions')} · {summary}</p><p className="text-xs [overflow-wrap:anywhere]">{m('queryAppliedConditions')} · {applied}</p>{actions}{issues}<Button type="button" variant="ghost" size="toolbar" onClick={() => toggle(false)}>{t('close')}</Button></>}
  </div>;
  const trigger = <Button ref={disclosure} type="button" variant="secondary" size="toolbar" aria-label={expanded ? m('queryCollapseConditions') : m('queryExpandConditions')} aria-expanded={expanded} aria-controls={`${id}-editor`} onClick={board ? undefined : () => toggle(!expanded)}>{expanded ? <ChevronUp aria-hidden className="size-4" /> : <ChevronDown aria-hidden className="size-4" />}{label?.visible ?? m('queryConditionsTitle')}</Button>;
  if (workspace) {
    const appliedPreset = summaryPreset(conditionPreset, 'applied');
    const preset = appliedPreset?.presets.find(item => item.id === appliedPreset.id);
    const outsideApplied = new Set(appliedPreset ? presetOutsideAxes(global, appliedPreset).map(axis => `condition:${axis}`) : []);
    const queryChips = querySummaryItems(global, { lang, axes: equipmentAxes, context: cap })
      .filter(item => !outsideApplied.has(item.key))
      .map(item => {
        if (item.capability === 'unsupported') return { ...item, value: `${item.value} · ${t('notUsed')}` };
        if (item.capability === 'reference') return { ...item, value: `${item.value} · ${t('referenceOnly')}` };
        return item;
      });
    const chips = preset && appliedPreset
      ? [...queryChips, { key: appliedPreset.key, label: m('queryConditionSet'), value: preset.label[lang] }]
      : queryChips;
    const region = label?.region ?? m('queryConditionsTitle');
    const editorId = `${id}-editor`;
    const pinLabel = pinText[pinned ? 'unpin' : 'pin'];
    const toggleFrom = (opener: HTMLButtonElement) => {
      queryOpener.current = opener;
      interactedOutside.current = false;
      toggle(!expanded);
    };
    const editorBody = <>
      <div className="mb-2 flex justify-end">
        <Button ref={pinTrigger} type="button" variant="ghost" size="toolbar" title={pinLabel} onClick={() => setPinned(!pinned)}>
          {pinned ? <PinOff className="size-4" aria-hidden /> : <Pin className="size-4" aria-hidden />}{pinLabel}
        </Button>
      </div>
      {content}
      {issues}
      {actions}
    </>;
    return <>
      <section role="region" aria-label={region} data-query-bar data-query-bar-collapsed data-canvas-band
        className="sticky top-12.5 z-20 min-w-0 bg-surface-band">
        {/* Measure the selection's share of the row independently of the chips it currently fits. */}
        <div ref={setFoldedLane} aria-hidden className="pointer-events-none absolute h-0 w-1/3" />
        <Popover open={expanded && !pinned} onOpenChange={open => { if (!open) toggle(false); }}>
          <WorkspaceQueryBarRow line={{
            query: chips, queryOpen: expanded, queryEditorId: editorId, chip: CONDITION_CHIP,
            onQueryChip: event => toggleFrom(event.currentTarget),
            queryHandle: <PopoverTrigger asChild>
              <Button ref={disclosure} type="button" variant="secondary" size="toolbar" className="shrink-0"
                aria-label={expanded ? m('queryCollapseConditions') : m('queryExpandConditions')} aria-expanded={expanded} aria-controls={editorId}
                title={expanded ? m('queryCollapseConditions') : m('queryExpandConditions')}
                onClick={event => { event.preventDefault(); toggleFrom(event.currentTarget); }}>
                {expanded ? <ChevronUp className="size-4" aria-hidden /> : <ChevronDown className="size-4" aria-hidden />}
                {label?.visible ?? m('queryConditionsTitle')}
              </Button>
            </PopoverTrigger>,
            actions: foldedActions,
            pinnedTarget: pagePinTarget,
            selection: <div className="relative hidden min-w-0 max-w-1/3 has-[[role=group]]:flex">
              <span ref={setSummaryProbe} aria-hidden className="absolute size-0" />
              <AnalysisSelectionChipZone fit={{ container: foldedLane, summary: summaryProbe }} fallbackFocus={disclosure} />
            </div>,
          }} />
          <PopoverContent id={editorId} align="start" aria-label={region}
            className="max-h-[var(--radix-popover-content-available-height)] w-[min(64rem,var(--radix-popover-content-available-width))] overflow-y-auto"
            onOpenAutoFocus={event => {
              event.preventDefault();
              focusEditor(focusOnOpen.current ?? 'first');
              focusOnOpen.current = null;
            }}
            // Child controls can move focus into a body portal while the editor is still in use.
            onFocusOutside={event => {
              if (event.target instanceof Element && event.target.closest('[data-radix-popper-content-wrapper], [role="dialog"], [role="alertdialog"]')) event.preventDefault();
            }}
            onInteractOutside={event => {
              if (event.defaultPrevented) return;
              if (event.target instanceof Node && queryOpener.current?.contains(event.target)) event.preventDefault();
              else interactedOutside.current = true;
            }}
            onCloseAutoFocus={event => {
              event.preventDefault();
              if (!pinned && !interactedOutside.current) focusQueryHandle();
            }}>
            {expanded && !pinned && editorBody}
          </PopoverContent>
        </Popover>
      </section>
      <div ref={setPagePinTarget} className="empty:hidden" />
      {!expanded && <span id={reasonId} className="sr-only">{reasons.map(reason => reason.reason).join(' · ')}</span>}
      {pinned && expanded && <section role="region" aria-label={region} id={editorId} data-context-editor-pinned
        className={`border-b border-border-chrome bg-surface-band py-2 ${inset}`} onKeyDown={event => {
          if (event.key !== 'Escape' || event.defaultPrevented || !event.currentTarget.contains(event.target as Node)) return;
          event.preventDefault();
          event.stopPropagation();
          toggle(false);
        }}>{editorBody}</section>}
      <QueryBarTools.Provider key="history" value={builtInHistory ? tools : null}>{stableHistory.portal}</QueryBarTools.Provider>
      <QueryBarTools.Provider key="view" value={builtInView ? tools : null}>{stableView.portal}</QueryBarTools.Provider>
    </>;
  }
  const foldedText = `${editing ? m('queryEditing') : m('queryAppliedConditions')} · ${foldedSummary}`;
  return <><section role="region" aria-label={label?.region ?? m('queryConditionsTitle')} data-query-bar data-canvas-band data-query-bar-collapsed={!board && !expanded ? '' : undefined} className={!board && !expanded ? 'sticky top-[50px] z-20 min-w-0 border-b border-border-chrome bg-surface-band' : 'min-w-0 border-b border-border-chrome bg-surface-band'}>
    <div className={board ? `flex h-12 min-w-0 items-center gap-2 overflow-x-auto ${inset}` : `flex min-h-12 min-w-0 items-center gap-2 ${expanded ? 'flex-wrap' : ''} ${inset}`}>
      {board ? <Popover open={expanded} onOpenChange={toggle}><PopoverTrigger asChild>{trigger}</PopoverTrigger><PopoverContent align="start" side="bottom" className="max-h-[var(--radix-popover-content-available-height)] w-[min(64rem,var(--radix-popover-content-available-width))] overflow-y-auto" onOpenAutoFocus={event => { event.preventDefault(); focusEditor(focusOnOpen.current ?? 'first'); }} onCloseAutoFocus={event => { event.preventDefault(); disclosure.current?.focus(); }}>{content}</PopoverContent></Popover> : trigger}
      {!expanded && <div ref={setFoldedLane} className="relative flex min-w-0 flex-1 items-center">
        {board
          ? <Button type="button" variant="ghost" size="toolbar" className="min-w-0 shrink justify-start" aria-label={m('queryViewFullConditions')} onClick={() => toggle(true)}><span className="truncate">{foldedText}</span></Button>
          : <details className="min-w-0 shrink text-xs"><summary className="cursor-pointer list-none truncate [&::-webkit-details-marker]:hidden">{foldedText}</summary><p className="whitespace-normal [overflow-wrap:anywhere]">{m('queryEditingConditions')} · {summary}</p><p className="whitespace-normal [overflow-wrap:anywhere]">{m('queryAppliedConditions')} · {applied}</p></details>}
        <div aria-hidden className="invisible absolute inset-x-0 top-0 h-0 overflow-hidden">
          <span ref={setSummaryProbe} className="inline-block whitespace-nowrap"><span data-summary={foldedText} className={`before:content-[attr(data-summary)] ${board ? 'px-2 text-sm font-medium' : 'text-xs'}`} /></span>
        </div>
        <AnalysisSelectionChipZone fit={{ container: foldedLane, summary: summaryProbe }} fallbackFocus={disclosure} />
      </div>}
      {!expanded && foldedActions}
      {expanded && <ShareControl compact={false} align="start" />}
    </div>
    {!board && !expanded && <WorkspaceQueryBarRow />}
    {!board && expanded && content}
    {(!board || !expanded) && <div className={reasons.length ? `${inset} pb-2` : undefined}>{issues}</div>}
    {!board && expanded && <div className={`${inset} pb-3`}>{actions}</div>}
  </section>
    <QueryBarTools.Provider key="history" value={builtInHistory ? tools : null}>{stableHistory.portal}</QueryBarTools.Provider>
    <QueryBarTools.Provider key="view" value={builtInView ? tools : null}>{stableView.portal}</QueryBarTools.Provider>
  </>;
}

const NO_GROUPS: readonly string[] = [];
