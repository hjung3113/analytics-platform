import { createElement, type ReactNode } from 'react';
import { ClipboardCheck, FileSearch, LineChart } from 'lucide-react';
import type { PlannedSpace, PlatformSlots } from '@ap/kernel';
import { GlobalContextBar, OpenInBoardAction } from '@ap/shell';
import { feedbackOpsSlot } from './feedbackops-systems';

/** Business systems announced in the switcher but not built (15 §3.2). Display only: no Registry entry, no permission, no menu. */
export const PLANNED_SPACES: readonly PlannedSpace[] = [
  { id: 'clas', label: { ko: 'CLAS', en: 'CLAS' }, subtitle: { ko: '생산성 분석', en: 'Productivity analysis' }, icon: LineChart },
  { id: 'standard-log', label: { ko: '표준 로그 개발', en: 'Standard log development' }, icon: FileSearch },
  { id: 'improvement', label: { ko: '개선 실행', en: 'Improvement execution' }, icon: ClipboardCheck },
];

/** Slots `main.tsx` passes to PlatformProvider. `feedbackOpsOrigin` is the one value `main.tsx` read from the env (#60). */
export function appSlots(assembly: { topBarTools: ReactNode }, feedbackOpsOrigin: string | null): PlatformSlots {
  return { contextBar: createElement(GlobalContextBar), topBarTools: assembly.topBarTools, feedbackOps: feedbackOpsSlot(feedbackOpsOrigin), plannedSpaces: PLANNED_SPACES, boardEntry: createElement(OpenInBoardAction) };
}
