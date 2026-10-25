import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight, CornerDownRight, Eye } from 'lucide-react';
import { useI18n } from '@ap/kernel';
import { Button, Checkbox, cn } from '@ap/ui';
import { readColorToken, type ThemeColorToken } from '@ap/ui/theme';

export type LegendTreeNode = {
  id: string; label: ReactNode; color?: ThemeColorToken; children?: LegendTreeNode[];
  /** A drill target that is not a series: no checkbox or visibility leaf; row click and Enter drill (needs `onDrill`). */
  drillOnly?: boolean;
};
export type LegendTreeSort = 'asc' | 'desc' | null;
export type LegendTreeProps = {
  nodes: LegendTreeNode[];
  /** Visible leaf ids. Other incoming ids are preserved by visibility changes. */
  visible: ReadonlySet<string>;
  onVisibleChange: (next: Set<string>) => void;
  /** Accessible name of the tree. */
  label: string;
  /** Controlled sort indicator; read-only without onSortChange. */
  sortOf?: (id: string) => LegendTreeSort;
  /** Enables cycling null → asc → desc → null when sortOf is also supplied. */
  onSortChange?: (id: string, next: LegendTreeSort) => void;
  selectedId?: string | null;
  /** Enables a single current choice, independently of visibility checks. Superseded by `onDrill`, which turns selection off. */
  onSelect?: (id: string) => void;
  /** Enables drill on the drillable rows: Enter, a trailing `단계로 이동` button, and a `drillOnly` row click. Never changes `visible`. See `canDrill`. */
  onDrill?: (id: string) => void;
  /** Which rows drill (needs `onDrill`). A `drillOnly` row always does; any other row does when this returns true, or, without this prop, when it has children. Other rows keep Enter as expand (a branch) or nothing (a leaf). */
  canDrill?: (id: string) => boolean;
  /** The current drill node (`aria-current`). A non-null id opens only its ancestors when no expansion prop is passed; later changes reveal closed ancestors only for uncontrolled expansion (a controlled `expanded` is the caller's to open). */
  currentId?: string | null;
  /** Expansion mode is fixed per mount; controlled expansion without a callback is read-only. */
  expanded?: ReadonlySet<string>;
  /** Read once; defaults to all branches expanded. */
  defaultExpanded?: ReadonlySet<string>;
  onExpandedChange?: (next: Set<string>) => void;
  emptyText?: ReactNode;
  className?: string;
};

type Entry = {
  node: LegendTreeNode;
  path: string[];
  key: string;
  leaves: string[];
  children: Entry[];
  position: number;
  size: number;
};

function describeNodes(nodes: LegendTreeNode[]) {
  const ids = new Set<string>();
  const branches = new Set<string>();
  const byId = new Map<string, Entry>();
  let duplicate = false;
  let checkable = false;
  function visit(siblings: LegendTreeNode[], path: string[], prefix: string[]): Entry[] {
    const occurrences = new Map<string, number>();
    return siblings.map((node, index) => {
      if (ids.has(node.id)) duplicate = true;
      ids.add(node.id);
      const occurrence = occurrences.get(node.id) ?? 0;
      occurrences.set(node.id, occurrence + 1);
      const keyPath = [...prefix, node.id, String(occurrence)];
      const key = JSON.stringify(keyPath);
      const nextPath = [...path, node.id];
      const children = visit(node.children ?? [], nextPath, keyPath);
      if (children.length) branches.add(node.id);
      const childLeaves = children.flatMap(child => child.leaves);
      if (!node.drillOnly) checkable = true;
      const entry: Entry = { node, key, path: nextPath, children,
        leaves: node.drillOnly ? [] : childLeaves.length ? childLeaves : [node.id],
        position: index + 1, size: siblings.length };
      if (!byId.has(node.id)) byId.set(node.id, entry);
      return entry;
    });
  }
  const roots = visit(nodes, [], []);
  return { roots, branches, duplicate, byId, checkable, leaves: [...new Set(roots.flatMap(entry => entry.leaves))] };
}

const EMPTY = new Set<string>();

