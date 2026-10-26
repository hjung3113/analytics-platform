import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode, type ComponentProps } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { formatPeriod, parseDateTime, periodHours, shift, type GlobalContext, type IdSet } from '@ap/contracts';
import { CONTEXT_LABELS, useAxisOptions, useConditionPreset, useEquipmentSearch, useI18n, useQueryDraft, useResolvedSelection, type PortContext } from '@ap/kernel';
import { useHostPlatform } from '@ap/kernel/host';
import { formatQuerySummary, presetOutsideAxes, querySummaryItems, SegmentedRadio, summaryPreset, useCopyLink, useQueryBarExtension } from '@ap/components';
import { Alert, AlertDescription, Button, Input, MultiCombobox, Popover, PopoverContent, PopoverTrigger, readLocalStorage, writeLocalStorage } from '@ap/ui';

export type QueryBarProps = {
  label?: { visible: string; region: string };
  /** Reserved for query history; selecting history must only restore the draft. */
  historySlot?: ReactNode;
};

/** Remount transient editor state on logical screen/session switches; Kernel owns retained drafts. */
export function QueryBar(props: QueryBarProps) {
  const { route, paneId, session } = useHostPlatform();
  const [identity, setIdentity] = useState({ session, generation: 0 });
  if (identity.session !== session) setIdentity({ session, generation: identity.generation + 1 });
  return <QueryBarSession key={`${identity.generation}:${paneId ?? 'main'}:${route?.menu.id}:${JSON.stringify(route?.params)}`} {...props} />;
}
function QueryBarSession({ label, historySlot }: QueryBarProps) {
  const platform = useHostPlatform();
  const { route, global, page, scope, screenMode, equipmentAxes, url, session } = platform;
  const query = useQueryDraft();
  const { draft, dirty, missing, canApply, applying, setDraftGlobal, setDraftPage, apply, revert, reset } = query;
  const extension = useQueryBarExtension();
  const { lang, tx, t } = useI18n();
  const ko = lang === 'ko';
  const id = useId();
  const disclosure = useRef<HTMLButtonElement>(null);
  const editor = useRef<HTMLDivElement>(null);
  const focusFirst = useRef(false);
  const board = screenMode === 'pane';
  const preference = `platform:query-bar-collapsed:${route?.menu.id}`;
  const [expanded, setExpanded] = useState(() => {
    if (board) return false;
    return readLocalStorage(preference, v => v !== 'true', true);
  });
  const [editError, setEditError] = useState<string | null>(null);
  const [presetNotice, setPresetNotice] = useState({ id: '', text: '' });
  const conditionPreset = useConditionPreset();
  useLayoutEffect(() => {
    if (expanded && focusFirst.current) editor.current?.querySelector<HTMLElement>('button:not(:disabled), input:not(:disabled)')?.focus();
    focusFirst.current = false;
  }, [expanded]);
  const toggle = (open: boolean) => {
    focusFirst.current = open;
    setExpanded(open);
    if (!board) writeLocalStorage(preference, String(!open)); // optional preference
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
    catch { setEditError(ko ? '이 조건은 적용할 수 없습니다. 기간·지표 쌍·소속 기준을 확인하세요.' : 'Check the period, metric pair and membership basis.'); }
  };
  const g = draft.global;
  const [range, setRange] = useState({ from: g.from ?? '', to: g.to ?? '' });
  const [periodEditor, setPeriodEditor] = useState({ mode: 'range' as 'reference' | 'range', reference: platform.defaultRangeTo.slice(0, 10), invalidReference: false });
  const [rangeSource, setRangeSource] = useState(`${g.from}|${g.to}`);
  if (rangeSource !== `${g.from}|${g.to}`) {
    setRangeSource(`${g.from}|${g.to}`);
    setRange({ from: g.from ?? '', to: g.to ?? '' });
    setPeriodEditor(previous => ({ ...previous, reference: (g.from ?? platform.defaultRangeTo).slice(0, 10), invalidReference: false }));
  }
  const context: PortContext = { scopeId: g.scopeId ?? '', roomNames: g.roomNames, lineNames: g.lineNames, prcGroups: g.prcGroups, condition: g.condition, membershipBasis: g.membershipBasis, period: g.from && g.to ? { from: g.from, to: g.to } : null };
  const cap = route!.menu.context;
  const reasons = missing.map(m => ({ key: m.key, reason: t('queryMissing', { label: m.key === 'roomNames' ? (ko ? '공정' : 'Process') : tx(m.label) }) }));
  if (route!.menu.requiresScope && (scope.status !== 'valid' || scope.validatedFor !== session)) reasons.push({ key: 'scope', reason: ko ? 'Scope를 선택하고 권한 확인을 완료하세요.' : 'Select a Scope and finish authorization.' });
  if (applying) reasons.push({ key: 'commit', reason: ko ? '조건을 적용하고 있습니다.' : 'Applying conditions.' });
  const periodInputInvalid = (periodEditor.mode === 'reference' && periodEditor.invalidReference) || range.from !== (g.from ?? '') || range.to !== (g.to ?? '');
  if (periodInputInvalid) reasons.push({ key: 'period-input', reason: ko ? '유효한 시작·종료 시각을 입력하세요.' : 'Enter valid start and end times.' });
  if (editError) reasons.push({ key: 'edit', reason: editError });
  for (const issue of extension?.issues ?? []) reasons.push({ key: issue.key, reason: `${issue.label}: ${issue.reason}` });
  if (!canApply && !reasons.length) reasons.push({ key: 'validation', reason: ko ? '기간·지표 쌍·소속 기준을 확인하세요.' : 'Check the period, metric pair and membership basis.' });
  const reasonId = `${id}-reasons`;
  const summaryOptions = { lang, axes: equipmentAxes, context: cap, pageSummary: extension?.pageSummary };
  // The seeded default period is not a change (#913) but is not applied either: until Apply the summary still reads as the draft.
  // The period is one change however many of its ends moved (`오늘` moves both, `최근 7일` only `from`).
  const changes = new Set(dirty.map(key => key === 'from' || key === 'to' ? 'time' : key)).size;
  const editing = dirty.length > 0 || (global.from === null && g.from !== null);
  const summary = formatQuerySummary(g, draft.page, { ...summaryOptions, preset: summaryPreset(conditionPreset, 'draft') });
  const applied = formatQuerySummary(global, page, { ...summaryOptions, pageSummary: extension?.appliedPageSummary, preset: summaryPreset(conditionPreset, 'applied') });
  const copy = useCopyLink(ko ? '현재 적용된 조건의 링크를 복사했습니다. 받는 사람의 권한으로 서버가 다시 검증합니다.' : 'Copied the applied link. The server re-validates for the recipient.');
  const invalid = (key: string) => missing.some(m => m.key === key);
  const issues = reasons.length
    ? <Alert id={reasonId} role="status"><AlertDescription>{reasons.map(r => <p key={r.key}>{r.reason}</p>)}</AlertDescription></Alert>
    : <span id={reasonId} className="sr-only" />;
  const actions = <div role="group" aria-label={ko ? '조회 조건 동작' : 'Query actions'} className={board ? 'flex shrink-0 items-center gap-2' : 'flex flex-wrap items-center gap-2'}>
    {changes > 0 && <span className="text-xs text-text-secondary">{ko ? `적용 안 된 변경 ${changes}개` : `${changes} unapplied changes`}</span>}
    <Button type="button" variant="ghost" size="toolbar" onClick={() => { revert(); setPeriodEditor({ mode: 'range', reference: (global.from ?? platform.defaultRangeTo).slice(0, 10), invalidReference: false }); setRangeSource('revert'); setEditError(null); }}>{ko ? '되돌리기' : 'Revert'}</Button>
    <Button type="button" variant="ghost" size="toolbar" onClick={() => { reset(); setPeriodEditor({ mode: 'range', reference: platform.defaultRangeTo.slice(0, 10), invalidReference: false }); setRangeSource('reset'); setEditError(null); }}>{t('reset')}</Button>
    <Button type="button" size="toolbar" disabled={!canApply || reasons.length > 0} aria-describedby={reasonId} onClick={apply}>{ko ? '적용' : 'Apply'}</Button>
    {historySlot}
  </div>;
  const remove = (key: string) => {
    const fields: Record<string, Partial<GlobalContext>> = { time: { from: null, to: null }, roomNames: { roomNames: null }, line: { lineNames: null }, prcGroup: { prcGroups: null }, selection: { selection: null }, lot: { lotIds: null }, ppid: { ppid: null }, recipe: { recipeIds: null }, metric: { metricId: null, metricVersion: null } };
    if (key.startsWith('condition:')) {
      const next = { ...g.condition }; delete next[key.slice('condition:'.length)];
      write({ condition: Object.keys(next).length ? next : null });
    } else write(fields[key]);
  };
  const used = equipmentAxes.filter(a => g.condition?.[a.id]);
  const history = (g.condition !== null || g.prcGroups !== null) && used.every(a => a.membershipHistory);
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
    setPresetNotice({ id: next, text: ko ? `조건 묶음: ${name}.${left ? ` ${left}개 조건은 이 보기에서 미적용입니다.` : ''}` : `Condition set: ${name}.${left ? ` ${left} conditions are not applied in this view.` : ''}` });
  };
  const content = <div ref={editor} id={`${id}-editor`} className="grid min-w-0 gap-2 p-2" onKeyDown={event => {
    // Child Radix popovers handle their first Escape before it reaches this inline surface.
    if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); toggle(false); }
  }}>
    <fieldset className="min-w-0 rounded-md border border-border-subtle p-2">
      <legend className="px-1 text-xs font-medium text-text-secondary">{ko ? '기간과 조회 범위' : 'Period and query scope'}</legend>
      <div className="flex flex-wrap items-start gap-3">
        {cap.time === 'apply' && <PeriodFields global={g} range={range} setRange={setRange} write={patch => { setRange({ from: patch.from ?? '', to: patch.to ?? '' }); setPeriodEditor(previous => ({ ...previous, reference: (patch.from ?? platform.defaultRangeTo).slice(0, 10), invalidReference: false })); write(patch); }} periodEditor={periodEditor} setPeriodEditor={setPeriodEditor} invalid={invalid('time') || periodInputInvalid} reasonId={reasonId} reportInvalid={() => setEditError(ko ? '유효한 시작·종료 시각을 입력하세요.' : 'Enter valid start and end times.')} />}
        {cap.roomNames === 'apply' && <SetField name={ko ? '공정' : 'Process'} values={g.roomNames} options={scope.status === 'valid' && scope.validatedFor === session ? scope.grantedRooms.map(value => ({ value, label: value })) : []} onChange={roomNames => write({ roomNames })} invalid={invalid('roomNames')} reasonId={reasonId} />}
        {cap.line === 'apply' && <AxisField axisId="lineNames" name={tx(CONTEXT_LABELS.line)} values={g.lineNames} context={context} parents={g.roomNames === null ? {} : { roomNames: g.roomNames }} onChange={lineNames => write({ lineNames })} invalid={invalid('line')} reasonId={reasonId} />}
        {cap.prcGroup === 'apply' && <AxisField axisId="prcGroups" name={tx(CONTEXT_LABELS.prcGroup)} values={g.prcGroups} context={context} parents={{ ...(g.roomNames === null ? {} : { roomNames: g.roomNames }), ...(g.lineNames === null ? {} : { lineNames: g.lineNames }) }} onChange={prcGroups => write({ prcGroups })} invalid={invalid('prcGroup')} reasonId={reasonId} />}
      </div>
    </fieldset>
    {(cap.condition === 'apply' || cap.selection === 'apply' || cap.prcGroup === 'apply') && <fieldset className="min-w-0 rounded-md border border-border-subtle p-2">
      <legend className="px-1 text-xs font-medium text-text-secondary">{ko ? '설비 조건' : 'Equipment conditions'}</legend>
      <div className="flex flex-wrap items-start gap-3">
        {switcher && <div className="grid basis-full gap-1 text-xs text-text-secondary">
          <span id={`${id}-preset`}>{ko ? '조건 묶음' : 'Condition set'}</span>
          <SegmentedRadio label={ko ? '조건 묶음' : 'Condition set'} labelledBy={`${id}-preset`} value={switcher.activeId} onChange={switchPreset} options={switcher.presets.map(item => ({ value: item.id, label: item.label[lang] }))} />
          <p role="status" className="sr-only">{presetNotice.id === switcher.activeId ? presetNotice.text : ''}</p>
        </div>}
        {cap.condition === 'apply' && equipmentAxes.filter(axis => !activePreset || activePreset.axes.includes(axis.id)).map(axis => <AxisField key={axis.id} axisId={axis.id} name={tx(axis.label)} values={g.condition?.[axis.id] ? [...g.condition[axis.id]] : null} context={context} parents={axis.dependsOn && g.condition?.[axis.dependsOn] ? { [axis.dependsOn]: [...g.condition[axis.dependsOn]] } : {}} invalid={invalid('condition')} reasonId={reasonId} onChange={values => {
          const next = { ...g.condition };
          if (values?.length) next[axis.id] = values; else delete next[axis.id];
          write({ condition: Object.keys(next).length ? next : null });
        }} />)}
        {(cap.condition === 'apply' || cap.prcGroup === 'apply') && <div className="grid min-w-48 gap-1 text-xs text-text-secondary">
          <span>{ko ? '소속 기준' : 'Membership'}</span>
          <Button type="button" size="toolbar" variant="secondary" aria-pressed={g.membershipBasis === null} onClick={() => write({ membershipBasis: null })}>{ko ? '지금 소속' : 'Current membership'}</Button>
          <Button type="button" size="toolbar" variant="secondary" disabled={!history} aria-pressed={g.membershipBasis === 'asOf'} aria-describedby={!history ? `${id}-history` : undefined} onClick={() => write({ membershipBasis: 'asOf' })}>{t('membershipAsOf')}</Button>
          {!history && <p id={`${id}-history`}>{ko ? '설비 조건이나 PRC 그룹을 선택하고 소속 이력을 확인하세요.' : 'Select equipment conditions or a PRC group with membership history.'}</p>}
        </div>}
        {cap.selection === 'apply' && <EquipmentField context={context} values={g.selection} onChange={selection => write({ selection })} invalid={invalid('selection')} reasonId={reasonId} />}
      </div>
    </fieldset>}
    {carried.length > 0 && <div role="group" aria-label={ko ? '전달된 조건' : 'Carried conditions'} className="flex flex-wrap gap-2 text-xs">
      {carried.map(item => <span key={item.key} className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-md border border-border-subtle p-2 [overflow-wrap:anywhere]">
        {item.label} {item.value} · {item.key.startsWith('condition:') && outside.includes(item.key.slice('condition:'.length)) ? (ko ? `${presetName}에서 미적용` : `not applied in ${presetName}`) : item.capability === 'unsupported' ? t('notUsed') : item.capability === 'reference' ? t('referenceOnly') : ko ? '적용' : 'Applied'}
        <Button type="button" variant="ghost" size="toolbar" aria-label={`${t('clear')} ${item.label}`} onClick={() => remove(item.key)}>×</Button>
      </span>)}
    </div>}
    {board && <><p className="text-xs [overflow-wrap:anywhere]">{ko ? '편집 중 조건' : 'Editing conditions'} · {summary}</p><p className="text-xs [overflow-wrap:anywhere]">{ko ? '적용 조건' : 'Applied conditions'} · {applied}</p>{actions}{issues}<Button type="button" variant="ghost" size="toolbar" onClick={() => toggle(false)}>{ko ? '닫기' : 'Close'}</Button></>}
  </div>;
  const trigger = <Button ref={disclosure} type="button" variant="secondary" size="toolbar" aria-label={ko ? `조회 조건 ${expanded ? '접기' : '펼치기'}` : `${expanded ? 'Collapse' : 'Expand'} query conditions`} aria-expanded={expanded} aria-controls={`${id}-editor`} onClick={board ? undefined : () => toggle(!expanded)}>{expanded ? <ChevronUp aria-hidden className="size-4" /> : <ChevronDown aria-hidden className="size-4" />}{label?.visible ?? (ko ? '조회 조건' : 'Query conditions')}</Button>;
  return <section role="region" aria-label={label?.region ?? (ko ? '조회 조건' : 'Query conditions')} data-query-bar data-query-bar-collapsed={!board && !expanded ? '' : undefined} className={!board && !expanded ? 'sticky top-[50px] z-20 min-w-0 border-b border-border-subtle bg-surface-canvas' : 'min-w-0 border-b border-border-subtle bg-surface-canvas'}>
    <div className={board ? 'flex h-12 min-w-0 items-center gap-2 overflow-x-auto px-3' : 'flex min-h-12 min-w-0 flex-wrap items-center gap-2 px-3'}>
      {board ? <Popover open={expanded} onOpenChange={toggle}><PopoverTrigger asChild>{trigger}</PopoverTrigger><PopoverContent align="start" side="bottom" className="max-h-[var(--radix-popover-content-available-height)] w-[min(64rem,var(--radix-popover-content-available-width))] overflow-y-auto" onOpenAutoFocus={event => { event.preventDefault(); editor.current?.querySelector<HTMLElement>('button:not(:disabled), input:not(:disabled)')?.focus(); }} onCloseAutoFocus={event => { event.preventDefault(); disclosure.current?.focus(); }}>{content}</PopoverContent></Popover> : trigger}
      {board && !expanded && <Button type="button" variant="ghost" size="toolbar" className="min-w-0 flex-1" aria-label={ko ? '전체 조회 조건 보기' : 'View full query conditions'} onClick={() => toggle(true)}><span className="truncate">{editing ? (ko ? '편집 중' : 'Editing') : (ko ? '적용 조건' : 'Applied conditions')} · {summary}</span></Button>}
      {!board && !expanded && <details className="min-w-0 flex-1 text-xs"><summary className="cursor-pointer truncate list-none [&::-webkit-details-marker]:hidden">{editing ? (ko ? '편집 중' : 'Editing') : (ko ? '적용 조건' : 'Applied conditions')} · {summary}</summary><p className="whitespace-normal [overflow-wrap:anywhere]">{ko ? '편집 중 조건' : 'Editing conditions'} · {summary}</p><p className="whitespace-normal [overflow-wrap:anywhere]">{ko ? '적용 조건' : 'Applied conditions'} · {applied}</p></details>}
      {!expanded && actions}
      {board && !expanded && <span id={reasonId} className="max-w-56 truncate text-xs text-text-secondary">{reasons.map(r => r.reason).join(' · ')}</span>}
      <Button type="button" variant="ghost" size="toolbar" onClick={() => copy(url)}>{ko ? '링크 복사' : 'Copy link'}</Button>
    </div>
    {!board && expanded && <>{content}<div className="px-3 pb-2">{issues}</div><div className="px-3 pb-3">{actions}</div></>}
    {!board && !expanded && <div className="px-3 pb-2">{issues}</div>}
  </section>;
}

