import { TargetPicker, TARGET_KEYS, type TargetPickerRequest } from './TargetPicker';
import { useCustomGroupOptions } from './customGroupOptions';
import { createPortal } from 'react-dom';
import { isValidElement, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, MoreHorizontal } from 'lucide-react';
import { CUSTOM_GROUP_AXIS, formatPeriod, periodDates, periodFromDates, type GlobalContext, type IdSet } from '@ap/contracts';
import { useConditionPreset, queryMissingSentence, useI18n, useMessages, useQueryDraft } from '@ap/kernel';
import { useHostPlatform } from '@ap/kernel/host';
import { useRegisterContextEditorFocus, useCollapsePreference, AccessRequestEntry, WorkspaceQueryBarRow, formatQuerySummary, presetOutsideAxes, scopeRequestTarget, useScopeAccessRequest, querySummaryItems, SegmentedRadio, summaryPreset, useCompactPageDensity, useQueryBarExtension, useReportQueryBarStatus } from '@ap/components';
import { AnalysisSelectionChipZone } from '@ap/components';
import { Alert, AlertDescription, Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, Popover, PopoverContent, PopoverTrigger, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@ap/ui';
import { PeriodFields, type PeriodDates } from './PeriodFields';
import { useSessionKey } from '../frame/sessionKey';
import { SHELL_MESSAGES } from '../messages';
import { ShareControl } from './ShareControl';
import { QueryHistoryControl } from './QueryHistoryControl';
import { SavedViewControl } from '../saved-view/SavedViewControl';
import { QueryBarTools, type QueryBarTool } from './queryBarTools';

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
    <QueryBarSession key={JSON.stringify([identity.generation, revision, global.scopeId, paneId, route?.menu.id, route?.params])} {...props} />
    {/* Persistent polite region: mounts empty before pending status arrives, stays mounted across remounts, and portals outside the root so modal hideOthers does not hide sibling test probes directly. */}
    {typeof document !== 'undefined' && createPortal(<div aria-live="polite" aria-atomic="false" className="sr-only">{announced}</div>, document.body)}
  </>;
}
/**
 * The view slot keeps one React position while the bar folds: the action group is drawn in the header row when folded and under the
 * editor when open, and a node that moves between two React parents would remount (and lose a selected, edited view). The slot is
 * portalled into one host element that the visible action group adopts, so folding moves the DOM node but never the component.
 */
function useStableSlot(slot: ReactNode) {
  const [host] = useState(() => (slot === undefined || slot === null || typeof document === 'undefined' ? null : Object.assign(document.createElement('span'), { className: 'inline-flex' })));
  const adopt = (parent: HTMLElement | null) => { if (host && parent && host.parentElement !== parent) parent.appendChild(host); };
  return { adopt, portal: host && slot ? createPortal(slot, host) : null, present: host !== null };
}

