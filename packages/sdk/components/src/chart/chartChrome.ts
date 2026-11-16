import type { ReactNode } from 'react';

/** Amount of chart chrome; omitted uses full in cards/board panes and standard in workspace panels. */
export type ChartChrome = 'full' | 'standard' | 'minimal';

/** Menu-declared chart chrome; the SDK applies these choices without reading URL or domain state. */
export type ChartChromeOptions = {
  /** Chrome level: full in cards/board panes, standard in workspace panels by default. An explicit value always wins. */
  chrome?: ChartChrome;
  /** Standard only: legend above, below (default), or as a vertical list beside the plot. Ignored by full/minimal. */
  legendPlacement?: 'top' | 'bottom' | 'side';
  /** Standard only: always (default) or hover/focus-within. Hover tools remain keyboard/AT reachable and visible while More is open. Ignored by full/minimal. */
  toolsReveal?: 'always' | 'hover';
  /** Standard only: optional caption at the end of a top/bottom legend line, or below the side list. Ignored by full/minimal. */
  legendCaption?: ReactNode;
};
