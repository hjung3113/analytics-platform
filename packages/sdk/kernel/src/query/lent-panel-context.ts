import { createContext } from 'react';
import type { GlobalContext } from '@ap/contracts';
import type { RegisteredPanel } from '../registry/panels';

export const LentPanelQueryContext = createContext<{
  source: RegisteredPanel;
  context: GlobalContext;
  instanceId: string;
  signal: AbortSignal;
  current: () => boolean;
} | null>(null);
