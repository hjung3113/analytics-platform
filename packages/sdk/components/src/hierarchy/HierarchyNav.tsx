import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ComponentType, type CSSProperties, type KeyboardEvent } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { HierarchyNode, HierarchySource } from '@ap/contracts';
import { PlatformLink, useI18n } from '@ap/kernel';
import { useHostPlatform } from '@ap/kernel/host';
import { Button, cn, NavCurrentMarker, navDrillAffordance, navRowVariants, SearchInput } from '@ap/ui';
import { ancestorKey, childrenKey, searchKey, type HierarchyNavState, type HierarchySnapshot, type Load } from './hierarchyState';
import { ClippedLabel, useSidebarListSpace } from './hierarchyLayout';
import { useHierarchyNavState } from './useHierarchyNavState';

export type HierarchyNavProps = {
  menuId: string;
  label: string;
  source: HierarchySource;
  mode?: 'drill' | 'tree';
  currentNodeId?: string | null;
  levelIcon?: (kind: string) => ComponentType<{ className?: string }> | undefined;
  pageSize?: number;
  state?: HierarchyNavState;
  onNavigate?: () => void;
};
type NodeRow = { kind: 'node'; node: HierarchyNode; depth: number; index: number; total?: number };
type StateRow = { kind: 'state'; key: string; parentId: string | null; depth: number };
type Row = NodeRow | StateRow;
const INDENT = ['pl-3', 'pl-7', 'pl-11', 'pl-15'] as const;
const MESSAGE = 'px-3 py-1 text-xs leading-4 text-text-muted break-keep';

/** Iterative traversal has no depth cap; a malformed source cycle cannot loop forever. */
function treeRows(snapshot: HierarchySnapshot): Row[] {
  const result: Row[] = [];
  const visited = new Set<string>();
  const stack: (Row | { kind: 'page'; parentId: string | null; depth: number })[] = [{ kind: 'page', parentId: null, depth: 0 }];
  while (stack.length) {
    const task = stack.pop()!;
    if (task.kind === 'page') {
      const key = childrenKey(task.parentId);
      const page = snapshot.pages[key];
      if (!page || page.status !== 'ready' || page.value?.nextCursor) stack.push({ kind: 'state', key, parentId: task.parentId, depth: task.depth });
      const nodes = page?.value?.nodes ?? [];
      for (let i = nodes.length - 1; i >= 0; i--) stack.push({ kind: 'node', node: nodes[i], depth: task.depth, index: i + 1, total: page?.value?.totalCount });
    } else if (task.kind === 'node') {
      if (visited.has(task.node.id)) continue;
      visited.add(task.node.id); result.push(task);
      if (snapshot.expanded.has(task.node.id) && task.node.hasChildren) stack.push({ kind: 'page', parentId: task.node.id, depth: task.depth + 1 });
    } else result.push(task);
  }
  return result;
}

