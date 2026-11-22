/** Fixtures shared by the Task page tests. */
import { ClipboardList, UserRound } from 'lucide-react';
import { createFeatureMenuHarness } from '@ap/feature-bridge/testing';
import type { MenuEntry } from '@ap/kernel';
import { manifests } from './index';

/** The global 내 활동 group needs one primary menu of its own (the real one is `notifications`, in another package): a hidden stand-in, so 내 Task is the only visible global entry. */
const myActivityStub: MenuEntry = { ...manifests.find(menu => menu.id === 'my-tasks')!, id: 'my-activity-stub', primary: true, navHidden: true, path: '/my-activity-stub', pageKeys: [], carrySet: undefined };

/** The Task menu harness; `override` changes one menu entry (the stand-in keeps the real 내 Task shape). */
export function createTaskHarness(override?: (entry: MenuEntry) => MenuEntry) {
  const menus = override ? manifests.map(override) : [...manifests];
  return createFeatureMenuHarness({ manifests: [...menus, myActivityStub], homeMenuId: 'tasks', group: { id: 'tasks', label: { ko: 'Tasks', en: 'Tasks' }, icon: ClipboardList }, globalGroups: [{ id: 'myActivity', label: { ko: '내 활동', en: 'My activity' }, icon: UserRound }] });
}

export const { registry, mountAt } = createTaskHarness();

/**
 * Loads the lazy page modules (and the feature screens behind them) before a file's first mount: a cold import can take
 * seconds on CI, which would otherwise count against the first test's `findBy` wait.
 */
export const warmPages = () => Promise.all([import('./pages/FeatureTaskBoard'), import('./pages/FeatureTaskList'), import('./pages/FeatureMyTasks'), import('./pages/FeatureTaskRequests'), import('./pages/FeatureMilestones')]);
