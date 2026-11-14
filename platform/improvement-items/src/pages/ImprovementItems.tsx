import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { encodeFilterParam, type ColumnFilterSpec, type Pair } from '@ap/contracts';
import { PlatformLink, useMenuFetch, usePlatform } from '@ap/kernel';
import { ManagementLayout, PageKeyWarning, PlatformDataTable, PlatformPage, TableUrlWarning, useTableUrlState, type PlatformColumn, type TableFilterField, type TableUrlState } from '@ap/components';
import { Button, Input, SearchInput, Tabs, TabsContent, TabsList, TabsTrigger } from '@ap/ui';
import { MANAGE_PERMISSION, SORT_IDS, filterSpecs, itemsEndpoint, type ItemRow, type Origin } from '../endpoints';
import { filtersForView, formatTarget, type View } from '../model';
import { parseOriginPage, snapshotOrigin } from '../origin';
import { useCopy } from '../copy';
import { CreateDrawer } from './CreateDrawer';
import { Field, ItemStatus } from './parts';
import { QuestReference } from './QuestReference';
function ItemTable({ q, view, onClear }: { q: string; view: View; onClear: () => void }) {
  const c = useCopy(), { setPage, linkTo } = usePlatform();
  const uid = useId();
  const pages = useMenuFetch(itemsEndpoint);
  const [draft, setDraft] = useState({ applied: q, value: q });
  if (draft.applied !== q) setDraft({ applied: q, value: q });
  const specs = useMemo<Record<string, ColumnFilterSpec>>(() => ({ ...filterSpecs, status: { ...filterSpecs.status as Extract<ColumnFilterSpec, { kind: 'enum' }>, options: Object.entries(c.statuses).map(([value, label]) => ({ value, label })) }, assignee: { ...filterSpecs.assignee as Extract<ColumnFilterSpec, { kind: 'enum' }>, options: [{ value: 'me', label: c.mine }] }, questLinked: { ...filterSpecs.questLinked as Extract<ColumnFilterSpec, { kind: 'enum' }>, options: [{ value: 'true', label: c.quest }, { value: 'false', label: c.questNone }] }, origin: { ...filterSpecs.origin as Extract<ColumnFilterSpec, { kind: 'enum' }>, options: [{ value: 'cycle-time', label: c.lang === 'ko' ? '사이클타임 상세' : 'Cycle time detail' }] } }), [c]);
  const labels = useMemo(() => ({ status: c.status, assignee: c.assignee, questLinked: c.questLinked, origin: c.origin }), [c]);
  const filters = useMemo(() => ({ key: 'filter', specs, labels }), [specs, labels]);
  // Clearing a preset's last condition records the transition to the all view in the same write (C4):
  // a refresh must not reinstall the preset the user emptied.
  const clearToAll = useRef(false);
  const tableState = useTableUrlState(SORT_IDS, { filters, extraPatch: () => (clearToAll.current ? { view: 'all' } : undefined) });
  const { invalid, sentences, recoverKeys, cause } = tableState;
  const urlState: TableUrlState | undefined = tableState.urlState && { ...tableState.urlState, onChange: (next, reason) => {
    if (next.filters && next.filters.length === 0 && view !== 'all') clearToAll.current = true;
    tableState.urlState!.onChange(next, reason);
    clearToAll.current = false;
  } };
  const search = <SearchInput aria-label={c.search} placeholder={c.search} value={draft.value} onValueChange={value => setDraft({ applied: q, value })} onCommit={() => setPage({ q: draft.value.trim() || null, page: null })} />;
  // The shared editor is enum-only, so the Quest ID filter gets the consumer's own ID entry (C1):
  // it writes the same server wire shape (`questId:<op>:<ids>`) into the shared filter key,
  // keeping the active condition's operator (an applied exclusion stays an exclusion).
  const activeQuest = urlState?.filters?.find(f => f.id === 'questId' && (f.op === 'in' || f.op === 'notIn'));
  const activeQuestText = activeQuest && 'value' in activeQuest && Array.isArray(activeQuest.value) ? activeQuest.value.map(v => String(v)).join(', ') : '';
  const [questDraft, setQuestDraft] = useState({ applied: '', value: '' });
  if (questDraft.applied !== activeQuestText) setQuestDraft({ applied: activeQuestText, value: activeQuestText });
  const applyQuest = () => {
    if (!urlState) return;
    const values = [...new Set(questDraft.value.split(',').map(s => s.trim()).filter(Boolean))];
    const rest = (urlState.filters ?? []).filter(f => f.id !== 'questId');
    if (values.length === 0) { urlState.onChange({ sorting: urlState.sorting, page: null, filters: rest }, 'user'); return; }
    const op = activeQuest?.op === 'in' || activeQuest?.op === 'notIn' ? activeQuest.op : 'in';
    urlState.onChange({ sorting: urlState.sorting, page: null, filters: [...rest, { id: 'questId', op, value: values }] }, 'user');
  };
  const columns = useMemo<PlatformColumn<ItemRow>[]>(() => [
    { id: 'itemNo', header: c.number, size: 92, minSize: 84, cell: row => <PlatformLink className="font-mono text-accent-primary hover:underline" href={linkTo('improvement-item', { params: { itemId: row.id }, returnTo: true })}>IM-{row.itemNo}</PlatformLink> },
    { id: 'problem', header: c.problem, sortable: false, size: 240, cell: row => <div className="space-y-1"><p className="whitespace-normal break-words">{row.problem}</p>{row.status === 'done' && <p className="text-xs text-text-secondary">{c.effectPending}</p>}</div> },
    { id: 'status', header: c.status, size: 132, minSize: 118, filter: specs.status, filterPinned: 1, cell: row => <ItemStatus status={row.status} /> },
    { id: 'assignee', header: c.assignee, size: 120, minSize: 112, sortable: false, filter: specs.assignee, filterPinned: 2, exportValue: row => row.assignee?.displayName ?? c.unset, cell: row => row.assignee?.displayName ?? c.unset },
    { id: 'quest', header: c.quest, size: 200, minSize: 160, sortable: false, exportValue: row => row.quest?.titleSnapshot ?? c.questNone, cell: row => row.quest ? <QuestReference id={row.quest.id} snapshot={row.quest.titleSnapshot} /> : <span className="text-text-secondary">{c.questNone}</span> },
    { id: 'targets', header: c.target, size: 150, sortable: false, exportValue: row => row.restricted ? c.restricted : row.targets.map(t => formatTarget(t, c)).join(' · '), cell: row => <span className="whitespace-normal break-words">{row.restricted ? c.restricted : row.targets.map(t => formatTarget(t, c)).join(' · ') || c.unset}</span> },
    { id: 'actionDate', header: c.actionDate, size: 120, sortable: false, cell: row => row.actionDate ?? c.unset },
  ], [c, linkTo, specs]);
  const fields = useMemo<TableFilterField[]>(() => [{ id: 'questLinked', label: { ko: '과제(Quest) 연결', en: 'Quest link' }, spec: specs.questLinked!, pinned: 3 }, { id: 'origin', label: { ko: '분석 출처', en: 'Analysis source' }, spec: specs.origin! }], [specs]);
  if (invalid) return <TableUrlWarning search={search} sentences={sentences} recoverKeys={recoverKeys} cause={cause} />;
  return <div className="improvement-items-table space-y-2">
    <div className="flex items-end gap-2">
      <Field id={`${uid}-quest`} label={c.questIdEntry}><Input id={`${uid}-quest`} maxLength={200} value={questDraft.value} onChange={e => setQuestDraft(d => ({ ...d, value: e.target.value }))} /></Field>
      <Button type="button" variant="secondary" size="sm" onClick={applyQuest}>{c.apply}</Button>
    </div>
    <PlatformDataTable<ItemRow> title={c.title} ariaLabel={c.title} columns={columns} getRowId={r => r.id} preferenceKey="improvement-items:v1" pageSize={25} filterKey={q} urlState={urlState} search={search} filterFields={fields} loadPage={(query, signal) => pages.fetch({ ...query, q: q || null }, signal)} emptyAction={<Button variant="secondary" size="sm" onClick={onClear}>{c.clear}</Button>} />
  </div>;
}
export default function ImprovementItems() {
  const c = useCopy(), { pageParam, pageParams, setPage, can, canOpen, global, registry } = usePlatform();
  const view = pageParam('view') ?? 'mine', q = pageParam('q') ?? '';
  const validView = ['mine', 'all', 'unlinked'].includes(view);
  // Address-state rule, not a one-shot mount flag (#2012): whenever the address names a preset view
  // (or none) with no `filter`, the preset is written with `replace` — also on a same-menu re-entry
  // that keeps this page mounted. The user's own clearing writes `view: 'all'` (C4), and an explicit
  // `view`/`filter` deep link already fails the condition, so neither is touched. The write makes the
  // condition false, so it cannot loop; the table waits until then so no unfiltered list is fetched.
  const needsPreset = validView && view !== 'all' && pageParams('filter').length === 0;
  useEffect(() => {
    if (needsPreset) setPage({ view, filter: filtersForView(view as View).map(encodeFilterParam) }, { replace: true });
  }, [needsPreset, view, setPage]);
  const chooseView = (value: View) => setPage({ view: value, filter: filtersForView(value).map(encodeFilterParam), q: null, page: null, sort: null });
  const clear = () => setPage({ view: 'all', filter: null, q: null, page: null, sort: null });
  const canWrite = can(MANAGE_PERMISSION), creating = pageParam('focus') === 'new';
  // The drawer is a controlled sheet with no Radix trigger, so every close path returns focus here (UX1).
  // An effect does it after the commit, so the unmounting sheet/dialog focus scopes cannot steal it back.
  const createButton = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);
  const closeCreate = () => { returnFocus.current = true; setPage({ focus: null, origin: null, originPage: null }); };
  useEffect(() => {
    if (creating || !returnFocus.current) return;
    returnFocus.current = false;
    createButton.current?.focus();
  }, [creating]);
  const source = pageParam('origin');
  let validSource = false;
  if (source) { try { validSource = canOpen(source); } catch { /* Unknown menu ids stay rejected and visible. */ } }
  const separatePage = pageParam('originPage');
  // Without originPage the origin carries global Context only (v0.28.0 shape); the destination's own keys are never source state.
  const sourcePage: Pair[] | null = separatePage === null ? [] : parseOriginPage(separatePage);
  const origin: Origin | null = source && validSource && sourcePage ? snapshotOrigin(registry.menuById(source), global, sourcePage) : null;
  return <PlatformPage description={c.description} primaryAction={canWrite ? <Button ref={createButton} onClick={() => setPage({ focus: 'new' })}><Plus className="size-4" aria-hidden />{c.create}</Button> : undefined}>
    {!canWrite && <p role="note" className="text-sm text-text-secondary">{c.denied}</p>}
    {!validView && <PageKeyWarning sentences={[c.unsupportedView]} onRecover={clear} />}
    {creating && source && (!validSource || !sourcePage) && <PageKeyWarning sentences={[c.invalidOrigin]} onRecover={() => setPage({ origin: null, originPage: null })} />}
    {creating && canWrite && (!source || (validSource && sourcePage)) && <CreateDrawer origin={origin} onClose={closeCreate} />}
    <Tabs value={validView ? view : 'all'} onValueChange={value => chooseView(value as View)}>
      <TabsList><TabsTrigger value="mine">{c.mine}</TabsTrigger><TabsTrigger value="all">{c.all}</TabsTrigger><TabsTrigger value="unlinked">{c.unlinked}</TabsTrigger></TabsList>
      {view === 'mine' && <p className="py-3 text-xs text-text-secondary">{c.mineHint}</p>}
      <TabsContent value={validView ? view : 'all'}>{!needsPreset && <ManagementLayout table={<ItemTable q={q} view={validView ? (view as View) : 'all'} onClear={clear} />} />}</TabsContent>
    </Tabs>
  </PlatformPage>;
}