/** Sidebar data navigation. Menus own source/endpoints; Kernel owns destinations and permissions. */
export function HierarchyNav({ menuId, label, source, mode = 'drill', currentNodeId = null, levelIcon, pageSize = 50, state: shared, onNavigate }: HierarchyNavProps) {
  const own = useHierarchyNavState(menuId);
  // Refuse even a mistakenly retained cache from a different user/revision in this very render.
  const state = shared?.identity === own.identity ? shared : own;
  const snapshot = useSyncExternalStore(state.subscribe, state.read, state.read);
  const { resolveLink } = useHostPlatform();
  const { t } = useI18n();
  const restoring = snapshot.routeId !== currentNodeId;
  const pathLoad = currentNodeId === null ? undefined : snapshot.ancestors[currentNodeId];
  const searching = snapshot.query.trim() !== '' && source.searchNodes !== undefined;
  const waitingSearch = searching && snapshot.query.trim() !== snapshot.readyQuery;
  const parentId = snapshot.path.at(-1)?.id ?? null;
  const currentKey = searching ? searchKey(snapshot.readyQuery) : childrenKey(parentId);
  const routeSteps = useMemo(() => {
    if (restoring || searching || currentNodeId === null || snapshot.locatedId === currentNodeId) return [];
    const path = pathLoad?.value ?? [];
    const ids = [...path.map(node => node.id), currentNodeId];
    return mode === 'tree' ? ids.map((id, index) => ({ id, parent: index === 0 ? null : ids[index - 1] })) : [{ id: currentNodeId, parent: path.at(-1)?.id ?? null }];
  }, [restoring, searching, currentNodeId, snapshot.locatedId, pathLoad, mode]);
  const missingRoute = routeSteps.some(({ id, parent }) => { const load = snapshot.pages[childrenKey(parent)]; return load?.status === 'ready' && !load.value?.nextCursor && !load.value?.nodes.some(node => node.id === id); });
  const activePage = snapshot.pages[currentKey];
  const [focusId, setFocusId] = useState<string | null>(null);
  const pendingFocus = useRef<'first' | string | null>(null);
  const revealed = useRef<string | null>(null);
  const elements = useRef(new Map<string, HTMLDivElement>());

  useEffect(() => {
    const query = snapshot.query.trim();
    if (query === snapshot.readyQuery) return;
    const timer = setTimeout(() => state.update({ readyQuery: query }), 200);
    return () => clearTimeout(timer);
  }, [state, snapshot.query, snapshot.readyQuery]);

  const rows = useMemo<Row[]>(() => {
    if (restoring || waitingSearch) return [];
    if (!searching && mode === 'tree') return treeRows(snapshot);
    return (activePage?.value?.nodes ?? []).map((node, index) => ({ kind: 'node', node, depth: 0, index: index + 1, total: activePage?.value?.totalCount }));
  }, [restoring, waitingSearch, searching, mode, snapshot, activePage]);
  const pitch = searching ? 42 : 34;
  const { ref: scrollRef, maxHeight } = useSidebarListSpace(rows.length, pitch);
  const virtual = useVirtualizer({ count: rows.length, getScrollElement: () => scrollRef.current, estimateSize: index => rows[index].kind === 'state' ? pitch * 3 : pitch, overscan: 3, getItemKey: index => rows[index].kind === 'node' ? (rows[index] as NodeRow).node.id : (rows[index] as StateRow).key });
  const windowRows = virtual.getVirtualItems();
  const firstId = rows.find((row): row is NodeRow => row.kind === 'node')?.node.id;

  const expandedParents = useMemo(() => rows.flatMap(row => row.kind === 'node' && row.node.hasChildren && snapshot.expanded.has(row.node.id) ? [row.node.id] : []), [rows, snapshot.expanded]);
  const needed = useMemo(() => {
    if (restoring) return currentNodeId === null ? [] : [ancestorKey(currentNodeId)];
    if (waitingSearch) return [];
    if (searching) return [currentKey];
    return mode === 'tree' ? [childrenKey(null), ...expandedParents.map(childrenKey), ...routeSteps.map(step => childrenKey(step.parent))] : [currentKey];
  }, [restoring, currentNodeId, waitingSearch, searching, currentKey, mode, expandedParents, routeSteps]);
  const visibleSearchIds = useMemo(() => searching && !waitingSearch ? windowRows.flatMap(item => { const row = rows[item.index]; return row.kind === 'node' ? [row.node.id] : []; }) : [], [searching, waitingSearch, windowRows, rows]);
  const searchIdsKey = JSON.stringify(visibleSearchIds);
  const neededKey = JSON.stringify(needed);
  useEffect(() => {
    state.retain(new Set([...needed, ...visibleSearchIds.map(ancestorKey)]));
    if (restoring) {
      if (currentNodeId !== null && !pathLoad) state.loadAncestors(source, currentNodeId);
      if (currentNodeId === null || pathLoad?.status === 'ready') {
        const path = pathLoad?.value ?? [];
        state.update({ routeId: currentNodeId, locatedId: undefined, path, expanded: new Set(path.map(node => node.id)) });
      }
      return;
    }
    if (waitingSearch) return;
    if (searching) { state.loadPage(source, currentKey, null, snapshot.readyQuery, pageSize); visibleSearchIds.forEach(id => state.loadAncestors(source, id)); }
    else if (mode === 'tree') {
      state.loadPage(source, childrenKey(null), null, null, pageSize);
      expandedParents.forEach(id => state.loadPage(source, childrenKey(id), id, null, pageSize));
    } else state.loadPage(source, currentKey, parentId, null, pageSize);
  }, [state, source, neededKey, needed, restoring, currentNodeId, pathLoad, waitingSearch, searching, currentKey, snapshot.readyQuery, mode, expandedParents, parentId, pageSize, snapshot.pages, snapshot.ancestors, searchIdsKey, visibleSearchIds]);
  useEffect(() => {
    if (routeSteps.length === 0 || missingRoute) return;
    let located = true;
    for (const { id, parent } of routeSteps) {
      const key = childrenKey(parent);
      const load = snapshot.pages[key];
      if (load?.value?.nodes.some(node => node.id === id)) continue;
      located = false;
      if (!load) state.loadPage(source, key, parent, null, pageSize);
      else if (load.status === 'ready' && load.value?.nextCursor) state.loadPage(source, key, parent, null, pageSize, true);
    }
    if (located && currentNodeId) state.update({ locatedId: currentNodeId });
  }, [routeSteps, missingRoute, snapshot.pages, state, source, pageSize, currentNodeId]);
  useEffect(() => () => state.retain(new Set()), [state]);

  useLayoutEffect(() => {
    if (currentNodeId === null) revealed.current = null;
    if (!restoring && currentNodeId && revealed.current !== currentNodeId) {
      const index = rows.findIndex(row => row.kind === 'node' && row.node.id === currentNodeId);
      if (index >= 0) virtual.scrollToIndex(index, { align: 'auto' });
      const element = elements.current.get(currentNodeId);
      if (element) { element.scrollIntoView({ block: 'nearest' }); revealed.current = currentNodeId; }
    }
  }, [currentNodeId, restoring, rows, windowRows, virtual]);
  useLayoutEffect(() => {
    const pending = pendingFocus.current;
    if (!pending) return;
    const id = pending === 'first' ? firstId : pending;
    if (!id) return;
    const element = elements.current.get(id);
    if (element) { element.focus(); pendingFocus.current = null; setFocusId(id); }
  }, [rows, windowRows, firstId]);

  const focus = (id: string) => {
    setFocusId(id); pendingFocus.current = id;
    const index = rows.findIndex(row => row.kind === 'node' && row.node.id === id);
    if (index >= 0) virtual.scrollToIndex(index, { align: 'auto' });
    elements.current.get(id)?.focus();
  };
  const toggle = (node: HierarchyNode, keyboard = false) => {
    if (!node.hasChildren) return;
    if (keyboard) pendingFocus.current = mode === 'drill' ? 'first' : node.id;
    if (mode === 'tree' && !searching) {
      const expanded = new Set(snapshot.expanded);
      if (expanded.has(node.id)) expanded.delete(node.id); else expanded.add(node.id);
      state.update({ expanded });
    } else {
      const path = searching ? snapshot.ancestors[node.id]?.value : snapshot.path;
      if (searching && path === undefined) { state.loadAncestors(source, node.id); return; }
      state.update({ path: [...path ?? [], node], expanded: mode === 'tree' ? new Set([...(path ?? []).map(parent => parent.id), ...(node.hasChildren ? [node.id] : [])]) : snapshot.expanded, query: '', readyQuery: '' });
    }
  };
  const onKey = (event: KeyboardEvent<HTMLDivElement>, row: NodeRow) => {
    const nodeRows = rows.filter((item): item is NodeRow => item.kind === 'node');
    const index = nodeRows.findIndex(item => item.node.id === row.node.id);
    const next = (n: number) => { const item = nodeRows[Math.max(0, Math.min(nodeRows.length - 1, n))]; if (item) focus(item.node.id); };
    if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'ArrowLeft', 'ArrowRight', 'Enter', ' '].includes(event.key)) event.preventDefault();
    if (event.key === 'ArrowDown') next(index + 1);
    if (event.key === 'ArrowUp') next(index - 1);
    if (event.key === 'Home') next(0);
    if (event.key === 'End') next(nodeRows.length - 1);
    if (event.key === 'ArrowRight' && row.node.hasChildren) {
      if (!snapshot.expanded.has(row.node.id)) toggle(row.node, true);
      else if (nodeRows[index + 1]?.depth > row.depth) next(index + 1);
    }
    if (event.key === 'ArrowLeft') {
      if (snapshot.expanded.has(row.node.id)) toggle(row.node, true);
      else { const parent = nodeRows.slice(0, index).reverse().find(item => item.depth < row.depth); if (parent) focus(parent.node.id); }
    }
    if (event.key === 'Enter' || event.key === ' ') (event.currentTarget.querySelector('[data-hierarchy-primary]') as HTMLElement | null)?.click();
  };
  const failure = (load: Load<unknown> | undefined, retry: () => void) => {
    const status = load?.status ?? 'loading';
    if (status === 'ready') return null;
    const key = status === 'forbidden' ? 'hierarchyForbidden' : status === 'deleted' ? 'hierarchyDeleted' : status === 'error' ? 'hierarchyError' : 'hierarchyLoading';
    return <div role="status" className={MESSAGE}>{t(key)}{status !== 'loading' && <Button type="button" variant="navigation" size="toolbar" onClick={retry}>{t('hierarchyRetry')}</Button>}</div>;
  };
  const pageState = (key: string, parent: string | null, query: string | null) => {
    const load = snapshot.pages[key];
    return <>{failure(load, () => state.retryPage(key))}{load?.status === 'ready' && load.value?.nextCursor && <Button type="button" variant="navigation" size="toolbar" onClick={() => state.loadPage(source, key, parent, query, pageSize, true)}>{t('hierarchyMore')}</Button>}</>;
  };
  const resolvedHref = (node: HierarchyNode) => {
    if (!node.target) return null;
    try { const result = resolveLink(node.target.menuId, { params: node.target.params, page: node.target.page }); return result.allowed ? result.href : null; } catch { return null; }
  };

  return <div data-hierarchy-nav className="min-h-0 break-keep">
    {source.searchNodes && <SearchInput size="toolbar" className="mx-1 mb-1 flex" placeholder={t('hierarchySearch')} aria-label={t('hierarchySearch')} clearLabel={t('clear')} value={snapshot.query} onValueChange={query => state.update({ query, ...(query.trim() === '' ? { readyQuery: '' } : {}) })} />}
    {!searching && mode === 'drill' && snapshot.path.length > 0 && !restoring && <button type="button" className={cn(navRowVariants(), 'w-full text-left break-keep')} aria-label={t('hierarchyBack')} onClick={event => { if (event.detail === 0) pendingFocus.current = 'first'; state.update({ path: snapshot.path.slice(0, -1) }); }}>
      <ChevronLeft className="size-4 shrink-0" aria-hidden /><ClippedLabel label={snapshot.path.at(-1)!.label} className="font-semibold text-text-primary" />
    </button>}
    {missingRoute ? failure({ status: 'deleted' }, () => { if (currentNodeId) { state.retryAncestors(currentNodeId); state.update({ routeId: undefined }); } }) : restoring ? failure(pathLoad, () => { if (currentNodeId) state.retryAncestors(currentNodeId); }) : waitingSearch ? failure(undefined, () => {}) : <>
      <div ref={scrollRef} data-hierarchy-scroll className="shell-scroll h-(--hierarchy-height) overflow-y-auto" role={mode === 'tree' && !searching ? 'tree' : 'list'} aria-label={label} style={{ '--hierarchy-height': `${Math.min(virtual.getTotalSize(), maxHeight)}px` } as CSSProperties}>
        <div role="presentation" className="relative h-(--hierarchy-total) w-full" style={{ '--hierarchy-total': `${virtual.getTotalSize()}px` } as CSSProperties}>
          {windowRows.map(item => {
            const row = rows[item.index];
            if (row.kind === 'state') return <div key={row.key} className="absolute left-0 top-0 w-full translate-y-(--hierarchy-offset)" style={{ '--hierarchy-offset': `${item.start}px` } as CSSProperties}>{pageState(row.key, row.parentId, null)}</div>;
            const { node, depth } = row;
            const href = resolvedHref(node);
            const current = node.id === currentNodeId;
            const expanded = snapshot.expanded.has(node.id);
            const Icon = levelIcon?.(node.kind);
            const isTree = mode === 'tree' && !searching;
            const primaryContent = <>{Icon && <Icon className="size-4 shrink-0" />}<span className="flex min-w-0 flex-1 flex-col"><ClippedLabel label={node.label} />{searching && <ClippedLabel label={snapshot.ancestors[node.id]?.value?.map(parent => parent.label).join(' › ') ?? ''} className="text-xs text-text-muted" />}</span></>;
            return <div key={node.id} ref={element => { if (element) elements.current.set(node.id, element); else elements.current.delete(node.id); }} data-hierarchy-node={node.id} role={isTree ? 'treeitem' : 'listitem'} aria-label={isTree ? node.label : undefined} aria-level={isTree ? depth + 1 : undefined} aria-posinset={isTree ? row.index : undefined} aria-setsize={isTree ? row.total ?? -1 : undefined} aria-expanded={isTree && node.hasChildren ? expanded : undefined} aria-current={isTree && current ? 'location' : undefined} tabIndex={isTree ? ((focusId ?? firstId) === node.id ? 0 : -1) : undefined} onFocus={isTree ? () => setFocusId(node.id) : undefined} onKeyDown={isTree ? event => onKey(event, row) : undefined}
              className={cn(navRowVariants({ active: current }), 'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-inset absolute left-0 top-0 h-(--hierarchy-row) w-full translate-y-(--hierarchy-offset) break-keep', isTree && INDENT[Math.min(depth, INDENT.length - 1)], searching && 'min-h-10')}
              style={{ '--hierarchy-offset': `${item.start}px`, '--hierarchy-row': `${pitch - 2}px` } as CSSProperties}>
              {current && <NavCurrentMarker />}
              {isTree && node.hasChildren && <Button asChild variant="navigation" size="icon-xs" className="size-6"><button type="button" tabIndex={-1} className={navDrillAffordance} aria-label={t(expanded ? 'collapseSection' : 'expandSection', { title: node.label })} onClick={event => toggle(node, event.detail === 0)}>{expanded ? <ChevronDown className="size-4" aria-hidden /> : <ChevronRight className="size-4" aria-hidden />}</button></Button>}
              {href !== null ? <PlatformLink data-hierarchy-primary via="sidebar" href={href} aria-label={node.label} aria-current={!isTree && current ? 'location' : undefined} tabIndex={isTree ? -1 : undefined} className="flex min-w-0 flex-1 items-center gap-2" onNavigate={onNavigate}>{primaryContent}</PlatformLink>
                : !node.target && node.hasChildren ? <button data-hierarchy-primary type="button" tabIndex={isTree ? -1 : undefined} aria-label={node.label} className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={event => toggle(node, event.detail === 0)}>{primaryContent}</button>
                : <span data-hierarchy-primary className="flex min-w-0 flex-1 items-center gap-2">{primaryContent}</span>}
              {node.hasChildren && !isTree && <Button asChild variant="navigation" size="icon-xs" className="size-6"><button type="button" className={navDrillAffordance} aria-label={t('expandSection', { title: node.label })} onClick={event => toggle(node, event.detail === 0)}><ChevronRight className="size-4" aria-hidden /></button></Button>}
            </div>;
          })}
        </div>
      </div>
      {(mode !== 'tree' || searching) && pageState(currentKey, parentId, searching ? snapshot.readyQuery : null)}
      {rows.length === 0 && activePage?.status === 'ready' && <p className={MESSAGE}>{t('hierarchyEmpty')}</p>}
    </>}
    <p className={MESSAGE}>{t('hierarchyPermission')}</p>
  </div>;
}
