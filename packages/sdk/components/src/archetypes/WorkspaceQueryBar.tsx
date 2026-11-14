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

/** Component-local copy, translated through useI18n like the workspace toolbar's text dictionary. */
export const workspaceQueryText = {
  pageConditions: { ko: '페이지 조건', en: 'Page conditions' },
  screenLayout: { ko: '화면 배치', en: 'Screen layout' },
  completed: { ko: '요약 조회 완료', en: 'Summary response completed' },
};
