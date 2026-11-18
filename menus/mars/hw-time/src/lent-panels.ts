// The composition root imports this entry. The chart and its query load when a permitted receiver mounts it.
import { lazy } from 'react';
import type { LentPanelRegistration } from '@ap/kernel';
import { readLentTrendInputs } from './pages/analysis/lentTrendInputs';

export const lentTrendPanel: LentPanelRegistration = {
  component: lazy(() => import('./pages/analysis/LentTrendPanel')),
  accepts(inputs) {
    const result = readLentTrendInputs(inputs);
    return 'missing' in result ? result.missing : undefined;
  },
};
