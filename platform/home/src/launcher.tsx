import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { PageProps } from '@ap/kernel';
import type { HomeLauncherGroup } from './launcher-groups';

export type { HomeLauncherGroup } from './launcher-groups';

/** Capture app presentation once; load the screen only when the route is rendered. */
export function createHomeComponent(groups: readonly HomeLauncherGroup[]): LazyExoticComponent<ComponentType<PageProps>> {
  const seen = new Set<string>();
  const captured = groups.map(group => ({ ...group, label: { ...group.label }, spaces: [...group.spaces] }));
  for (const group of captured) {
    for (const id of group.spaces) {
      if (seen.has(id)) throw new Error(`Home launcher: duplicate space "${id}"`);
      seen.add(id);
    }
  }
  return lazy(async () => {
    const { default: OperationsHome } = await import('./pages/OperationsHome');
    return { default: (props: PageProps) => <OperationsHome {...props} launcherGroups={captured} /> };
  });
}
