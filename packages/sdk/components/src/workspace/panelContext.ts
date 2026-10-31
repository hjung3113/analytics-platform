import { createContext, createElement, useContext, type ReactNode } from 'react';

/**
 * What the nearest container around a card, chart frame or table is. `true` = a `PanelWorkspace` panel: the tab already shows the panel's
 * name, so a card or chart frame inside draws its title heading visually hidden (`sr-only`, the accessible name stays), and a table's row area
 * lets the wheel chain to the panel's scroll container at its edge (`overscroll-auto`). `'pane'` = a board pane body: the pane owns the border,
 * so the chart frame and table draw no border of their own, but titles stay visible. Both own the border, whatever the page density (#1166).
 * Internal; only `EmbeddedPane` is exported from the package.
 */
const InWorkspacePanelContext = createContext<boolean | 'pane'>(false);
export const InWorkspacePanelProvider = InWorkspacePanelContext.Provider;
/** True inside a `PanelWorkspace` panel only (title and wheel behaviour). */
export const useInWorkspacePanel = () => useContext(InWorkspacePanelContext) === true;
/** True inside a panel or a board pane: the container owns the border, radius and outer padding. */
export const useEmbeddedChrome = () => useContext(InWorkspacePanelContext) !== false;

/** Board hosts wrap a pane's screen in this: chart frames and tables inside draw no card border of their own (the pane draws it). */
export function EmbeddedPane({ children }: { children: ReactNode }) {
  return createElement(InWorkspacePanelContext.Provider, { value: 'pane' }, children);
}
