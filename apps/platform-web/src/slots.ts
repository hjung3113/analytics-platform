import { createElement, type ReactNode } from 'react';
import { ClipboardCheck, FileSearch } from 'lucide-react';
import type { PlannedSpace, PlatformSlots } from '@ap/kernel';
import { GlobalContextBar } from '@ap/shell';

/** Business systems announced in the switcher but not built (15 §3.2). Display only: no Registry entry, no permission, no menu. */
export const PLANNED_SPACES: readonly PlannedSpace[] = [
  { id: 'standard-log', label: { ko: '표준 로그 개발', en: 'Standard log development' }, icon: FileSearch },
  { id: 'improvement', label: { ko: '개선 실행', en: 'Improvement execution' }, icon: ClipboardCheck },
];

/** Slots `main.tsx` passes to PlatformProvider. `feedbackOps` stays absent until #251. */
export function appSlots(assembly: { topBarTools: ReactNode }): PlatformSlots {
  return { contextBar: createElement(GlobalContextBar), topBarTools: assembly.topBarTools, plannedSpaces: PLANNED_SPACES };
}
