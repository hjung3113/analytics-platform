import type { LayoutDocument } from '@eqv/core';
import { Button, cn } from '@ap/ui';

export function Outline({ layout, selectedId, select }: { layout: LayoutDocument; selectedId: string | null; select(id: string): void }) {
  const ordered: { component: LayoutDocument['components'][number]; depth: number }[] = [];
  const children = new Map<string | null, LayoutDocument['components'][number][]>();
  for (const component of layout.components) {
    const parent = component.parentId ?? null;
    const siblings = children.get(parent) ?? [];
    siblings.push(component);
    children.set(parent, siblings);
  }
  const visit = (parent: string | null, depth: number) => {
    for (const component of children.get(parent) ?? []) {
      ordered.push({ component, depth });
      visit(component.id, depth + 1);
    }
  };
  visit(null, 1);
  return <div role="tree" aria-label="Components 구성" className="space-y-1">
    {ordered.map(({ component: c, depth }, index) => <div key={c.id} className={cn('rounded-md', selectedId === c.id && 'bg-surface-row-selected')}>
      <Button role="treeitem" aria-selected={selectedId === c.id} aria-level={depth}
        tabIndex={selectedId === c.id || (!selectedId && index === 0) ? 0 : -1} size="toolbar" variant="navigation" className="w-full justify-start" onClick={() => select(c.id)}
        onKeyDown={event => {
          if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
          if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? ordered.length - 1 : Math.max(0, Math.min(ordered.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)));
          select(ordered[next]!.component.id);
          event.currentTarget.closest('[role=tree]')?.querySelectorAll<HTMLButtonElement>('[role=treeitem]')[next]?.focus();
        }}>
        <span className={cn('truncate font-mono text-xs', c.parentId && 'ml-4', selectedId === c.id && 'font-semibold')}>{c.id}</span>
        <span className="ml-auto text-xs text-text-secondary">{c.role}</span>
      </Button>
    </div>)}
  </div>;
}
