/** Fixtures shared by the Task page tests. */
import { ClipboardList } from 'lucide-react';
import { createFoMenuHarness } from '@ap/fo-bridge/testing';
import { manifests } from './index';

export const { registry, mountAt } = createFoMenuHarness({ manifests, homeMenuId: 'fo-tasks', group: { id: 'foTasks', label: { ko: 'Tasks', en: 'Tasks' }, icon: ClipboardList } });

/**
 * Loads the lazy page modules (and the FeedbackOps screens behind them) before a file's first mount: a cold import can take
 * seconds on CI, which would otherwise count against the first test's `findBy` wait.
 */
export const warmPages = () => Promise.all([import('./pages/FoTaskBoard'), import('./pages/FoTaskList'), import('./pages/FoMyTasks'), import('./pages/FoTaskRequests'), import('./pages/FoMilestones')]);
