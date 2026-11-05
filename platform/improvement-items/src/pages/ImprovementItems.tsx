import { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { encodeFilterParam, type ColumnFilterSpec } from '@ap/contracts';
import { PlatformLink, useMenuFetch, usePlatform } from '@ap/kernel';
import { ManagementLayout, PageKeyWarning, PlatformDataTable, PlatformPage, TableUrlWarning, useTableUrlState, type PlatformColumn, type TableFilterField } from '@ap/components';
import { Button, SearchInput, Tabs, TabsContent, TabsList, TabsTrigger } from '@ap/ui';
import { MANAGE_PERMISSION, SORT_IDS, filterSpecs, itemsEndpoint, type ItemRow, type Origin } from '../endpoints';
import { filtersForView, type View } from '../model';
import { useCopy } from '../copy';
import { CreateDrawer } from './CreateDrawer';
import { ItemStatus } from './parts';
import { QuestReference } from './QuestReference';
function ItemTable({ q, onClear }: { q: string; onClear: () => void }) {
  const c = useCopy(), { setPage, linkTo } = usePlatform();
  const pages = useMenuFetch(itemsEndpoint);
  const [draft, setDraft] = useState({ applied: q, value: q });
  if (draft.applied !== q) setDraft({ applied: q, value: q });
  const specs = useMemo<Record<string, ColumnFilterSpec>>(() => ({ ...filterSpecs, status: { ...filterSpecs.status as Extract<ColumnFilterSpec, { kind: 'enum' }>, options: Object.entries(c.statuses).map(([value, label]) => ({ value, label })) }, assignee: { ...filterSpecs.assignee as Extract<ColumnFilterSpec, { kind: 'enum' }>, options: [{ value: 'me', label: c.mine }] }, questLinked: { ...filterSpecs.questLinked as Extract<ColumnFilterSpec, { kind: 'enum' }>, options: [{ value: 'true', label: c.quest }, { value: 'false', label: c.questNone }] } }), [c]);
  const labels = useMemo(() => ({ status: c.status, assignee: c.assignee, questLinked: c.questLinked, questId: c.quest, origin: c.origin }), [c]);
  const filters = useMemo(() => ({ key: 'filter', specs, labels }), [specs, labels]);
  const { urlState, invalid, sentences, recoverKeys, cause } = useTableUrlState(SORT_IDS, { filters });
  const search = <SearchInput aria-label={c.search} placeholder={c.search} value={draft.value} onValueChange={value => setDraft({ applied: q, value })} onCommit={() => setPage({ q: draft.value.trim() || null, page: null })} />;
  const columns = useMemo<PlatformColumn<ItemRow>[]>(() => [
    { id: 'itemNo', header: c.number, size: 92, minSize: 84, cell: row => <PlatformLink className="font-mono text-accent-primary hover:underline" href={linkTo('improvement-item', { params: { itemId: row.id }, returnTo: true })}>IM-{row.itemNo}</PlatformLink> },
    { id: 'problem', header: c.problem, sortable: false, size: 240, cell: row => <div className="space-y-1"><p className="whitespace-normal break-words">{row.problem}</p>{row.status === 'done' && <p className="text-xs text-text-secondary">{c.effectPending}</p>}</div> },
    { id: 'status', header: c.status, size: 132, minSize: 118, filter: specs.status, filterPinned: 1, cell: row => <ItemStatus status={row.status} /> },
    { id: 'assignee', header: c.assignee, size: 120, minSize: 112, sortable: false, filter: specs.assignee, filterPinned: 2, exportValue: row => row.assignee?.displayName ?? c.unset, cell: row => row.assignee?.displayName ?? c.unset },
    { id: 'quest', header: c.quest, size: 200, minSize: 160, sortable: false, exportValue: row => row.quest?.titleSnapshot ?? c.questNone, cell: row => row.quest ? <QuestReference id={row.quest.id} snapshot={row.quest.titleSnapshot} /> : <span className="text-text-secondary">{c.questNone}</span> },
    { id: 'targets', header: c.target, size: 150, sortable: false, exportValue: row => row.targets.map(t => t.displayName).join(' · '), cell: row => <span className="whitespace-normal break-words">{row.targets.map(t => t.displayName).join(' · ') || c.unset}</span> },
    { id: 'actionDate', header: c.actionDate, size: 120, sortable: false, cell: row => row.actionDate ?? c.unset },
  ], [c, linkTo, specs]);
  const fields = useMemo<TableFilterField[]>(() => [{ id: 'questLinked', label: { ko: '과제(Quest) 연결', en: 'Quest link' }, spec: specs.questLinked!, pinned: 3 }, { id: 'questId', label: { ko: '과제(Quest) ID', en: 'Quest ID' }, spec: specs.questId! }, { id: 'origin', label: { ko: '분석 출처', en: 'Analysis source' }, spec: specs.origin! }], [specs]);
  if (invalid) return <TableUrlWarning search={search} sentences={sentences} recoverKeys={recoverKeys} cause={cause} />;
  return <PlatformDataTable<ItemRow> title={c.title} ariaLabel={c.title} columns={columns} getRowId={r => r.id} preferenceKey="improvement-items:v1" pageSize={25} filterKey={q} urlState={urlState} search={search} filterFields={fields} loadPage={(query, signal) => pages.fetch({ ...query, q: q || null }, signal)} emptyAction={<Button variant="secondary" size="sm" onClick={onClear}>{c.clear}</Button>} />;
}
export default function ImprovementItems() {
  const c = useCopy(), { pageParam, pageParams, setPage, can, canOpen, global } = usePlatform();
  const view = pageParam('view') ?? 'mine', q = pageParam('q') ?? '';
  const validView = ['mine', 'all', 'unlinked'].includes(view);
  const [initialized, setInitialized] = useState(false);
  const rawFilters = pageParams('filter');
  useEffect(() => {
    if (initialized) return;
    if (validView && rawFilters.length === 0 && view !== 'all') setPage({ view, filter: filtersForView(view as View).map(encodeFilterParam) }, { replace: true });
    setInitialized(true);
  }, [initialized, validView, view, rawFilters.length, setPage]);
  const chooseView = (value: View) => setPage({ view: value, filter: filtersForView(value).map(encodeFilterParam), q: null, page: null, sort: null });
  const clear = () => setPage({ view: 'all', filter: null, q: null, page: null, sort: null });
  const canWrite = can(MANAGE_PERMISSION), creating = pageParam('focus') === 'new';
  const source = pageParam('origin');
  let validSource = false;
  if (source) { try { validSource = canOpen(source); } catch { /* Unknown menu ids stay rejected and visible. */ } }
  const origin: Origin | null = source && validSource ? { menuId: source, context: { ...global } } : null;
  return <PlatformPage description={c.description} primaryAction={canWrite ? <Button onClick={() => setPage({ focus: 'new' })}><Plus className="size-4" aria-hidden />{c.create}</Button> : undefined}>
    {!canWrite && <p role="note" className="text-sm text-text-secondary">{c.denied}</p>}
    {!validView && <PageKeyWarning sentences={[c.unsupportedView]} onRecover={clear} />}
    {creating && source && !validSource && <PageKeyWarning sentences={[c.invalidOrigin]} onRecover={() => setPage({ origin: null })} />}
    {creating && canWrite && (!source || validSource) && <CreateDrawer origin={origin} onClose={() => setPage({ focus: null, origin: null })} />}
    <Tabs value={validView ? view : 'all'} onValueChange={value => chooseView(value as View)}>
      <TabsList><TabsTrigger value="mine">{c.mine}</TabsTrigger><TabsTrigger value="all">{c.all}</TabsTrigger><TabsTrigger value="unlinked">{c.unlinked}</TabsTrigger></TabsList>
      {view === 'mine' && <p className="py-3 text-xs text-text-secondary">{c.mineHint}</p>}
      <TabsContent value={validView ? view : 'all'}>{initialized && <ManagementLayout table={<ItemTable q={q} onClear={clear} />} />}</TabsContent>
    </Tabs>
  </PlatformPage>;
}
