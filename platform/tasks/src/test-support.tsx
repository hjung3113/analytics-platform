/** Fixtures shared by the Task page tests. */
import { ClipboardList, UserRound } from 'lucide-react';
import { createFeatureMenuHarness } from '@ap/feature-bridge/testing';
import type { MenuEntry } from '@ap/kernel';
import { manifests } from './index';

/** The global 내 활동 group needs one primary menu of its own (the real one is `notifications`, in another package): a hidden stand-in, so 내 Task is the only visible global entry. */
const myActivityStub: MenuEntry = { ...manifests.find(menu => menu.id === 'my-tasks')!, id: 'my-activity-stub', primary: true, navHidden: true, path: '/my-activity-stub', pageKeys: [], carrySet: undefined };

export const { registry, mountAt } = createFeatureMenuHarness({ manifests: [...manifests, myActivityStub], homeMenuId: 'tasks', group: { id: 'tasks', label: { ko: 'Tasks', en: 'Tasks' }, icon: ClipboardList }, globalGroups: [{ id: 'myActivity', label: { ko: '내 활동', en: 'My activity' }, icon: UserRound }] });

/**
 * Loads the lazy page modules (and the FeedbackOps screens behind them) before a file's first mount: a cold import can take
 * seconds on CI, which would otherwise count against the first test's `findBy` wait.
 */
export const warmPages = () => Promise.all([import('./pages/FoTaskBoard'), import('./pages/FoTaskList'), import('./pages/FoMyTasks'), import('./pages/FoTaskRequests'), import('./pages/FoMilestones')]);
