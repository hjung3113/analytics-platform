import { createContext, useContext } from 'react';

/**
 * True inside a `PanelWorkspace` panel: the tab already shows the panel's name, so a card or chart frame inside draws its title heading
 * visually hidden (`sr-only`, the accessible name stays), and a table's row area lets the wheel chain to the panel's scroll container
 * at its edge (`overscroll-auto`). Internal; not exported from the package.
 */
const InWorkspacePanelContext = createContext(false);
export const InWorkspacePanelProvider = InWorkspacePanelContext.Provider;
export const useInWorkspacePanel = () => useContext(InWorkspacePanelContext);
