import type { ReactNode } from 'react';
import type { DockNode } from './schema';

export type DockPanel = {
  id: string;
  /** Accessible name of the tab and the panel, already localised. */
  title: string;
  render: () => ReactNode;
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
   * Header-right slot of every group, e.g. the group `⋯` menu. The element that opens the menu carries `data-dock-group-menu`; Shift+F10 and the
   * ContextMenu key on a focused tab focus it and open it (a `pointerdown` for Radix `DropdownMenuTrigger`, otherwise a `click`).
   */
  renderGroupActions?: (group: { panels: string[]; active: string }) => ReactNode;
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
