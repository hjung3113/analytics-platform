/** A′ Configuration consumer: the server owns comparison, filtering and hierarchy. */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Columns3, Download } from 'lucide-react';
import { encodeFilterParams, formatInstant, type ColumnFilter, type GlobalContext, type Pair, type MatrixCell, type MatrixColumn, type MatrixEmphasisRule } from '@ap/contracts';
import { useI18n, useMenuFetch, useMenuQuery, useMessages, usePlatform, useQueryDraft, type QueryDraft, type QueryState } from '@ap/kernel';
import { DataTrustIndicator, DetailDrawer, FilterLine, MatrixEmphasisBar, MatrixLevelOrder, MatrixToneLegend, PageFilterBar, PageKeyWarning, PlatformPage, QueryView, TreeMatrix, WorkbookRefusal, sameValueRule, usePageKeyRules, useWorkbookExport, useTableFilterDeclaration, type PageFilterField } from '@ap/components';
import { Button, Checkbox, EmptyState, FieldList, FieldRow, Input, MultiCombobox, Popover, PopoverContent, PopoverTrigger, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, StatusBadgeFrame, ToggleGroup, ToggleGroupItem, cn } from '@ap/ui';
import { AXIS_KEY, COLUMN_LIMIT, EQUIPMENT_AXIS, configurationPivotEndpoint, configurationDetailEndpoint, configurationExportEndpoint, configurationTreeEndpoint, configurationTreeNavigationEndpoint, DEFAULT_LEVELS, EQUIPMENT, EXPORT_LIMIT, LEVELS, STATUS, HW_TREND_CLOSED, HW_TREND_ITEM_KEY, TREND_ITEM_KEY, TREE_WINDOW, equipmentFromKey, equipmentToKey, filterDeclarations, isRowId, readFilters, validEquipment, validEquipmentKey, validLevels, type CompareParams, type CompareStatus, type ConfigRow, type PivotParams, type PivotResult, type TreePage, type TreeParams, type TreeRow } from '../endpoints';
import { MESSAGES } from '../messages';
import { ConfigurationWorkspace, type TrendActions } from './ConfigurationWorkspace';
import { EquipmentAxisTable, itemFromEquipment, validEquipmentResult } from './EquipmentAxisTable';
import { distribution, distributionText, PrimaryChip, RowStatus, valueMeaning, valueTone, type Message } from './comparison';

const SEGMENTS = ['bg-chart-series-1', 'bg-chart-series-2', 'bg-chart-series-3', 'bg-chart-series-4'];
function conditionParams(page: readonly Pair[]): CompareParams {
  const param = (key: string) => page.find(([name]) => name === key)?.[1] ?? null;
  return { eq: equipmentFromKey(param('equipment')), mode: (param('mode') ?? 'all') as CompareParams['mode'], ref: param('ref') ?? 'EQ01', asOf: 'latest', status: (param('status') ?? 'review') as CompareStatus, q: param('q') ?? '', coreOnly: param('core') === '1' };
}
function summaryFor(page: readonly Pair[], m: Message) {
  const params = conditionParams(page);
  const summary = [
    { key: 'equipment', label: m('equipment'), value: m('equipmentCount', { count: params.eq.length }) },
    { key: 'mode', label: m('compareMode'), value: m(params.mode === 'reference' ? 'referenceMode' : 'allMode') },
    { key: 'asOf', label: m('asOf'), value: m('latest') },
  ];
  if (params.mode === 'reference' || page.some(([key]) => key === 'ref')) {
    summary.push({ key: 'ref', label: m(params.mode === 'reference' ? 'referenceEquipment' : 'inactiveReferenceEquipment'), value: params.ref });
  }
  const labels = { [TREND_ITEM_KEY]: 'trendItem', core: 'coreOnly', levels: 'levelOrder', filter: 'filter', hideSameCols: 'hideSame', q: 'search', status: 'status' } as const;
  for (const [key, label] of Object.entries(labels)) {
    const values = page.filter(([name]) => name === key).map(([, value]) => value);
    if (!values.length) continue;
    let value = values.join(', ');
    if (key === 'core' || key === 'hideSameCols') value = m('enabled');
    if (key === 'status' && STATUS.includes(params.status)) value = m(statusLabel(params.status));
    if (key === 'levels') value = values[0].split(',').map(id => LEVELS.find(level => level.id === id)?.label ?? id).join(' › ');
    if (key === 'filter') value = m('filterCount', { count: values.length });
    summary.push({ key, label: m(label), value });
  }
  summary.push({ key: AXIS_KEY, label: m('axis'), value: m(page.some(([key, value]) => key === AXIS_KEY && value === EQUIPMENT_AXIS) ? 'equipmentAxis' : 'itemAxis') });
  return summary;
}
function statusLabel(status: CompareStatus) {
  if (status === 'all') return 'allIncluding';
  if (status === 'missing') return 'missingCombined';
  return status;
}
function complianceLabel(row: ConfigRow, eq: string, params: CompareParams): keyof typeof MESSAGES {
  if (row.values[eq].value === null) return 'missing';
  if (valueMeaning(row, eq, params) === 'violation') return 'violationChip';
  return row.spec ? 'equal' : 'specUnknown';
}
function Summary({ data, status, select, m }: { data: TreePage | null | undefined; status: CompareStatus; select: (status: CompareStatus) => void; m: Message }) {
  const equal = data ? data.counts.all - data.counts.review : 0;
  return <div className="flex shrink-0 flex-wrap items-center gap-2 py-1" data-configuration-summary>
    <ToggleGroup type="single" appearance="filter" size="sm" aria-label={m('status')} value={status} onValueChange={value => { if (value) select(value as CompareStatus); }}>
      {STATUS.map(key => <ToggleGroupItem key={key} value={key} appearance="selected-filter">{m(statusLabel(key))}{data ? ` ${data.counts[key].toLocaleString()}` : ''}</ToggleGroupItem>)}
    </ToggleGroup>
    {status !== 'all' && equal > 0 && <span className="text-xs text-text-muted">{m('hiddenEqual', { count: equal.toLocaleString() })}</span>}
  </div>;
}

