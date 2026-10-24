// THROWAWAY #595 — never merge.
// Branch points the FeedbackOps-in-shell prototype hooks into. The app sets it once before render (apps/platform-web/src/proto);
// unset (variant=none) every shell part behaves as before.
import type { ComponentType } from 'react';

export type Proto595 = {
  /** Registry space id of the FeedbackOps work system. */
  spaceId: string;
  reporter: boolean;
  /** Sidebar of the FeedbackOps space (replaces AppSidebar there). */
  Sidebar: ComponentType<{ collapsed: boolean; onToggle: () => void }>;
  /** Bottom block of the other systems (replaces the new-tab block). */
  Block: ComponentType<{ collapsed: boolean }>;
  /** A switcher card was picked: a direct entry has no return line. */
  onSwitcherPick: () => void;
};

let current: Proto595 | null = null;
export const setProto595 = (next: Proto595 | null) => { current = next; };
export const getProto595 = () => current;
