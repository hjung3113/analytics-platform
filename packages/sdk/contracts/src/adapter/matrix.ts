import type { ColumnFilter } from './column-filters.js';

/**
 * Axis-neutral node on the hierarchical axis; `level` is zero-based. `count`, when supplied, is the server's count over the
 * whole filtered result, never a subtotal of a browser window. Meaning and expansion defaults belong to the consumer.
 * A later swapped presentation can use flat entities as rows and leaves as columns with level paths as table column groups.
 * That presentation must declare a column limit: PlatformDataTable has no column virtualization (DOM size, readable headers,
 * and a usable screen-reader column count). This contract does not implement that presentation.
 */
export type MatrixNode = {
  id: string;
  level: number;
  kind: 'group' | 'leaf';
  hasChildren: boolean;
  expanded: boolean;
  label: string;
  count?: number;
};

/** Flat-axis identity and presentation; no domain meaning. The same ids can identify entities in a later swapped view. */
export type MatrixColumn = {
  id: string;
  label: string;
  headerNote?: string;
  /** Omission uses identity for the declared identity column and value for other columns; table size scales all presets. */
  width?: 'identity' | 'compact' | 'value' | 'wide';
  pin?: 'left' | 'right';
  /** Retained by both explicit hiding and the transient matching-column projection. */
  alwaysVisible?: boolean;
};

/** Consumer merges its own parameters and fetches through Kernel useMenuQuery; filters apply to the whole server result. */
export type MatrixWindowQuery = {
  levels: string[];
  expanded: string[];
  filters?: ColumnFilter[];
  offset: number;
  limit: number;
};

/** One flattened visible-tree window. All counts are server-owned and cover the whole filtered result, never this window. */
export type MatrixWindow<N extends MatrixNode = MatrixNode> = {
  nodes: N[];
  offset: number;
  totalVisible: number;
};

/** Transient client-side row emphasis; inclusive numeric ranges never coerce strings, and null never matches. Not saved. */
export type MatrixEmphasisRule = {
  row: string;
  match: { kind: 'range'; min?: number; max?: number } | { kind: 'values'; values: (string | number)[] };
};

/** Local cell identity. Selection and activation never imply a change to Global Context. */
export type MatrixCell = { row: string; column: string };