function Advanced({ checked, onChange, m }: { checked: boolean; onChange: (checked: boolean) => void; m: Message }) {
  return <Popover><PopoverTrigger asChild><Button variant="secondary" size="toolbar">{m('advanced')}<ChevronDown className="size-3" aria-hidden /></Button></PopoverTrigger><PopoverContent align="end" aria-label={m('advanced')} className="break-keep"><div className="space-y-3">
    <label className="flex items-center gap-2 text-sm"><Checkbox checked={checked} onCheckedChange={value => onChange(value === true)} />{m('coreOnly')}</label>
    <label className="flex items-center gap-2 text-sm text-text-muted"><Checkbox disabled checked={false} />{m('toleranceDisabled')}</label>
  </div></PopoverContent></Popover>;
}
function Conditions({ m }: { m: Message }) {
  const query = useQueryDraft();
  const draft = conditionParams(query.draft.page);
  const fields: PageFilterField[] = [
    { key: 'equipment', label: m('equipment'), kind: 'custom', content: <MultiCombobox density="compact" values={draft.eq} onValuesChange={eq => query.setDraftPage({ equipment: equipmentToKey(eq) })}
      options={EQUIPMENT.map(value => ({ value, label: value }))} label={m('equipment')} listboxLabel={m('options')} emptyText={m('noOptions')}
      clearAllLabel={m('clear')} moreLabel={m('more')} loadingText={m('loading')} retryLabel={m('retry')} searchPlaceholder={m('equipment')}
      selectedSummaryLabel={count => m('selected', { count })} removeLabel={label => m('remove', { label })} maxVisibleChips={0} /> },
    { key: 'mode', label: m('compareMode'), kind: 'custom', content: <Select value={draft.mode} onValueChange={mode => query.setDraftPage({ mode })}><SelectTrigger density="compact" aria-label={m('compareMode')}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{m('allMode')}</SelectItem><SelectItem value="reference">{m('referenceMode')}</SelectItem></SelectContent></Select> },
  ];
  if (draft.mode === 'reference') fields.push({ key: 'ref', label: m('referenceEquipment'), kind: 'custom', content: <Select value={draft.ref} onValueChange={ref => query.setDraftPage({ ref })}><SelectTrigger density="compact" aria-label={m('referenceEquipment')}><SelectValue /></SelectTrigger><SelectContent>{draft.eq.map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select> });
  fields.push({ key: 'asOf', label: m('asOf'), kind: 'custom', content: <Select value="latest"><SelectTrigger density="compact" aria-label={m('asOf')}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="latest">{m('latest')}</SelectItem></SelectContent></Select> });
  return <PageFilterBar mode="draft" collapsible defaultCollapsed={false} preferenceKey="configuration:conditions" summaryItems={summaryFor(query.draft.page, m)} label={m('conditions')} fields={fields} hasPendingChanges={query.dirty.length > 0}
    actions={<Advanced checked={draft.coreOnly ?? false} onChange={coreOnly => query.setDraftPage({ core: coreOnly ? '1' : null })} m={m} />} />;
}


function CompareDetail({ row, eq, params, m }: { row: ConfigRow; eq: string; params: CompareParams; m: Message }) {
  const { lang } = useI18n();
  const groups = distribution(row, params.eq);
  const reference = row.values[params.ref]?.value;
  const selected = row.values[eq]?.value;
  const delta = typeof selected === 'number' && typeof reference === 'number' ? Number((selected - reference).toFixed(10)) : null;
  const different = params.eq.filter(value => valueMeaning(row, value, params) === 'diff' || (params.mode === 'reference' && row.values[value].value !== null && reference !== null && row.values[value].value !== reference));
  let difference = '—';
  if (delta !== null) difference = `${delta > 0 ? '+' : ''}${delta}`;
  else if (selected != null && reference != null) difference = m(selected === reference ? 'equal' : 'different');
  const compliance = valueMeaning(row, eq, params);
  const compare = <div className="space-y-4 break-keep">
    <FieldList><FieldRow label={m('result')} layout="property"><RowStatus row={row} m={m} /></FieldRow></FieldList>
    <section className="space-y-2"><h3 className="text-sm font-semibold">{m('distributionCount', { count: params.eq.length })}</h3>
      <div role="img" aria-label={m('distributionCount', { count: params.eq.length })} className="flex h-3 overflow-hidden rounded-md">{groups.flatMap((group, index) => group.equipment.map(equipment => <span key={equipment} title={`${group.value ?? '—'} · ${equipment}`} className={cn('min-w-0 flex-1', SEGMENTS[index % SEGMENTS.length])} />))}</div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs tabular">{groups.map((group, index) => <span key={String(group.value)} className="inline-flex items-center gap-1"><span aria-hidden className={cn('size-2 rounded-full', SEGMENTS[index % SEGMENTS.length])} />{m('valueCount', { value: group.value ?? '—', count: group.equipment.length, percent: (group.equipment.length / params.eq.length * 100).toFixed(1) })}</span>)}</div>
    </section>
    <section className="space-y-2"><h3 className="text-sm font-semibold">{m(params.mode === 'reference' ? 'differentEquipment' : 'minorityEquipment', { count: different.length })}</h3><div className="flex flex-wrap gap-2">{different.map(equipment => <PrimaryChip key={equipment}>{equipment} {row.values[equipment].value}</PrimaryChip>)}</div></section>
    <section className="space-y-2"><h3 className="text-sm font-semibold">{m('detailedValues')}</h3><FieldList>
      <FieldRow layout="property" label={m('key')} mono>{row.key}</FieldRow>
      {params.mode === 'reference' && <FieldRow layout="property" label={m('referenceValue', { eq: params.ref })} mono>{reference ?? '—'}</FieldRow>}
      <FieldRow layout="property" label={m('selectedValue', { eq })} mono>{selected ?? '—'}</FieldRow>
      {params.mode === 'reference' && <FieldRow layout="property" label={m('difference')} mono>{difference}</FieldRow>}
      <FieldRow layout="property" label={m('spec')}>{row.spec ? `${row.spec.min} ~ ${row.spec.max}` : m('specUnknown')}</FieldRow>
      <FieldRow layout="property" label={m('compliance')}><StatusBadgeFrame appearance="compact" tone={compliance === 'violation' ? 'danger' : 'muted'}>{m(complianceLabel(row, eq, params))}</StatusBadgeFrame></FieldRow>
      <FieldRow layout="property" label={m('dataSource')} mono>{row.source} / {row.filename}</FieldRow>
      <FieldRow layout="property" label={m('collected')}>{formatInstant(row.collectedAt, lang)}</FieldRow>
      <FieldRow layout="property" label={m('rule')}>{m('tolerance')}</FieldRow>
      {!row.coreKnown && <FieldRow layout="property" label="CORE">{m('unknownCore')}</FieldRow>}
    </FieldList></section>
  </div>;
  return compare;
}

function DistributionDetail({ row, params, m }: { row: ConfigRow; params: CompareParams; m: Message }) {
  const groups = distribution(row, params.eq);
  return <div className="space-y-3 break-keep">{groups.map(group => <div key={String(group.value)} className="border-b border-border-subtle pb-2"><p className="text-sm tabular">{m('valueCount', { value: group.value ?? '—', count: group.equipment.length, percent: (group.equipment.length / params.eq.length * 100).toFixed(1) })}</p><p className="t-mono text-text-secondary">{group.equipment.join(', ')}</p></div>)}</div>;
}

/**
 * The drawer renders through the shell slot, so it stays outside the panel's flex column: a QueryView there takes the panel
 * height and collapses the matrix to zero rows (#2525). The detail query loads inside each tab instead.
 */
function ItemDrawer({ row, detail, eq, params, m, close, openTrend }: { row: ConfigRow; detail: QueryState<ConfigRow>; eq: string; params: CompareParams; m: Message; close: () => void; openTrend: () => void }) {
  const [tab, setTab] = useState('compare');
  return <DetailDrawer title={row.item} subtitle={<span className="break-keep">{row.module} › {row.category} › {row.item}</span>} headerActions={row.coreKnown ? <PrimaryChip>CORE</PrimaryChip> : undefined} identity={row.id} onClose={close} tab={tab} onTabChange={setTab} tabs={[
    { id: 'compare', label: m('compareDetail'), content: <QueryView query={detail}>{loaded => <CompareDetail row={loaded} eq={eq} params={params} m={m} />}</QueryView> },
    { id: 'distribution', label: m('distributionTab'), content: <QueryView query={detail}>{loaded => <DistributionDetail row={loaded} params={params} m={m} />}</QueryView> },
    { id: 'history', label: m('history'), content: <Button variant="secondary" onClick={openTrend}>{m('openTrend')}</Button> },
  ]} />;
}


// Kernel starts a new draft on address changes. An axis-only change has the same query basis,
// so carry the previous edits onto the new address while the axis key follows applied state.
function useAxisDraft(query: QueryDraft, basis: string, swapped: boolean) {
  const previous = useRef<{ basis: string; swapped: boolean; query: QueryDraft } | null>(null);
  useLayoutEffect(() => {
    const last = previous.current;
    previous.current = { basis, swapped, query };
    if (!last || last.basis !== basis || last.swapped === swapped || !last.query.dirty.length || last.query.applying) return;
    const { draft, dirty } = last.query;
    const globalPatch = Object.fromEntries(Object.entries(draft.global).filter(([key]) => dirty.includes(key)));
    if (Object.keys(globalPatch).length) query.setDraftGlobal(globalPatch);
    const patch: Record<string, string[] | null> = Object.create(null);
    for (const [key] of query.draft.page) if (key !== AXIS_KEY && (dirty.includes(key) || dirty.includes('page'))) patch[key] = null;
    for (const [key, value] of draft.page) {
      if (key !== AXIS_KEY && (dirty.includes(key) || dirty.includes('page'))) patch[key] = [...(patch[key] ?? []), value];
    }
    if (Object.keys(patch).length) query.setDraftPage(patch);
  }, [basis, swapped, query]);
}

function checkedPivot(response: QueryState<PivotResult>['response'], params: PivotParams): typeof response {
  if (response?.outcome !== 'ok') return response;
  if (!response.data || !validEquipmentResult(response.data, params)) {
    return { ...response, outcome: 'error', data: null };
  }
  return response.data.count === 0 ? { ...response, outcome: 'empty' } : response;
}

function useItemAxisTools(owner: string, conditions: string, swapped: boolean) {
  const [previous, setPrevious] = useState({ owner, conditions, swapped });
  const [grouped, setGrouped] = useState(false);
  const [hidden, setHidden] = useState<string[]>([]);
  if (previous.owner !== owner || previous.conditions !== conditions || previous.swapped !== swapped) {
    setPrevious({ owner, conditions, swapped });
    // The item axis resets on its own query edits. Equipment-axis edits leave its tools alone.
    if (previous.owner !== owner || (!previous.swapped && !swapped && previous.conditions !== conditions)) {
      setGrouped(false);
      setHidden([]);
    }
  }
  return { grouped, setGrouped, hidden, setHidden };
}

const valueOf = (node: TreeRow, column: MatrixColumn) => node.item?.values[column.id]?.value ?? null;
function Comparison({ params, swapped, hideSame, itemTools, m, openTrend, followSelection, reason, matrixRoot }: { params: PivotParams; swapped: boolean; hideSame: boolean; itemTools: ReturnType<typeof useItemAxisTools>; m: Message } & TrendActions) {
  const { lang } = useI18n();
  const { setPage } = usePlatform();
  const { grouped, setGrouped, hidden, setHidden } = itemTools;
  const [window, setWindow] = useState({ expanded: [] as string[], offset: 0, reveal: null as MatrixCell | null });
  const [selection, setSelection] = useState<MatrixCell | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<ConfigRow | null>(null);
  const selectEquipmentCell = useCallback((cell: MatrixCell, item: ConfigRow) => {
    setSelection(cell);
    followSelection(cell.row);
    setDrawer(current => current && item);
  }, [followSelection]);
  const [emphasis, setEmphasis] = useState<MatrixEmphasisRule[]>([]);
  const [onlyMatching, setOnlyMatching] = useState(false);
  const [nav, setNav] = useState<{ kind: 'idle' | 'loading' | 'error'; ordinal: number | null }>({ kind: 'idle', ordinal: null });
  const [exportError, setExportError] = useState(false);
  const request = useRef<AbortController | null>(null);
  useLayoutEffect(() => () => request.current?.abort(), [params.q, swapped]);
  // Search keeps the toolbar mounted, while clearing the same transient state as a remount.
  const [searchGeneration, setSearchGeneration] = useState(params.q);
  if (searchGeneration !== params.q) {
    setSearchGeneration(params.q);
    setWindow({ expanded: [], offset: 0, reveal: null });
    setSelection(null); setSelectedPath(null); setDrawer(null);
    setEmphasis([]); setOnlyMatching(false);
    setNav({ kind: 'idle', ordinal: null }); setExportError(false);
  }
  const [previousAxis, setPreviousAxis] = useState(swapped);
  if (previousAxis !== swapped) {
    setPreviousAxis(swapped);
    setSelection(null); setSelectedPath(null); setDrawer(null);
    setNav({ kind: 'idle', ordinal: null }); setExportError(false);
  }
  const treeParams: TreeParams = { ...params, expanded: window.expanded, offset: window.offset, limit: TREE_WINDOW };
  const query = useMenuQuery(configurationTreeEndpoint, treeParams, { keepPrevious: true });
  const pivotQuery = useMenuQuery(configurationPivotEndpoint, params, { enabled: swapped });
  const checkedResponse = useMemo(() => checkedPivot(pivotQuery.response, params), [pivotQuery.response, params]);
  const equipmentView = { ...pivotQuery, response: checkedResponse };
  const equipmentResult = equipmentView.response?.outcome === 'ok' && equipmentView.response.data?.over === false ? equipmentView.response.data : null;
  const staleSearch = query.showingPrevious && query.resultParams?.q !== params.q;
  const navigation = useMenuFetch(configurationTreeNavigationEndpoint);
  const exports = useMenuFetch(configurationExportEndpoint);
  const workbook = useWorkbookExport();
  const { cancel: cancelExport } = workbook;
  useLayoutEffect(() => { cancelExport(); }, [cancelExport, params.q, swapped]);
  const selectedId = selection?.row ?? null;
  useEffect(() => {
    const node = query.response?.data?.nodes.find(row => row.id === selectedId);
    if (node) setSelectedPath(node.item?.key ?? node.label);
  }, [query.response, selectedId]);
  const detail = useMenuQuery(configurationDetailEndpoint, { ...treeParams, focus: selectedId ?? '' }, drawer !== null && selectedId !== null);
  const eq = selection && params.eq.includes(selection.column) ? selection.column : params.eq[0];
  // One row drives the drawer header and «이력»: the loaded detail, else the selected tree item, else the row it opened on
  // (only while navigation moves the selection outside the current window). Group selections close the drawer (#2525).
  const loadedDetail = detail.response?.outcome === 'ok' && detail.response.data?.id === selectedId ? detail.response.data : null;
  const pivotItem = useMemo(() => {
    const found = equipmentResult?.columns.find(item => item.id === selectedId);
    return found && equipmentResult ? itemFromEquipment(found, equipmentResult.rows) : null;
  }, [equipmentResult, selectedId]);
  const selectedItem = swapped ? pivotItem : query.response?.data?.nodes.find(row => row.id === selectedId)?.item ?? null;
  const shown = drawer && (loadedDetail ?? selectedItem ?? drawer);
  const equipment = params.mode === 'reference' ? [params.ref, ...params.eq.filter(id => id !== params.ref)] : params.eq;
  const columns: MatrixColumn[] = [
    { id: 'identity', label: m('identity'), width: 'identity', pin: 'left' },
    { id: 'status', label: m('status'), width: 'compact', pin: 'left' },
    ...equipment.map(id => ({ id, label: id, headerNote: params.mode === 'reference' && id === params.ref ? m('reference') : undefined, width: 'value' as const, pin: params.mode === 'reference' && id === params.ref ? 'left' as const : undefined })),
    ...(grouped ? [{ id: 'distribution', label: m('distribution'), width: 'wide' as const }] : []),
  ];
  // Every field is toolbar-only (`column: false`): the matrix has no table columns to host a filter editor.
  const toolbarFields = useMemo(() => filterDeclarations(params.eq).map(field => ({ ...field, column: false, label: 'valueKind' in field ? m(field.valueKind === 'number' ? 'numberFilter' : 'textFilter', { eq: field.label }) : field.label })), [params.eq, m]);
  const filterDeclaration = useTableFilterDeclaration('filter', toolbarFields, { lang });
  const navigate = async (direction: 'previous' | 'next') => {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setNav(current => ({ ...current, kind: 'loading' }));
    try {
      const response = await navigation.fetch({ ...treeParams, focus: selectedId, direction }, controller.signal);
      if (controller.signal.aborted) return;
      if (response.outcome !== 'ok' && response.outcome !== 'empty') throw new Error('navigation');
      const target = response.data;
      if (target) { setEmphasis([]); setOnlyMatching(false); setWindow({ expanded: target.expanded, offset: target.offset, reveal: { row: target.focus, column: eq } }); setSelection({ row: target.focus, column: eq }); followSelection(target.focus); }
      setNav(current => ({ kind: 'idle', ordinal: target?.ordinal ?? current.ordinal }));
    } catch { if (!controller.signal.aborted) setNav(current => ({ ...current, kind: 'error' })); } // Failure is visible; no empty destination is substituted.
  };
  const renderCell = (row: TreeRow, column: MatrixColumn) => {
    if (column.id === 'identity') return <><span className="min-w-0 truncate" title={row.label}>{row.label}</span>{row.item?.coreKnown && <PrimaryChip>CORE</PrimaryChip>}{row.item && <span className="ml-auto truncate text-xs text-text-muted" title={row.item.filename}>{row.item.filename}</span>}{!row.item && <span className="ml-auto text-xs text-text-muted">{m('groupDifferences', { count: row.differences })}</span>}</>;
    if (column.id === 'status') return row.item ? <RowStatus row={row.item} m={m} /> : <PrimaryChip>{m('diff')} {row.differences}</PrimaryChip>;
    if (!row.item) return null;
    if (column.id === 'distribution') return <span className="truncate t-mono" title={distributionText(row.item, m)}>{distributionText(row.item, m)}</span>;
    return <span className="t-mono" aria-label={`${valueOf(row, column) ?? '—'} · ${m(valueMeaning(row.item, column.id, params))}`}>{valueOf(row, column) ?? '—'}</span>;
  };
  const selectStatus = (status: CompareStatus) => setPage({ status: status === 'review' ? null : status });
  const filters = (next: ColumnFilter[]) => setPage({ filter: encodeFilterParams(next) });
  const response = query.response;
  const result = response?.data;
  const same = hideSame ? result?.sameColumns ?? [] : [];
  const hiddenColumns = [...new Set([...hidden, ...same, ...(grouped ? params.eq : [])])].filter(id => !(params.mode === 'reference' && id === params.ref));
  return <div ref={matrixRoot} className="flex h-full min-h-0 min-w-0 flex-col break-keep">
    <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-1 border-b border-border-subtle px-2 py-1" data-configuration-toolbar>
      {(result || swapped) && <Summary data={result} status={params.status} select={selectStatus} m={m} />}
      {response && <DataTrustIndicator trust={response.trust} assessments={response.assessments} compact />}
      <ToggleGroup type="single" appearance="filter" size="sm" aria-label={m('axis')} value={swapped ? EQUIPMENT_AXIS : 'item'}
        onValueChange={value => { if (value) setPage({ [AXIS_KEY]: value === EQUIPMENT_AXIS ? EQUIPMENT_AXIS : null }); }}>
        <ToggleGroupItem value="item" appearance="selected-filter">{m('itemAxis')}</ToggleGroupItem>
        <ToggleGroupItem value={EQUIPMENT_AXIS} appearance="selected-filter">{m('equipmentAxis')}</ToggleGroupItem>
      </ToggleGroup>
      <span className="sr-only" role="status">{m(swapped ? 'equipmentAxis' : 'itemAxis')}</span>
      <Input inputSize="toolbar" className="ml-auto w-44" type="search" aria-label={m('search')} placeholder={m('search')} value={params.q} onChange={event => setPage({ q: event.target.value || null })} />
      <FilterLine fields={filterDeclaration.filterFields} filters={params.filters ?? []} onChange={filters} />
      {!swapped && <><Button variant={grouped ? 'secondary' : 'ghost'} size="toolbar" aria-pressed={grouped} onClick={() => setGrouped(value => !value)}>{m('groupValues')}</Button>
      <Button variant={hideSame ? 'secondary' : 'ghost'} size="toolbar" aria-pressed={hideSame} onClick={() => setPage({ hideSameCols: hideSame ? null : '1' })}>{m('hideSame')}</Button></>}
      <MatrixLevelOrder levels={LEVELS} value={params.levels} defaultValue={DEFAULT_LEVELS} label={m('levelOrder')} onChange={levels => setPage({ levels: levels.join(',') })} />
      {!swapped && <><Popover><PopoverTrigger asChild><Button variant="secondary" size="icon-sm" aria-label={m('columns')}><Columns3 className="size-4" /></Button></PopoverTrigger><PopoverContent align="end" aria-label={m('columns')} className="max-h-80 overflow-auto"><div className="space-y-2">{equipment.map(id => <label key={id} className="flex items-center gap-2 text-sm"><Checkbox checked={!hiddenColumns.includes(id)} disabled={params.mode === 'reference' && id === params.ref || same.includes(id) || grouped} onCheckedChange={checked => setHidden(current => checked ? current.filter(value => value !== id) : [...current, id])} />{id}</label>)}</div></PopoverContent></Popover>
      <Button variant="secondary" size="icon-sm" aria-label={m('export')} disabled={staleSearch || !result || !workbook.canExport || workbook.exporting} onClick={async () => {
        setExportError(false);
        const outcome = await workbook.exportWorkbook(async signal => {
          const exported = await exports.fetch(treeParams, signal);
          if (exported.outcome !== 'ok' && exported.outcome !== 'empty') throw new WorkbookRefusal({ ...exported, outcome: exported.outcome });
          if (!exported.data) throw new Error('Missing export rows');
          const shown = columns.filter(column => !hiddenColumns.includes(column.id));
          return [{ name: m('title'), header: shown.map(column => column.label), rows: exported.data.map(row => shown.map(column => { if (column.id === 'identity') return row.key; if (column.id === 'status') return [row.diff && m('diff'), row.violation && m('violation'), row.missing && m('missing'), row.notComparable && m('not-comparable')].filter(Boolean).join(' · ') || m('equal'); if (column.id === 'distribution') return distributionText(row, m); return row.values[column.id].value; })) }];
        }, { fileName: 'configuration', trust: response?.trust ?? null });
        if (outcome === 'failed' || outcome === 'too-large' || outcome === 'refused') setExportError(true);
      }}><Download className="size-4" /></Button></>}

    </div>
    {swapped && <QueryView query={equipmentView} fill emptyAction={<Button variant="secondary" onClick={() => filters([])}>{m('clear')}</Button>}>{data => data.over
      ? <p role="status" className="break-keep px-4 py-12 text-center text-sm">{m('axisLimit', { count: data.count.toLocaleString(lang), limit: COLUMN_LIMIT })}</p>
      : <EquipmentAxisTable data={data} params={params} selection={selection} selectedItem={pivotItem} m={m} openTrend={openTrend}
          onSelect={selectEquipmentCell} trendReason={reason} openDetail={() => setDrawer(pivotItem)} />}
    </QueryView>}
    {!swapped && <QueryView query={query} fill emptyAction={<div className="space-y-2"><Button variant="secondary" onClick={() => filters([])}>{m('clear')}</Button></div>}>{result => {
      const selected = result.nodes.find(row => row.id === selectedId);
      const generation = JSON.stringify([params, result.expanded]);
      return <>
        <div className="px-2"><MatrixEmphasisBar emphasis={emphasis} onEmphasisChange={setEmphasis} onlyMatchingColumns={onlyMatching} onOnlyMatchingColumnsChange={setOnlyMatching} rowLabel={id => result.nodes.find(row => row.id === id)?.label ?? id} label={count => m('emphasisCount', { count })} onlyMatchingLabel={m('onlyMatching')} /></div>
        <TreeMatrix fill keepSelectionInView nodes={result.nodes} columns={columns} identityColumn="identity" label={m('title')} offset={result.offset} totalVisible={result.totalVisible} windowSize={TREE_WINDOW}
          renderCell={renderCell} valueOf={valueOf} selectedCell={selection} onSelectCell={cell => { if (staleSearch) return; request.current?.abort(); setNav({ kind: 'idle', ordinal: null }); setSelection(cell); const item = result.nodes.find(row => row.id === cell.row)?.item ?? null; followSelection(cell.row); setDrawer(current => current && item); }} onActivate={staleSearch ? undefined : node => { if (node.item) openTrend(node.id); }} activateOn="doubleClick"
          onToggle={id => { if (staleSearch) return; request.current?.abort(); setSelection(null); setSelectedPath(null); setDrawer(null); setEmphasis([]); setOnlyMatching(false); setNav({ kind: 'idle', ordinal: null }); const next = new Set(result.expanded.filter(value => value !== 'collapsed')); if (next.has(id)) next.delete(id); else next.add(id); setWindow({ expanded: next.size ? [...next] : ['collapsed'], offset: 0, reveal: null }); }}
          onWindowChange={offset => { if (!staleSearch) setWindow(current => ({ ...current, offset, reveal: null })); }} reveal={window.reveal} hiddenColumns={hiddenColumns} busy={query.status === 'loading' || query.status === 'refreshing'} generation={generation}
          emphasis={emphasis} onEmphasisChange={staleSearch ? undefined : setEmphasis} onlyMatchingColumns={onlyMatching} emphasisActionLabel={m('emphasisAction')} emphasisColumnLabel={m('emphasis')} formatEmphasisCount={count => m('matchCount', { count })}
          cellTone={(node, column) => { if (!node.item || !(column.id in node.item.values)) return undefined; return valueTone(valueMeaning(node.item, column.id, params)); }}
          />
        <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-2 border-t border-border-subtle px-2 py-1 text-xs tabular" data-configuration-bottom>
          <span>{m('navigate')}</span><Button variant="secondary" size="icon-xs" aria-label={m('previous')} disabled={staleSearch || nav.kind === 'loading' || nav.ordinal === 1 || !result.counts.diff} onClick={() => navigate('previous')}><ChevronLeft className="size-3" /></Button><Button variant="secondary" size="icon-xs" aria-label={m('next')} disabled={staleSearch || nav.kind === 'loading' || nav.ordinal === result.counts.diff || !result.counts.diff} onClick={() => navigate('next')}><ChevronRight className="size-3" /></Button>
          <span>{nav.ordinal ?? '—'}/{result.counts.diff.toLocaleString()}</span><span className="min-w-0 flex-1 truncate" title={selected?.item?.key ?? selectedPath ?? undefined}>{m('selection')} {selected?.item?.key ?? selectedPath ?? m('noSelection')}</span>
          {reason && <span role="status" className="break-keep text-text-secondary">{reason}</span>}
          <MatrixToneLegend labels={{ info: m('valueDifference'), danger: m('violation'), missing: m('missingLegend') }} />
          <Button variant="ghost" size="toolbar" disabled={staleSearch || !selected?.item || valueOf(selected, { id: eq, label: eq }) === null} onClick={() => { if (!selected) return; const rule = sameValueRule(selected, { id: eq, label: eq }, valueOf); if (rule) setEmphasis(current => [...current.filter(value => value.row !== rule.row), rule]); }}>{m('sameValue')}</Button>
          <Button variant="ghost" size="toolbar" disabled={staleSearch || !selected?.item} onClick={() => { if (selected?.item) setDrawer(selected.item); }}>{m('openSelected')}<ChevronRight className="size-3" /></Button>
        </div>
      </>;
    }}</QueryView>}
    {nav.kind === 'error' && <span role="status">{m('navigationError')}</span>}{exportError && <span role="status">{m('exportFailed')} {m('exportLimit', { count: EXPORT_LIMIT.toLocaleString() })}</span>}
    {shown && <ItemDrawer row={shown} detail={detail} eq={eq} params={params} m={m} close={() => setDrawer(null)} openTrend={() => { setDrawer(null); openTrend(shown.id); }} />}
  </div>;
}

export default function Configuration() {
  const m = useMessages(MESSAGES);
  const { page, pageParam, pageParams, session, revision, global } = usePlatform();
  const query = useQueryDraft();
  const draft = conditionParams(query.draft.page);
  const issues = [];
  if (!validEquipment(draft.eq)) issues.push({ key: 'equipment', label: m('equipment'), reason: m('chooseEquipment') });
  if (draft.mode === 'reference' && !draft.eq.includes(draft.ref)) issues.push({ key: 'ref', label: m('referenceEquipment'), reason: m('referenceRequired') });
  const historyPageSummary = useCallback((_global: GlobalContext, candidate: readonly Pair[]) => summaryFor(candidate, m), [m]);
  const equipmentKey = pageParam('equipment');
  const eq = useMemo(() => equipmentFromKey(equipmentKey), [equipmentKey]);
  const levelsKey = pageParam('levels');
  const levels = useMemo(() => levelsKey?.split(',') ?? DEFAULT_LEVELS, [levelsKey]);
  const axis = pageParam(AXIS_KEY);
  const swapped = axis === EQUIPMENT_AXIS;
  useAxisDraft(query, JSON.stringify([session.user.id, revision, global, page.filter(([key]) => key !== AXIS_KEY)]), swapped);
  const rawFilters = pageParams('filter');
  const trendItem = pageParam(TREND_ITEM_KEY);
  const parsedFilters = useMemo(() => readFilters(rawFilters, eq), [rawFilters, eq]);
  const params = useMemo<PivotParams>(() => {
    const conditions = conditionParams(page);
    return { ...conditions, levels, filters: parsedFilters.ok ? parsedFilters.filters : [] };
  }, [page, levels, parsedFilters]);
  const validation = usePageKeyRules([
    { key: AXIS_KEY, label: MESSAGES.axis, valid: raw => raw === EQUIPMENT_AXIS },
    { key: 'equipment', label: MESSAGES.equipment, valid: validEquipmentKey },
    { key: 'mode', label: MESSAGES.compareMode, valid: raw => raw === 'all' || raw === 'reference' },
    { key: 'ref', label: MESSAGES.reference, valid: raw => EQUIPMENT.includes(raw) && (params.mode !== 'reference' || eq.includes(raw)) },
    { key: 'asOf', label: MESSAGES.asOf, valid: raw => raw === 'latest' },
    { key: 'core', label: MESSAGES.coreOnly, valid: raw => raw === '1' },
    { key: 'status', label: MESSAGES.status, valid: raw => STATUS.includes(raw as CompareStatus) },
    { key: 'levels', label: MESSAGES.levelOrder, valid: raw => validLevels(raw.split(',')) },
    { key: TREND_ITEM_KEY, label: MESSAGES.trendItem, valid: isRowId },
    { key: HW_TREND_ITEM_KEY, label: MESSAGES.hwTimeTrend, valid: raw => raw === HW_TREND_CLOSED || isRowId(raw) },
    { key: 'hideSameCols', label: MESSAGES.hideSame, valid: raw => raw === '1' },
    { key: 'filter', label: MESSAGES.filter, repeated: true, valid: () => parsedFilters.ok },
  ]);
  const identity = JSON.stringify([{ ...params, q: undefined }, session.user.id, revision, global]);
  const tools = useItemAxisTools(JSON.stringify([session.user.id, revision, global.scopeId]), JSON.stringify([identity, params.q]), swapped);
  let content;
  if (validation.invalid) content = <PageKeyWarning sentences={validation.sentences} onRecover={validation.recover} />;
  else if (!validEquipment(eq)) content = <EmptyState title={m('chooseEquipment')} />;
  else if (params.mode === 'reference' && !eq.includes(params.ref)) content = <EmptyState title={m('referenceRequired')} />;
  else content = <ConfigurationWorkspace itemId={trendItem} params={params}>
    {actions => <Comparison key={`matrix:${identity}`} params={params} swapped={swapped} hideSame={pageParam('hideSameCols') === '1'} itemTools={tools} m={m} {...actions} />}
  </ConfigurationWorkspace>;
  return <PlatformPage layout="fill" contextExtension={<Conditions m={m} />}
    queryBarExtension={{ pageSummary: summaryFor(query.draft.page, m), appliedPageSummary: summaryFor(page, m), historyPageSummary, issues }}>
    {content}
  </PlatformPage>;
}