/** Hierarchical visibility checks with independent optional single choice and controlled sorting. */
export function LegendTree(props: LegendTreeProps) {
  const { nodes, visible, onVisibleChange, label, sortOf, onSortChange, onSelect, selectedId, onDrill, canDrill, currentId,
    expanded, defaultExpanded, onExpandedChange, emptyText, className } = props;
  const { lang } = useI18n();
  const treeId = useId();
  const drillId = `${treeId}-drill`;
  const model = useMemo(() => describeNodes(nodes), [nodes]);
  const [controlled] = useState(() => expanded !== undefined);
  const [internalExpanded, setInternalExpanded] = useState(() => {
    const current = currentId != null ? model.byId.get(currentId) : undefined;
    if (current && expanded === undefined && defaultExpanded === undefined && !onExpandedChange) return new Set(current.path.slice(0, -1));
    return new Set(defaultExpanded ?? model.branches);
  });
  const [seenCurrent, setSeenCurrent] = useState(currentId);
  if (seenCurrent !== currentId) {
    // Render-phase adjustment: a moved current node opens its closed ancestors and never closes anything.
    setSeenCurrent(currentId);
    const current = currentId != null ? model.byId.get(currentId) : undefined;
    const missing = current && !controlled ? current.path.slice(0, -1).filter(id => !internalExpanded.has(id)) : [];
    if (missing.length) setInternalExpanded(new Set([...internalExpanded, ...missing]));
  }
  const open = controlled ? expanded ?? EMPTY : internalExpanded;
  const shown = useMemo(() => {
    const result: Entry[] = [];
    function visit(entries: Entry[]) {
      for (const entry of entries) {
        result.push(entry);
        if (open.has(entry.node.id)) visit(entry.children);
      }
    }
    visit(model.roots);
    return result;
  }, [model, open]);
  const [activePath, setActivePath] = useState(() =>
    (onDrill ? shown.find(entry => entry.node.id === currentId) : onSelect ? shown.find(entry => entry.node.id === selectedId) : undefined)?.path ?? shown[0]?.path ?? []);
  // Retain the ancestry even after removal so the next entry target can be repaired without DOM reads.
  const active = [...activePath].reverse().map(id => shown.find(entry => entry.node.id === id)).find(Boolean) ?? shown[0];
  const root = useRef<HTMLDivElement>(null);
  const rows = useRef(new Map<string, HTMLDivElement>());
  const focused = useRef<HTMLElement | null>(null);
  const ownsFocus = useRef(false);
  const showAllFocused = useRef(false);
  // Gated on onDrill: callers without the new props (and their Tab-order tests) render exactly as before.
  const allOff = !!onDrill && model.leaves.length > 0 && model.leaves.every(id => !visible.has(id));
  const warnedDuplicate = useRef(false);
  const warnedMode = useRef(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      if (model.duplicate && !warnedDuplicate.current) {
        warnedDuplicate.current = true;
        console.error('LegendTree: duplicate node ids.');
      }
      if ((expanded !== undefined) !== controlled && !warnedMode.current) {
        warnedMode.current = true;
        console.error('LegendTree: changing expansion control mode after mount is unsupported.');
      }
    }
  }, [model.duplicate, expanded, controlled]);

  useEffect(() => {
    const onFocus = (event: FocusEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) ownsFocus.current = false;
      // Focus that moved anywhere else (a removal fires no focusin) means the head button no longer owns it.
      if (!(event.target instanceof HTMLElement && event.target.hasAttribute('data-legend-show-all'))) showAllFocused.current = false;
    };
    document.addEventListener('focusin', onFocus);
    return () => document.removeEventListener('focusin', onFocus);
  }, []);

  useLayoutEffect(() => {
    // Removal sends focus to body without a reliable blur event; recover only the tree's own lost control.
    if (ownsFocus.current && focused.current && !focused.current.isConnected
      && (document.activeElement === document.body || root.current?.contains(document.activeElement))) {
      (active ? rows.current.get(active.key) : root.current)?.focus();
    }
    // The head button unmounts once a leaf is visible; hand its focus to the active row, but only if it still held it.
    if (showAllFocused.current && !allOff && document.activeElement === document.body) {
      (active ? rows.current.get(active.key) : root.current)?.focus();
    }
    if (!allOff) showAllFocused.current = false;
  });

  function focus(entry: Entry | undefined) {
    if (entry) {
      setActivePath(entry.path);
      rows.current.get(entry.key)?.focus();
    }
  }
  function checked(entry: Entry): boolean | 'mixed' {
    const count = entry.leaves.filter(id => visible.has(id)).length;
    return count === entry.leaves.length ? true : count === 0 ? false : 'mixed';
  }
  function toggle(entry: Entry) {
    if (entry.node.drillOnly) return;
    const next = new Set(visible);
    const remove = checked(entry) === true;
    for (const id of entry.leaves) {
      if (remove) next.delete(id); else next.add(id);
    }
    onVisibleChange(next);
  }
  function showAll() {
    const next = new Set(visible);
    for (const id of model.leaves) next.add(id);
    onVisibleChange(next);
  }
  function expand(entry: Entry) {
    if (!entry.children.length || (controlled && !onExpandedChange)) return;
    const next = new Set(open);
    if (next.has(entry.node.id)) next.delete(entry.node.id); else next.add(entry.node.id);
    if (!controlled) setInternalExpanded(next);
    onExpandedChange?.(next);
  }
  function sort(entry: Entry) {
    if (sortOf && onSortChange) {
      const current = sortOf(entry.node.id);
      onSortChange(entry.node.id, current === null ? 'asc' : current === 'asc' ? 'desc' : null);
    }
  }
  function drillable(entry: Entry): boolean {
    return !!onDrill && (!!entry.node.drillOnly || (canDrill ? canDrill(entry.node.id) : entry.children.length > 0));
  }
  function keyDown(event: KeyboardEvent<HTMLDivElement>, entry: Entry) {
    if (event.target !== event.currentTarget || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const index = shown.indexOf(entry);
    switch (event.key) {
      case 'ArrowDown': focus(shown[Math.min(shown.length - 1, index + 1)]); break;
      case 'ArrowUp': focus(shown[Math.max(0, index - 1)]); break;
      case 'Home': focus(shown[0]); break;
      case 'End': focus(shown[shown.length - 1]); break;
      case 'ArrowRight':
        if (entry.children.length && !open.has(entry.node.id)) expand(entry);
        else if (entry.children.length) focus(entry.children[0]);
        break;
      case 'ArrowLeft':
        if (entry.children.length && open.has(entry.node.id)) expand(entry);
        else focus(shown.find(candidate => candidate.node.id === entry.path[entry.path.length - 2]));
        break;
      case ' ': toggle(entry); break;
      case 'Enter':
        if (drillable(entry)) onDrill?.(entry.node.id);
        else if (onSelect && !onDrill) onSelect(entry.node.id);
        else if (entry.children.length) expand(entry);
        else return;
        break;
      default: return;
    }
    event.preventDefault();
    event.stopPropagation();
  }

  function renderEntry(entry: Entry): ReactNode {
    const { node } = entry;
    const labelId = `${treeId}-${encodeURIComponent(entry.key)}`;
    const expandLabelId = `${labelId}-expand`;
    const sortLabelId = `${labelId}-sort`;
    const isOpen = open.has(node.id);
    const expandLabel = lang === 'ko' ? (isOpen ? '접기' : '펼치기') : (isOpen ? 'Collapse' : 'Expand');
    const isSelected = !!onSelect && !onDrill && selectedId === node.id;
    const isCurrent = currentId === node.id;
    const drillOnly = !!node.drillOnly;
    const name = typeof node.label === 'string' ? node.label : node.id;
    const drillLabel = lang === 'ko' ? `${name} 단계로 이동` : `${name} go to this level`;
    const canDrillRow = drillable(entry);
    const describedBy = [canDrillRow ? drillId : undefined, sortOf && !onSortChange ? sortLabelId : undefined].filter(Boolean).join(' ') || undefined;
    const value = sortOf?.(node.id);
    const sortLabel = lang === 'ko'
      ? `정렬: ${value === 'asc' ? '오름차순' : value === 'desc' ? '내림차순' : '없음'}`
      : `Sort: ${value === 'asc' ? 'ascending' : value === 'desc' ? 'descending' : 'none'}`;
    const SortIcon = value === 'asc' ? ArrowUp : value === 'desc' ? ArrowDown : ArrowUpDown;
    return <div key={entry.key} role="treeitem" data-id={node.id} aria-labelledby={labelId}
      aria-describedby={describedBy} aria-current={isCurrent ? 'true' : undefined}
      ref={element => { if (element) rows.current.set(entry.key, element); else rows.current.delete(entry.key); }}
      aria-level={entry.path.length} aria-setsize={entry.size} aria-posinset={entry.position}
      aria-expanded={entry.children.length ? isOpen : undefined} aria-checked={drillOnly ? undefined : checked(entry)}
      aria-selected={onSelect && !onDrill ? isSelected : undefined} tabIndex={active === entry ? 0 : -1}
      className="focus-visible:outline-hidden"
      onFocus={event => {
        if (event.target === event.currentTarget || event.currentTarget.closest('[role=treeitem]') === event.target.closest('[role=treeitem]')) {
          setActivePath(entry.path);
        }
      }}
      onKeyDown={event => keyDown(event, entry)}>
      {/* Runtime depth supports arbitrarily nested caller data; a finite class list cannot express it. */}
      {/* eslint-disable-next-line shadcn/no-inline-styles -- indent is 16px per caller-supplied tree level */}
      <div style={{ paddingInlineStart: (entry.path.length - 1) * 16 }}
        className={cn('group relative flex h-7 items-center gap-1 text-xs text-text-secondary hover:bg-surface-row-hover',
          '[[role=treeitem]:focus-visible>&]:ring-2 [[role=treeitem]:focus-visible>&]:ring-focus-ring [[role=treeitem]:focus-visible>&]:ring-offset-2',
          isSelected && 'bg-surface-row-selected font-semibold', isCurrent && 'font-semibold')}
        onClick={() => { focus(entry); if (drillOnly) onDrill?.(node.id); }}>
        {(isSelected || isCurrent) && <span aria-hidden className="absolute inset-y-0 start-0 w-0.5 bg-accent-primary" />}
        {entry.children.length ? <Button type="button" variant="ghost" size="icon-xs" tabIndex={active === entry ? 0 : -1}
          aria-labelledby={lang === 'ko' ? `${labelId} ${expandLabelId}` : `${expandLabelId} ${labelId}`}
          disabled={controlled && !onExpandedChange}
          onMouseDown={event => { event.preventDefault(); focus(entry); }}
          onClick={event => { event.stopPropagation(); expand(entry); }}>
          <span id={expandLabelId} className="sr-only">{expandLabel}</span>
          <ChevronRight aria-hidden className={isOpen ? 'size-3 rotate-90' : 'size-3'} />
        </Button> : <span aria-hidden className="inline-block w-7 shrink-0" />}
        {drillOnly ? <span aria-hidden className="inline-block size-4 shrink-0" /> : <Checkbox type="button" checked={checked(entry) === 'mixed' ? 'indeterminate' : checked(entry) === true}
          className="border-border-control" tabIndex={-1}
          aria-label={name}
          onMouseDown={event => event.preventDefault()}
          onCheckedChange={() => { focus(entry); toggle(entry); }} />}
        {node.color &&
          // eslint-disable-next-line shadcn/no-inline-styles -- swatch color is the caller's theme token resolved at runtime
          <span data-legend-swatch aria-hidden className="inline-block size-3 shrink-0 border-2" style={{ backgroundColor: readColorToken(node.color) }} />}
        <span id={labelId} className="min-w-0 flex-1 cursor-pointer truncate" title={typeof node.label === 'string' ? node.label : undefined}
          onClick={event => {
            if (drillOnly) return;
            event.stopPropagation(); focus(entry);
            if (onSelect && !onDrill) onSelect(node.id); else toggle(entry);
          }}>{node.label}</span>
        {drillOnly && (onDrill && !isCurrent
          ? <Button type="button" variant="ghost" size="icon-xs" tabIndex={-1} aria-label={drillLabel}
            onMouseDown={event => { event.preventDefault(); focus(entry); }}
            onClick={event => { event.stopPropagation(); onDrill(node.id); }}>
            <CornerDownRight aria-hidden className="size-3 text-text-muted" />
          </Button>
          : <CornerDownRight aria-hidden className="size-3 shrink-0 text-text-muted" />)}
        {canDrillRow && !drillOnly && !isCurrent &&
          <span className="inline-flex opacity-0 group-hover:opacity-100 focus-within:opacity-100 [[role=treeitem]:focus-visible>div>&]:opacity-100">
            <Button type="button" variant="ghost" size="icon-xs" tabIndex={-1} aria-label={drillLabel}
              onMouseDown={event => { event.preventDefault(); focus(entry); }}
              onClick={event => { event.stopPropagation(); onDrill?.(node.id); }}>
              <CornerDownRight aria-hidden className="size-3" />
            </Button>
          </span>}
        {sortOf && (onSortChange ? <Button type="button" variant="ghost" size="icon-xs" aria-labelledby={`${labelId} ${sortLabelId}`}
          tabIndex={active === entry ? 0 : -1} onMouseDown={event => { event.preventDefault(); focus(entry); }}
          onClick={event => { event.stopPropagation(); sort(entry); }}>
          <span id={sortLabelId} className="sr-only">{sortLabel}</span>
          <SortIcon aria-hidden className="size-3" />
        </Button> : <span><span id={sortLabelId} className="sr-only">{sortLabel}</span><SortIcon aria-hidden className="size-3" /></span>)}
      </div>
      {entry.children.length > 0 && isOpen && <div role="group">{entry.children.map(renderEntry)}</div>}
    </div>;
  }

  return <>
    {allOff && <div className="w-full">
      <Button type="button" variant="secondary" size="toolbar" onClick={showAll} data-legend-show-all=""
        onFocus={() => { showAllFocused.current = true; }}><Eye className="size-3.5" aria-hidden />{lang === 'ko' ? '모두 보이기' : 'Show all'}</Button>
    </div>}
  <div ref={root} role="tree" aria-label={label} aria-multiselectable={model.checkable ? true : undefined}
    className={cn('focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2', className)} tabIndex={shown.length ? -1 : 0}
    onFocusCapture={event => { focused.current = event.target; ownsFocus.current = true; }}>
    {shown.length ? model.roots.map(renderEntry) : <p className="text-xs text-text-muted">
      {emptyText ?? (lang === 'ko' ? '표시할 항목이 없습니다.' : 'No items to show.')}
    </p>}
  </div>
  {onDrill && <span id={drillId} className="sr-only">{lang === 'ko' ? 'Enter: 이 단계로 이동' : 'Enter: go to this level'}</span>}
  </>;
}
