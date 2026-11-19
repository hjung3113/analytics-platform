import { createContext, type RefObject } from 'react';

export type QueryBarTool = 'history' | 'view';

export const QueryBarTools = createContext<{
  folded: boolean;
  active: QueryBarTool | null;
  close(): void;
  anchorRef: RefObject<HTMLButtonElement | null>;
  reportViewAvailable(available: boolean): void;
} | null>(null);
