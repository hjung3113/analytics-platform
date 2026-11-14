import { createContext, useContext, type ReactNode } from 'react';
import { useCompactPageDensity } from '../pageDensity';

/** Page-owned controls reach the shell's query-bar region without a reverse package dependency. */
export const WorkspaceQueryBarContext = createContext<{
  status: ReactNode;
  parameterTarget: HTMLDivElement | null;
  setParameterTarget: (target: HTMLDivElement | null) => void;
  toolbarTarget: HTMLDivElement | null;
  setToolbarTarget: (target: HTMLDivElement | null) => void;
} | null>(null);

/** Shell slot: the fixed second line of a folded apply-mode Analysis Workspace query bar (ADR-0160). */
export function WorkspaceQueryBarRow() {
  const workspace = useContext(WorkspaceQueryBarContext);
  const compact = useCompactPageDensity();
  if (!workspace) return null;
  return <div data-workspace-query-row className={compact ? 'px-4 pb-2' : 'px-3 pb-2'}>
    <div className="flex min-w-0 items-center gap-2 break-keep">
      {workspace.status}
      <div ref={workspace.setParameterTarget} className="min-w-0" />
      <div ref={workspace.setToolbarTarget} data-workspace-toolbar-slot className="ml-auto shrink-0" />
    </div>
  </div>;
}