/**
 * The candidate search the ports see: typing waits 250 ms after the last key (a port request per key otherwise, #823); clearing the
 * search applies at once. The input itself shows every key; the field reads as loading until the waited query is the typed one.
 */
function useSearchQuery(search: string): string {
  const [query, setQuery] = useState(search);
  useEffect(() => {
    if (search === '') { setQuery(''); return; }
    const timer = setTimeout(() => setQuery(search), 250);
    return () => clearTimeout(timer);
  }, [search]);
  return query;
}

type SetFieldProps = { name: string; values: IdSet; options: { value: string; label: string }[]; onChange: (values: IdSet) => void; invalid?: boolean; reasonId: string };
function SetField({ name, values, onChange, invalid, reasonId, ...props }: SetFieldProps & Partial<Pick<ComponentProps<typeof MultiCombobox>, 'getLabel' | 'search' | 'onSearchChange' | 'loading' | 'error' | 'onRetry' | 'hasMore' | 'onLoadMore'>>) {
  const { lang, t } = useI18n();
  const ko = lang === 'ko';
  return <div className="grid w-56 min-w-0 max-w-full gap-1 text-xs text-text-secondary">
    <span>{name}</span>
    <MultiCombobox {...props} label={name} values={values ?? []} onValuesChange={onChange} aria-invalid={invalid || undefined} aria-describedby={invalid ? reasonId : undefined} listboxLabel={name} emptyText={ko ? '후보 없음' : 'No candidates'} placeholder={values === null ? (ko ? '전체 후보' : 'All candidates') : values.length === 0 ? (ko ? '명시적 빈 선택' : 'Explicit empty selection') : undefined} selectedSummaryLabel={count => ko ? `선택한 항목 ${count}개` : `${count} selected items`} moreLabel={ko ? '더 보기' : 'Load more'} clearAllLabel={ko ? '선택 모두 비우기' : 'Clear selection'} removeLabel={value => `${t('clear')} ${value}`} loadingText={ko ? '후보 확인 중' : 'Loading candidates'} retryLabel={t('retry')} />
    <Button type="button" variant="ghost" size="toolbar" aria-label={ko ? `${name} 전체 후보로 되돌리기` : `Reset ${name} to all candidates`} disabled={values === null} onClick={() => onChange(null)}>{ko ? '전체 후보로' : 'Reset to all candidates'}</Button>
  </div>;
}
function AxisField({ axisId, context, parents, ...props }: Omit<SetFieldProps, 'options'> & { axisId: string; context: PortContext; parents: Record<string, string[]> }) {
  const [search, setSearch] = useState('');
  const query = useSearchQuery(search);
  const result = useAxisOptions({ axisId, context, parents, query });
  const { lang } = useI18n();
  const labels = new Map(result.items.map(item => [item.id, item.label]));
  return <div className="min-w-0">
    <SetField {...props} search={search} onSearchChange={setSearch} options={result.items.map(item => ({ value: item.id, label: item.label }))} getLabel={value => labels.get(value) ?? value} loading={result.status === 'loading' || result.loadingMore || search !== query} error={result.error?.message ?? result.loadMoreError?.message} onRetry={result.retry} hasMore={result.hasMore} onLoadMore={result.loadMore} />
    {props.values?.some(value => !labels.has(value)) && <p className="max-w-56 text-xs text-text-secondary">{lang === 'ko' ? '현재 후보에 없음. 선택은 유지합니다.' : 'Not in current candidates. Selection is kept.'}</p>}
  </div>;
}
function EquipmentField({ context, ...props }: Omit<SetFieldProps, 'name' | 'options'> & { context: PortContext }) {
  const [search, setSearch] = useState('');
  const query = useSearchQuery(search);
  const result = useEquipmentSearch({ context, query });
  const resolved = useResolvedSelection(props.values ?? [], { scopeId: context.scopeId });
  const { lang } = useI18n();
  const ko = lang === 'ko';
  // Never let stale candidate metadata override an authoritative forbidden/not_found resolution.
  const label = (value: string) => {
    const status = resolved.byId.get(value);
    return status === 'forbidden' ? `${value} (${ko ? '권한 없음' : 'Forbidden'})` : status === 'not_found' ? `${value} (${ko ? '찾을 수 없음' : 'Not found'})` : resolved.summaries.get(value)?.equipmentId ?? value;
  };
  return <div className="min-w-0"><SetField {...props} name="EquipmentID" search={search} onSearchChange={setSearch} options={result.items.map(item => ({ value: item.equipmentId, label: label(item.equipmentId) }))} getLabel={label} loading={result.status === 'loading' || result.loadingMore || resolved.status === 'loading' || search !== query} error={result.error?.message ?? result.loadMoreError?.message ?? resolved.error?.message} onRetry={() => { result.retry(); resolved.retry(); }} hasMore={result.hasMore} onLoadMore={result.loadMore} />
    {props.values?.some(value => !result.items.some(item => item.equipmentId === value)) && <p className="max-w-56 text-xs text-text-secondary">{ko ? '현재 불러온 후보에 없음. 선택한 ID는 유지합니다.' : 'Not in currently loaded candidates. Selected IDs are kept.'}</p>}
  </div>;
}
function PeriodFields({ global: g, range, setRange, write, invalid, reasonId, reportInvalid, periodEditor, setPeriodEditor }: { periodEditor: { mode: 'reference' | 'range'; reference: string; invalidReference: boolean }; setPeriodEditor: (value: { mode: 'reference' | 'range'; reference: string; invalidReference: boolean }) => void; range: { from: string; to: string }; setRange: (value: { from: string; to: string }) => void; global: GlobalContext; write: (patch: Partial<GlobalContext>) => void; invalid: boolean; reasonId: string; reportInvalid: () => void }) {
  const { defaultRangeTo } = useHostPlatform();
  const { lang } = useI18n();
  const ko = lang === 'ko';
  const { mode, reference } = periodEditor;
  const setMode = (mode: 'reference' | 'range') => setPeriodEditor({ ...periodEditor, mode });
  const date = (value: string) => {
    try { const from = `${value}T00:00:00`; parseDateTime(from, 'from'); setPeriodEditor({ mode: 'reference', reference: value, invalidReference: false }); write({ from, to: shift(from, 24) }); } catch { setPeriodEditor({ mode: 'reference', reference: value, invalidReference: true }); reportInvalid(); }
  };
  const custom = (key: 'from' | 'to', value: string) => {
    const normalized = value.length === 16 ? `${value}:00` : value;
    const next = { ...range, [key]: normalized }; setRange(next);
    try { parseDateTime(next.from, 'from'); parseDateTime(next.to, 'to'); write(next); } catch { reportInvalid(); }
  };
  const hours = periodHours(g);
  const ends = (hoursBack: number) => g.to === defaultRangeTo && hours === hoursBack;
  const presets = [
    { label: ko ? '최근 24시간' : 'Last 24 hours', pressed: ends(24), apply: () => { setMode('range'); write({ from: shift(defaultRangeTo, -24), to: defaultRangeTo }); } },
    { label: ko ? '최근 7일' : 'Last 7 days', pressed: ends(168), apply: () => { setMode('range'); write({ from: shift(defaultRangeTo, -168), to: defaultRangeTo }); } },
    { label: ko ? '오늘' : 'Today', pressed: g.from === `${defaultRangeTo.slice(0, 10)}T00:00:00` && hours === 24, apply: () => date(defaultRangeTo.slice(0, 10)) },
  ];
  return <div className="grid min-w-0 flex-1 basis-full gap-1 text-xs text-text-secondary" role="group" aria-label={ko ? '기간' : 'Period'}>
    <div className="flex flex-wrap items-center gap-1">
      {presets.map(p => <Button key={p.label} type="button" size="toolbar" variant={p.pressed ? 'secondary' : 'ghost'} aria-pressed={p.pressed} onClick={p.apply}>{p.label}</Button>)}
      {/* Presets pick a range, the pair picks how to type one: a divider keeps two pressed buttons from reading as one choice. */}
      <span aria-hidden className="mx-1 h-5 w-px bg-border-subtle" data-period-divider />
      <Button type="button" size="toolbar" variant={mode === 'reference' ? 'secondary' : 'ghost'} aria-pressed={mode === 'reference'} onClick={() => setMode('reference')}>{ko ? '기준일' : 'Reference date'}</Button>
      <Button type="button" size="toolbar" variant={mode === 'range' ? 'secondary' : 'ghost'} aria-pressed={mode === 'range'} onClick={() => setMode('range')}>{ko ? '직접 범위' : 'Custom range'}</Button>
    </div>
    {mode === 'reference' ? <Input type="date" aria-invalid={invalid || undefined} aria-describedby={invalid ? reasonId : undefined} aria-label={ko ? '기준일' : 'Reference date'} value={reference} onChange={event => date(event.target.value)} /> : <div className="flex flex-wrap gap-2">
      <Input type="datetime-local" step="1" aria-label={ko ? '시작 시각' : 'From'} aria-invalid={invalid || undefined} aria-describedby={invalid ? reasonId : undefined} value={range.from} onChange={event => custom('from', event.target.value)} className="min-w-64 flex-1" />
      <Input type="datetime-local" step="1" aria-label={ko ? '종료 시각 (제외)' : 'To (exclusive)'} aria-invalid={invalid || undefined} aria-describedby={invalid ? reasonId : undefined} value={range.to} onChange={event => custom('to', event.target.value)} className="min-w-64 flex-1" />
    </div>}
    <span className="[overflow-wrap:anywhere]">{formatPeriod(g.from, g.to, lang)}</span>
  </div>;
}
