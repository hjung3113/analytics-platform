type TreeKeyRow = { id: string; depth: number; hasChildren: boolean };
type TreeKeyOptions = {
  rows: readonly TreeKeyRow[];
  id: string;
  expanded: ReadonlySet<string>;
  focus: (id: string) => void;
  toggle: (id: string) => void;
  enter: (id: string) => void;
  space: (id: string) => void;
};
/** Shared APG tree walk. Navigation and value trees supply their own Enter/Space policies. */
export function hierarchyTreeKey(event: { key: string; preventDefault: () => void }, options: TreeKeyOptions): void {
  const { rows, id, expanded, focus, toggle, enter, space } = options;
  const index = rows.findIndex(row => row.id === id);
  const row = rows[index];
  if (!row) return;
  const next = (position: number) => { const item = rows[Math.max(0, Math.min(rows.length - 1, position))]; if (item) focus(item.id); };
  if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'ArrowLeft', 'ArrowRight', 'Enter', ' '].includes(event.key)) event.preventDefault();
  switch (event.key) {
    case 'ArrowDown': next(index + 1); break;
    case 'ArrowUp': next(index - 1); break;
    case 'Home': next(0); break;
    case 'End': next(rows.length - 1); break;
    case 'ArrowRight':
      if (row.hasChildren) { if (!expanded.has(id)) toggle(id); else if (rows[index + 1]?.depth > row.depth) next(index + 1); }
      break;
    case 'ArrowLeft':
      if (expanded.has(id)) toggle(id);
      else { const parent = rows.slice(0, index).reverse().find(item => item.depth < row.depth); if (parent) focus(parent.id); }
      break;
    case 'Enter': enter(id); break;
    case ' ': space(id); break;
  }
}
