import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent } from 'react';
import { ChevronDown, ChevronRight, ServerCrash } from 'lucide-react';
import { isHierarchyFailure, type HierarchyNode, type HierarchySource, type PageConditionCategory } from '@ap/contracts';
import { encodePageConditions, PageConditionError, useI18n, useMessages } from '@ap/kernel';
import { Button, Checkbox, cn, SearchInput } from '@ap/ui';
import type { PageConditionCategoriesProps } from './PageConditionCategories';
import { StateMessage } from '../StateView';
import { PAGE_CONDITION_ISSUE_MESSAGES, PAGE_CONDITION_MESSAGES } from './pageConditionMessages';
import { hierarchyTreeKey } from '../hierarchy/treeKeyboard';
import { PAGE_CONDITION_TREE_MESSAGES } from './pageConditionTreeMessages';
import { PageConditionTreeState, type TreeLoad, type TreeSnapshot } from './pageConditionTreeState';

export type PageConditionTreeProps = Pick<PageConditionCategoriesProps, 'declaration' | 'values' | 'rawPairs' | 'issues' | 'onChange' | 'inputsKey'> & {
  category: PageConditionCategory;
  source?: HierarchySource;
  /** ADR-0118: default 50, maximum 200 per request. */
  pageSize?: number;
};
type Row = { node: HierarchyNode; depth: number; position: number; total?: number };
type Operation = { status: 'idle' } | { status: 'loading'; controller: AbortController; valuesKey: string } | { status: 'refused'; message: string } | { status: 'failed'; load: TreeLoad<never>; node?: HierarchyNode };
const INDENT = ['pl-0', 'pl-4', 'pl-8', 'pl-12', 'pl-15'] as const;
const SEARCH_DELAY_MS = 200;
function treeRows(snapshot: TreeSnapshot, expanded: ReadonlySet<string>): Row[] {
  const rows: Row[] = [];
  const visited = new Set<string>();
  const rootPage = snapshot.pages.get(null)?.value;
  const stack: Row[] = rootPage ? rootPage.nodes.map((node, index) => ({ node, depth: 0, position: index + 1, total: rootPage.totalCount })).reverse() : [];
  while (stack.length) {
    const row = stack.pop()!;
    if (visited.has(row.node.id)) continue;
    visited.add(row.node.id); rows.push(row);
    const page = snapshot.pages.get(row.node.id);
    if (expanded.has(row.node.id) && page?.value) {
      for (let index = page.value.nodes.length - 1; index >= 0; index--) stack.push({ node: page.value.nodes[index], depth: row.depth + 1, position: index + 1, total: page.value.totalCount });
    }
  }
  return rows;
}
/** Values only: targets are ignored. The caller supplies the full session/Scope/Context identity. */
export function PageConditionTree(props: PageConditionTreeProps) {
  if (props.category.kind.type !== 'tree') throw new Error('PageConditionTree requires a tree category');
  return <TreeEditor key={JSON.stringify([props.inputsKey, props.declaration, props.category, props.pageSize])} {...props} kind={props.category.kind} />;
}
function TreeEditor({ category, kind, source, pageSize = 50, declaration, values, issues = [], rawPairs = [], onChange }: PageConditionTreeProps & { kind: Extract<PageConditionCategory['kind'], { type: 'tree' }> }) {
  const { lang, t } = useI18n();
  const m = useMessages(PAGE_CONDITION_MESSAGES);
  const tm = useMessages(PAGE_CONDITION_TREE_MESSAGES);
  const im = useMessages(PAGE_CONDITION_ISSUE_MESSAGES);
  const id = useId();
  const [state] = useState(() => new PageConditionTreeState(source, pageSize));
  const snapshot = useSyncExternalStore(state.subscribe, state.read, state.read);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [focusId, setFocusId] = useState<string | null>(null);
  const elements = useRef(new Map<string, HTMLDivElement>());
  const [query, setQuery] = useState('');
  const [readyQuery, setReadyQuery] = useState('');
  const [operation, setOperation] = useState<Operation>({ status: 'idle' });
  const valuesKey = JSON.stringify(values);
  const localIssues = issues.filter(issue => issue.categoryId === category.id);
  const raw = rawPairs.filter(([key]) => key === kind.key);
  const value = values[kind.key];
  const selected = useMemo<readonly string[]>(() => Array.isArray(value) ? value : [], [value]);
  const selectedKey = JSON.stringify(selected);
  const disabled = !!category.disabled;
  const searching = query.trim() !== '' && !!source?.searchNodes;
  const waitingSearch = searching && query.trim() !== readyQuery;
  const readySearch = snapshot.search;
  const rows = useMemo(() => {
    if (!searching) return treeRows(snapshot, expanded);
    const page = readySearch.value;
    if (!page || waitingSearch) return [];
    return page.nodes.map((node, index) => ({ node, depth: 0, position: index + 1, total: page.totalCount }));
  }, [searching, readySearch, waitingSearch, snapshot, expanded]);
  const expandedRows = useMemo(() => rows.filter(row => expanded.has(row.node.id) && row.node.hasChildren), [rows, expanded]);
  const entryId = rows.some(row => row.node.id === focusId) ? focusId : rows[0]?.node.id;
  const loading = operation.status === 'loading';

  useEffect(() => { state.loadChildren(null); return () => state.dispose(); }, [state]);
  // A collapsed ancestor cancels hidden requests; resume only expanded descendants that become visible again.
  useEffect(() => { if (!searching) expandedRows.forEach(row => state.loadChildren(row.node.id)); }, [state, searching, expandedRows]);
  useEffect(() => { selected.forEach(value => state.resolve(value)); }, [state, selectedKey, selected]);
  useEffect(() => {
    if (!searching) { state.cancel('search'); return; }
    state.cancel('search');
    const timer = setTimeout(() => { setReadyQuery(query.trim()); state.search(query.trim()); }, SEARCH_DELAY_MS);
    return () => { clearTimeout(timer); state.cancel('search'); };
  }, [state, searching, query]);
  const searchIds = JSON.stringify(rows.map(row => row.node.id));
  useEffect(() => { if (searching && !waitingSearch) rows.forEach(row => state.resolve(row.node.id)); }, [state, searching, waitingSearch, searchIds, rows]);
  useEffect(() => {
    if (operation.status !== 'loading') return;
    if (operation.valuesKey !== valuesKey) { operation.controller.abort(); setOperation({ status: 'idle' }); }
    return () => operation.controller.abort();
  }, [operation, valuesKey]);

  const pathIds = (node: HierarchyNode): string[] => {
    const ids: string[] = [];
    let parent = node.parentId;
    const visited = new Set([node.id]);
    while (parent && !visited.has(parent)) { visited.add(parent); ids.push(parent); parent = state.node(parent)?.parentId; }
    const path = snapshot.paths.get(node.id);
    if (path?.status === 'ready') return path.value.slice(0, -1).map(item => item.id);
    return ids;
  };
  const under = (id: string, ancestor: string) => {
    const node = state.node(id);
    return id === ancestor || (!!node && pathIds(node).includes(ancestor));
  };
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  // One pass over the loaded nodes per snapshot/selection, so each row's tri-state is a lookup rather than a scan of every loaded node (#2360).
  const tally = useMemo(() => {
    const mixed = new Set<string>();
    for (const id of selected) { const node = state.node(id); if (node) for (const ancestor of pathIds(node)) mixed.add(ancestor); }
    const leafTotal = new Map<string, number>();
    const leafChecked = new Map<string, number>();
    const incomplete = new Set<string>();
    for (const page of snapshot.pages.values()) {
      if (page.status !== 'ready') continue;
      for (const node of page.value.nodes) {
        const above = pathIds(node);
        if (!node.hasChildren) {
          for (const ancestor of above) {
            leafTotal.set(ancestor, (leafTotal.get(ancestor) ?? 0) + 1);
            if (selectedSet.has(node.id)) leafChecked.set(ancestor, (leafChecked.get(ancestor) ?? 0) + 1);
          }
        } else if (!pageDone(node.id)) { incomplete.add(node.id); above.forEach(ancestor => incomplete.add(ancestor)); }
      }
    }
    return { mixed, leafTotal, leafChecked, incomplete };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pathIds/pageDone read `state` and `snapshot`, both listed through `snapshot`.
  }, [snapshot, selected, selectedSet, state]);
  function pageDone(id: string) { const page = snapshot.pages.get(id); return page?.status === 'ready' && page.value.nextCursor === undefined; }
  const covered = (node: HierarchyNode) => kind.value === 'nodes' && pathIds(node).some(id => selectedSet.has(id));
  const checked = (node: HierarchyNode): boolean | 'mixed' => {
    if (selectedSet.has(node.id) || covered(node)) return true;
    if (kind.value === 'leaves' && node.hasChildren && pageDone(node.id) && !tally.incomplete.has(node.id)) {
      const total = tally.leafTotal.get(node.id) ?? 0;
      if (total > 0 && total === (tally.leafChecked.get(node.id) ?? 0)) return true;
    }
    return tally.mixed.has(node.id) ? 'mixed' : false;
  };
  function validate(next: readonly string[]) {
    encodePageConditions({ pageConditions: declaration }, { ...values, [kind.key]: next });
  }
  function cancel() { if (operation.status === 'loading') operation.controller.abort(); setOperation({ status: 'idle' }); }
  function commit(next: readonly string[]) { validate(next); onChange(category.id, { [kind.key]: next }); }
  function refuse(error: unknown) {
    if (error instanceof PageConditionError) setOperation({ status: 'refused', message: [...new Set(error.issues.map(issue => im(issue.reason)))].join(' ') });
    else setOperation({ status: 'failed', load: { status: 'error' } });
  }
  async function toggle(node: HierarchyNode) {
    if (disabled || loading || covered(node) || (searching && snapshot.paths.get(node.id)?.status !== 'ready')) return;
    if (localIssues.length > 0) { setOperation({ status: 'refused', message: im('invalid-value') }); return; }
    setOperation({ status: 'idle' });
    if (kind.value === 'leaves' && selected.some(id => state.node(id)?.hasChildren)) { setOperation({ status: 'refused', message: tm('invalidLeaf') }); return; }
    const removing = checked(node) === true;
    try {
      if (removing) { commit(selected.filter(value => !under(value, node.id))); return; }
      if (kind.value === 'nodes') { commit([...selected.filter(value => !under(value, node.id)), node.id]); return; }
      const controller = new AbortController();
      setOperation({ status: 'loading', controller, valuesKey });
      try {
        const leaves = await state.leaves(node, controller.signal, leaves => validate([...new Set([...selected, ...leaves])]));
        if (!controller.signal.aborted) { commit([...new Set([...selected, ...leaves])]); setOperation({ status: 'idle' }); }
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof PageConditionError) refuse(error);
        else {
          // Preserve typed source failures; nothing from the failed transaction is emitted.
          if (!controller.signal.aborted) setOperation({ status: 'failed', load: { status: isHierarchyFailure(error) ? error.kind : 'error' }, node });
        }
      }
    } catch (error) { refuse(error); }
  }
  function expand(node: HierarchyNode) {
    if (!node.hasChildren) return;
    const next = new Set(expanded);
    if (next.has(node.id)) {
      next.delete(node.id);
      [node.id, ...rows.filter(row => under(row.node.id, node.id)).map(row => row.node.id)].forEach(id => state.cancelChildren(id));
    }
    else { next.add(node.id); state.loadChildren(node.id); }
    setExpanded(next);
  }
  function focus(row?: Row) { if (row) { setFocusId(row.node.id); elements.current.get(row.node.id)?.focus(); } }
  /** Same roving APG tree walk as HierarchyNav; Enter expands, Space checks a value. */
  function keyboard(event: KeyboardEvent<HTMLDivElement>, row: Row) {
    if (event.target !== event.currentTarget) return;
    hierarchyTreeKey(event, {
      rows: rows.map(item => ({ id: item.node.id, depth: item.depth, hasChildren: !searching && item.node.hasChildren })),
      id: row.node.id, expanded: searching ? new Set() : expanded,
      focus: id => focus(rows.find(item => item.node.id === id)),
      toggle: () => expand(row.node), enter: () => { if (!searching) expand(row.node); }, space: () => { void toggle(row.node); },
    });
  }
  function failure(load: TreeLoad<unknown> | undefined, retry: () => void) {
    if (load?.status === 'ready') return null;
    const status = load?.status ?? 'loading';
    const message = { loading: 'hierarchyLoading', error: 'hierarchyError', forbidden: 'hierarchyForbidden', deleted: 'hierarchyDeleted' } as const;
    if (status === 'loading') return <p role="status" className="text-xs text-text-secondary">{t(message[status])}</p>;
    return <StateMessage compact tone="danger" icon={<ServerCrash className="size-4" aria-hidden />} title={t(message[status])} action={<Button type="button" variant="secondary" size="toolbar" onClick={retry}>{m('retry')}</Button>} />;
  }
  function pageControls(parentId: string | null) {
    const load = snapshot.pages.get(parentId);
    return <>{failure(load, () => state.loadChildren(parentId, { retry: true }))}{load?.status === 'ready' && load.value.nodes.length === 0 && <p className="text-xs text-text-secondary">{m('empty')}</p>}
      {load?.status === 'ready' && load.value.nextCursor !== undefined && <Button type="button" variant="secondary" size="toolbar" onClick={() => state.loadChildren(parentId, { more: true })}>{t('hierarchyMore')}</Button>}</>;
  }
  const errors = localIssues.map(issue => im(issue.reason));
  if (operation.status === 'refused') errors.push(operation.message);
  const describedBy = `${id}-reasons`;
  return <fieldset data-page-condition={category.id} disabled={disabled} aria-describedby={describedBy} className="min-w-0 space-y-2 border-b border-border-subtle pb-3">
    <legend className="sr-only">{category.label[lang]}</legend>
    <div className="flex flex-wrap items-center justify-between gap-x-2">
      <span role="heading" aria-level={3} tabIndex={-1} className="text-sm font-semibold text-text-primary">{category.label[lang]}</span>
      <span className="flex items-center gap-2">
        <span className="text-xs text-text-secondary">{selected.length > 0 ? m('selected', { count: selected.length }) : Object.hasOwn(values, kind.key) ? m('explicitEmpty') : m('unconstrained')}</span>
        <Button type="button" variant="ghost" size="toolbar" disabled={disabled || (!Object.hasOwn(values, kind.key) && raw.length === 0 && !loading)} aria-label={m('clearOne', { label: category.label[lang] })} onClick={() => { cancel(); onChange(category.id, null); }}>{m('clear')}</Button>
      </span>
    </div>
    <div id={describedBy} className="space-y-1 text-xs text-text-secondary">
      {category.disabled && <p>{category.disabled.reason[lang]}</p>}{errors.map((error, index) => <p key={index}>{error}</p>)}
      {raw.length > 0 && localIssues.length > 0 && raw.map(([, value], index) => <p key={`raw:${index}`}>{m('retained', { value })}</p>)}
    </div>
    {!source ? <p className="text-xs text-text-secondary">{tm('sourceMissing')}</p> : <>
      {source.searchNodes && <SearchInput size="toolbar" value={query} onValueChange={setQuery} aria-label={t('hierarchySearch')} placeholder={t('hierarchySearch')} clearLabel={m('clear')} />}
      <div role="tree" aria-label={category.label[lang]} aria-multiselectable="true" aria-describedby={describedBy} aria-invalid={errors.length > 0 || undefined} aria-busy={loading} className="min-w-0 space-y-1">
        {rows.map(row => {
          const { node } = row;
          const path = snapshot.paths.get(node.id);
          const isCovered = covered(node);
          const pendingPath = searching && path?.status !== 'ready';
          const isChecked = checked(node);
          return <div key={node.id} role="none" className="min-w-0">
            <div ref={element => { if (element) elements.current.set(node.id, element); else elements.current.delete(node.id); }} role="treeitem" aria-label={node.label} aria-level={row.depth + 1} aria-posinset={row.position} aria-setsize={row.total ?? -1} aria-expanded={!searching && node.hasChildren ? expanded.has(node.id) : undefined} aria-checked={isChecked} aria-disabled={disabled || isCovered || loading || pendingPath || undefined} aria-describedby={[describedBy, ...(isCovered ? [`${id}-covered-${encodeURIComponent(node.id)}`] : [])].join(' ')}
              tabIndex={node.id === entryId ? 0 : -1} onFocus={() => setFocusId(node.id)} onKeyDown={event => keyboard(event, row)} className={cn('flex min-w-0 items-start gap-2 rounded-sm py-1 text-sm focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring', INDENT[Math.min(row.depth, INDENT.length - 1)])}>
              {!searching && node.hasChildren && <Button type="button" variant="ghost" size="icon-xs" tabIndex={-1} aria-label={t(expanded.has(node.id) ? 'collapseSection' : 'expandSection', { title: node.label })} onClick={() => expand(node)}>{expanded.has(node.id) ? <ChevronDown className="size-4" aria-hidden /> : <ChevronRight className="size-4" aria-hidden />}</Button>}
              <Checkbox tabIndex={-1} aria-hidden disabled={disabled || isCovered || loading || pendingPath} checked={isChecked === 'mixed' ? 'indeterminate' : isChecked} onCheckedChange={() => { void toggle(node); }} />
              <span className="min-w-0 flex-1 break-words">{node.label}{isCovered && <span id={`${id}-covered-${encodeURIComponent(node.id)}`} className="block text-xs text-text-secondary">{tm('covered')}</span>}{searching && path?.status === 'ready' && <span className="block text-xs text-text-secondary">{path.value.map(node => node.label).join(' › ')}</span>}</span>
            </div>
            {searching && path?.status !== 'ready' && failure(path, () => state.resolve(node.id, { retry: true }))}
            {!searching && expanded.has(node.id) && pageControls(node.id)}
          </div>;
        })}
      </div>
      {!searching && pageControls(null)}
      {searching && <>{failure(waitingSearch ? undefined : readySearch, () => state.search(readyQuery))}{!waitingSearch && readySearch.status === 'ready' && readySearch.value.nodes.length === 0 && <p className="text-xs text-text-secondary">{m('empty')}</p>}
        {!waitingSearch && readySearch.status === 'ready' && readySearch.value.nextCursor !== undefined && <Button type="button" variant="secondary" size="toolbar" onClick={() => state.search(readyQuery, { more: true })}>{t('hierarchyMore')}</Button>}</>}
    </>}
    {loading && <div className="text-xs text-text-secondary"><p role="status">{tm('checking')}</p><Button type="button" variant="secondary" size="toolbar" onClick={cancel}>{tm('cancel')}</Button></div>}
    {operation.status === 'failed' && failure(operation.load, () => { if (operation.node) void toggle(operation.node); else setOperation({ status: 'idle' }); })}
    {selected.map(value => {
      const path = snapshot.paths.get(value);
      let label = m('retained', { value });
      if (path?.status === 'ready') label = path.value.map(node => node.label).join(' › ');
      if (path?.status === 'deleted') label = m('unavailable', { value });
      return <div key={value} className="min-w-0 space-y-1 text-xs text-text-secondary"><div className="flex min-w-0 items-start justify-between gap-2"><span className="min-w-0 break-all">{label}</span>
        <Button type="button" variant="ghost" size="toolbar" disabled={disabled} aria-label={m('clearOne', { label: value })} onClick={() => { cancel(); try { commit(selected.filter(id => id !== value)); } catch (error) { refuse(error); } }}>{m('clear')}</Button></div>
        {path?.status !== 'ready' && failure(path, () => state.resolve(value, { retry: true }))}
        {kind.value === 'leaves' && path?.status === 'ready' && path.value.at(-1)?.hasChildren && <p>{tm('invalidLeaf')}</p>}
      </div>;
    })}
  </fieldset>;
}