function QueryBarSession({ label, historySlot, viewSlot }: QueryBarProps) {
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
  const [seenApply, setSeenApply] = useState(query.appliedRevision);
  if (query.appliedRevision !== seenApply) {
    setSeenApply(query.appliedRevision);
    if (query.appliedRevision !== undefined) collapsePreference.choose(true);
  }
  const choice = collapsePreference.choice === null ? null : !collapsePreference.choice;
  const setChoice = (open: boolean) => collapsePreference.choose(!open);
  // Until the decision is taken an address with an applied period is drawn collapsed already, so the common deep link has no open-then-fold flash.
  const expanded = choice ?? !(global.from !== null && global.to !== null);
  if (expanded && tool !== null) setTool(null);
  const tools = { folded: !expanded, active: tool, close: closeTool, anchorRef: overflow, reportViewAvailable: setViewAvailable };
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
  const focusEditor = (to: 'first' | 'period') => {
    const selector = to === 'period' ? 'input[type="date"]:enabled' : 'button:enabled, input:enabled';
    editor.current?.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true });
  };
  useLayoutEffect(() => {
    if (expanded && focusOnOpen.current) focusEditor(focusOnOpen.current);
    focusOnOpen.current = null;
  }, [expanded]);
  useLayoutEffect(() => {
    const previous = focusedApply.current;
    if (!expanded && previous) {
      if (document.activeElement === document.body || document.activeElement === previous) disclosure.current?.focus();
      focusedApply.current = null;
    }
  }, [expanded, seenApply]);
  const toggle = (open: boolean) => {
    focusOnOpen.current = open ? 'first' : null;
    setChoice(open);
    if (!board) collapsePreference.toggle(!open);
    if (!open) disclosure.current?.focus();
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
  useReportQueryBarStatus({ folded: !expanded, editing, reasonKeys: reasons.map(r => r.key), conditionEditorKeys, periodAwaitingApply });
  // The page-condition layer's «조회 조건에서 바꾸기»: open the editor when folded, else move focus into it.
  const requestEditor = (request?: TargetPickerRequest) => {
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
    {draftStatus}
    {stableHistory.present && <span ref={stableHistory.adopt} className="contents" />}
    {stableView.present && <span ref={stableView.adopt} className="contents" />}
    {editing && applyAction}
    <ShareControl overflowRef={overflow} align="end" renderOverflow={({ label: shareLabel, description: shareDescription, busy, copy }) => <DropdownMenu modal={false}>
      <TooltipProvider delayDuration={200}><Tooltip><TooltipTrigger asChild>
        <DropdownMenuTrigger asChild><Button ref={overflow} type="button" variant="ghost" size="icon-sm" aria-label={m('queryActionsLabel')}><MoreHorizontal className="size-4" aria-hidden /></Button></DropdownMenuTrigger>
      </TooltipTrigger><TooltipContent>{m('queryActionsLabel')}</TooltipContent></Tooltip></TooltipProvider>
      <DropdownMenuContent align="end" onCloseAutoFocus={event => {
        if (nextTool.current === null) return;
        event.preventDefault();
        setTool(nextTool.current);
        nextTool.current = null;
      }}>
        <DropdownMenuItem disabled={pendingDefault} onSelect={revertDraft}>{m('queryRevertDraft')}</DropdownMenuItem>
        <DropdownMenuItem disabled={pendingDefault} onSelect={resetDraft}>{t('resetContext')}</DropdownMenuItem>
        {builtInHistory && platform.queryHistoryStore && <DropdownMenuItem disabled={pendingDefault} onSelect={() => { nextTool.current = 'history'; }}>{m('historyButton')}</DropdownMenuItem>}
        {builtInView && viewAvailable && <DropdownMenuItem disabled={pendingDefault} onSelect={() => { nextTool.current = 'view'; }}>{m('queryViewSelect')}</DropdownMenuItem>}
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
  const content = <div ref={editor} id={`${id}-editor`} className={`grid min-w-0 gap-3 ${inset} pb-2`} onKeyDown={event => {
    // Child Radix popovers handle their first Escape before it reaches this inline surface.
    if (event.key === 'Escape' && !event.defaultPrevented && event.currentTarget.contains(event.target as Node)) { event.preventDefault(); toggle(false); }
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
  const foldedText = `${editing ? m('queryEditing') : m('queryAppliedConditions')} · ${foldedSummary}`;
  return <><section role="region" aria-label={label?.region ?? m('queryConditionsTitle')} data-query-bar data-canvas-band data-query-bar-collapsed={!board && !expanded ? '' : undefined} className={!board && !expanded ? 'sticky top-[50px] z-20 min-w-0 border-b border-border-chrome bg-surface-band' : 'min-w-0 border-b border-border-chrome bg-surface-band'}>
    <div className={board ? `flex h-12 min-w-0 items-center gap-2 overflow-x-auto ${inset}` : `flex min-h-12 min-w-0 items-center gap-2 ${expanded ? 'flex-wrap' : ''} ${inset}`}>
      {board ? <Popover open={expanded} onOpenChange={toggle}><PopoverTrigger asChild>{trigger}</PopoverTrigger><PopoverContent align="start" side="bottom" className="max-h-[var(--radix-popover-content-available-height)] w-[min(64rem,var(--radix-popover-content-available-width))] overflow-y-auto" onOpenAutoFocus={event => { event.preventDefault(); focusEditor(focusOnOpen.current ?? 'first'); }} onCloseAutoFocus={event => { event.preventDefault(); disclosure.current?.focus(); }}>{content}</PopoverContent></Popover> : trigger}
      {board && !expanded && <Button type="button" variant="ghost" size="toolbar" className="min-w-0 flex-1 justify-start overflow-x-auto" aria-label={m('queryViewFullConditions')} onClick={() => toggle(true)}><span className="whitespace-nowrap">{editing ? m('queryEditing') : m('queryAppliedConditions')} · {foldedSummary}</span></Button>}
      {!board && !expanded && <div ref={setFoldedLane} className="relative flex min-w-0 flex-1 items-center">
        <details className="min-w-0 shrink text-xs"><summary className="cursor-pointer list-none truncate [&::-webkit-details-marker]:hidden">{foldedText}</summary><p className="whitespace-normal [overflow-wrap:anywhere]">{m('queryEditingConditions')} · {summary}</p><p className="whitespace-normal [overflow-wrap:anywhere]">{m('queryAppliedConditions')} · {applied}</p></details>
        <div aria-hidden className="invisible absolute inset-x-0 top-0 h-0 overflow-hidden">
          <span ref={setSummaryProbe} className="inline-block whitespace-nowrap"><span data-summary={foldedText} className="before:content-[attr(data-summary)] text-xs" /></span>
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
    <QueryBarTools.Provider value={builtInHistory ? tools : null}>{stableHistory.portal}</QueryBarTools.Provider>
    <QueryBarTools.Provider value={builtInView ? tools : null}>{stableView.portal}</QueryBarTools.Provider>
  </>;
}

const NO_GROUPS: readonly string[] = [];
