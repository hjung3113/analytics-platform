/**
 * PROTOTYPE (#1197): local stand-in for an SDK `HierarchyExplorer` tree. WAI-ARIA APG tree view: `tree`/`treeitem`/`group`,
 * `aria-level`·`aria-setsize`·`aria-posinset` on every node (children are rendered only when expanded = lazy), roving tabindex,
 * ↑/↓ visible nodes, → open or first child, ← close or parent, Home/End, Enter = activate, type-ahead on the first letter.
 * The expand caret and the row are separate targets (component.gallery, Carbon). Domain-free: labels and children come from props.
 */
import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@ap/ui';

export type TreeNode = { id: string; label: string; meta?: ReactNode; muted?: boolean; children?: () => TreeNode[] };
/** Indent per level (4 px + 16 px a level); deeper levels stop indenting. An SDK tree would take a level → indent token. */
const INDENT = ['pl-1', 'pl-5', 'pl-9', 'pl-13'];
type Flat = { node: TreeNode; level: number; parentId: string | null; setSize: number; posInSet: number };

function flatten(nodes: TreeNode[], expanded: ReadonlySet<string>, level = 1, parentId: string | null = null, out: Flat[] = []): Flat[] {
  nodes.forEach((node, i) => {
    out.push({ node, level, parentId, setSize: nodes.length, posInSet: i + 1 });
    if (node.children && expanded.has(node.id)) flatten(node.children(), expanded, level + 1, node.id, out);
  });
  return out;
}

export function HierarchyTree({ label, roots, selectedId, onSelect, onActivate, defaultExpanded = [] }: {
  label: string; roots: TreeNode[]; selectedId: string | null;
  /** Selection (click or Space): what the companion pane shows. */
  onSelect: (id: string) => void;
  /** Default action (Enter or double-click), e.g. open a leaf's page. */
  onActivate?: (id: string) => void;
  defaultExpanded?: string[];
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(defaultExpanded));
  const flat = flatten(roots, expanded);
  const [focusId, setFocusId] = useState<string | null>(null);
  const activeId = flat.some(f => f.node.id === focusId) ? focusId : flat.some(f => f.node.id === selectedId) ? selectedId : flat[0]?.node.id ?? null;
  const refs = useRef(new Map<string, HTMLElement>());
  const moveTo = (id: string | undefined) => { if (!id) return; setFocusId(id); refs.current.get(id)?.focus(); };
  const toggle = (id: string, open?: boolean) => setExpanded(prev => {
    const next = new Set(prev);
    if (open ?? !next.has(id)) next.add(id); else next.delete(id);
    return next;
  });
  const onKey = (event: KeyboardEvent, f: Flat, index: number) => {
    const { node } = f;
    const isParent = !!node.children;
    const open = expanded.has(node.id);
    const keys: Record<string, () => void> = {
      ArrowDown: () => moveTo(flat[index + 1]?.node.id),
      ArrowUp: () => moveTo(flat[index - 1]?.node.id),
      ArrowRight: () => { if (isParent && !open) toggle(node.id, true); else if (isParent) moveTo(flat[index + 1]?.node.id); },
      ArrowLeft: () => { if (isParent && open) toggle(node.id, false); else moveTo(f.parentId ?? undefined); },
      Home: () => moveTo(flat[0]?.node.id),
      End: () => moveTo(flat[flat.length - 1]?.node.id),
      Enter: () => (onActivate ? onActivate(node.id) : onSelect(node.id)),
      ' ': () => onSelect(node.id),
    };
    const run = keys[event.key];
    if (run) { event.preventDefault(); event.stopPropagation(); run(); return; }
    if (event.key.length === 1 && /\S/.test(event.key)) {
      const ch = event.key.toLowerCase();
      const after = [...flat.slice(index + 1), ...flat.slice(0, index + 1)];
      moveTo(after.find(x => x.node.label.toLowerCase().startsWith(ch))?.node.id);
    }
  };
  const render = (nodes: Flat[]): ReactNode => nodes.map(f => {
    const index = flat.indexOf(f);
    const { node } = f;
    const isParent = !!node.children;
    const open = expanded.has(node.id);
    const children = flat.filter(x => x.parentId === node.id);
    return <li key={node.id} role="none">
      <div ref={el => { if (el) refs.current.set(node.id, el); else refs.current.delete(node.id); }}
        role="treeitem" aria-level={f.level} aria-setsize={f.setSize} aria-posinset={f.posInSet} aria-expanded={isParent ? open : undefined}
        aria-selected={node.id === selectedId} tabIndex={node.id === activeId ? 0 : -1}
        onKeyDown={e => onKey(e, f, index)} onFocus={() => setFocusId(node.id)}
        onClick={() => { setFocusId(node.id); onSelect(node.id); }} onDoubleClick={() => onActivate?.(node.id)}
        className={cn('flex h-8 cursor-pointer items-center gap-1 rounded-sm pr-2', INDENT[Math.min(f.level, INDENT.length) - 1], ' text-sm outline-none hover:bg-surface-row-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring',
          node.id === selectedId && 'bg-surface-row-selected font-medium text-text-primary', node.muted && 'text-text-muted')}>
        {isParent
          ? <button type="button" tabIndex={-1} aria-hidden onClick={e => { e.stopPropagation(); toggle(node.id); }} className="grid size-6 shrink-0 place-items-center rounded-sm text-text-muted hover:bg-surface-sunken">
            <ChevronRight className={cn('size-3.5 transition-transform', open && 'rotate-90')} />
          </button>
          : <span className="size-6 shrink-0" aria-hidden />}
        <span className="min-w-0 flex-1 truncate" title={node.label}>{node.label}</span>
        {node.meta && <span className="tabular shrink-0 text-xs text-text-muted">{node.meta}</span>}
      </div>
      {isParent && open && <ul role="group">{render(children)}</ul>}
    </li>;
  });
  return <ul role="tree" aria-label={label} className="grid gap-px">{render(flat.filter(f => f.level === 1))}</ul>;
}
