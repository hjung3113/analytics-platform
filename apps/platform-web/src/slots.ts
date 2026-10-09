import { createElement, type ReactNode } from 'react';
import type { PlatformSlots } from '@ap/kernel';
import { GlobalContextBar } from '@ap/shell';

/** Slots `main.tsx` passes to PlatformProvider. `feedbackOps` stays absent until #251. */
export function appSlots(assembly: { topBarTools: ReactNode }): PlatformSlots {
  return { contextBar: createElement(GlobalContextBar), topBarTools: assembly.topBarTools };
}
