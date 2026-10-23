import type { ReactNode } from 'react';
import type { DockNode } from './schema';

export type DockPanel = {
  id: string;
  /** Accessible name of the tab and the panel, already localised. */
  title: string;
  render: () => ReactNode;
  /** px, this panel's own minimum; falls back to `minPanelSize`. The engine enforces it; the platform separators' keyboard limits still use `minPanelSize`. */
  minWidth?: number;
  minHeight?: number;
};

export type DockSeparatorInfo = { dir: 'row' | 'column'; before: string[]; after: string[] };

export type DockLayoutProps = {
  panels: readonly DockPanel[];
  /** Normalised by the caller (`normalizeDockTree`). */
  layout: DockNode;
  /** Drag, sash drag, separator keys, tab drop and user tab activation. */
  onLayoutChange: (next: DockNode) => void;
  /** User activation only: pointer on a tab, Enter/Space/arrows on a tab, focus moving into a panel. Never for engine-originated changes. */
  onActivate?: (panelId: string) => void;
  maximizedPanelId?: string | null;
  onMaximizedChange?: (panelId: string | null) => void;
  /**
   * Delete/Backspace on a focused tab. The engine's own close stays blocked either way; this is the host's chance to give the key a
   * meaning (the board empties the pane). Receives the tab's panel id.
   */
  onPanelDelete?: (panelId: string) => void;
  /** Tab content; the default is the title. The tab itself (role, focus, drag) belongs to the engine. */
  renderTab?: (panelId: string, state: { active: boolean; groupFocused: boolean }) => ReactNode;
  /**
   * Header-right slot of every group (its active tab's area, e.g. the pane's chips and `⋯` menu), a sibling of the tab list. `stripWidth` is the
   * px width of the group's whole header strip, for a host that fits its content against the tabs. The element that opens the group's menu
   * carries `data-dock-group-menu`: Shift+F10, the ContextMenu key and a right-click on a tab activate that tab (through `onActivate`), then
   * open it with the keyboard, so its first item has focus (a `keydown` for Radix `DropdownMenuTrigger`, otherwise a `click`).
   *
   * Hooks on the content (plain attributes, CSS only): `data-dock-compact` anywhere in the slot collapses the parts of background tabs marked
   * `data-dock-tab-shrinkable` (the action marked `data-dock-tab-action` shows on hover and focus only); `data-dock-wrap` moves the slot to its
   * own row under the tabs; `data-dock-selected` gives the whole strip the host's selection surface and bar.
   */
  renderGroupActions?: (group: { panels: string[]; active: string }, state: { stripWidth: number }) => ReactNode;
  /**
   * The panel the host treats as current (the board's selected pane). The narrow display shows it, so what the user sees and what the host
   * works on stay the same panel; without it the narrow display follows the first group's active tab and the user's own tab choice.
   */
  currentPanelId?: string;
  /**
   * Spoken extras of a panel's tab, set on the engine's tab element (the engine owns it): `description` is its `aria-description`, `keyShortcuts`
   * its `aria-keyshortcuts` (the keys the tab answers to, e.g. `Delete Shift+F10`).
   */
  tabA11y?: (panelId: string) => { description?: string; keyShortcuts?: string } | undefined;
  separatorLabel: (info: DockSeparatorInfo) => string;
  /** px, for Home/End and clamps. Default `{ width: 240, height: 160 }`. */
  minPanelSize?: { width: number; height: number };
  /** Container px: below it every panel sits in ONE tab group (display only, nothing is reported or stored). */
  stackBelow?: number;
  /** Accessible name of the region. */
  label: string;
};

export const DEFAULT_MIN_PANEL_SIZE = { width: 240, height: 160 } as const;

/**
 * Internal (`DockLayoutBase`, never on the public `DockLayoutProps`): the layout's top-level rows keep their own px height. The layout is
 * `sum(heights)` tall (the caller scrolls), the platform separators own the boundaries between rows and below the last one, and a strip
 * under the last row takes a dropped tab. Absent = the layout fills its container and shares it by percent, as everywhere else.
 */
export type DockRows = {
  /** px of each top-level row, in layout order; the length is the number of rows of `layout`. */
  heights: readonly number[];
  /** px least height of each row. */
  minimums: readonly number[];
  /** px most a user resize may give a row (the visible area). */
  maximum: number;
  onHeightsChange: (heights: number[]) => void;
  /** A single tab dropped on the strip under the last row. Without it there is no strip. */
  onDropBelow?: (panelId: string) => void;
  dropBelowLabel?: string;
  /**
   * The engine's own drop (a tab on a group's edge or centre, or a drop that is a whole group, then `null`) is about to be reported as a new
   * layout. Called before that report, once per drop, with the dropped tab's id: the layout alone cannot say which panel moved. The caller
   * keeps the id until the next layout report and uses it once.
   */
  onPanelDrop?: (panelId: string | null) => void;
};
