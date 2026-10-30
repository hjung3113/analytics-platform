import type { SpaceDef, SpaceId, Text } from '@ap/contracts';

/** Private home Consumer presentation metadata supplied by the app, not access policy. */
export interface HomeLauncherGroup {
  readonly id: string;
  readonly label: Text;
  readonly spaces: readonly SpaceId[];
}

export function groupHomeSpaces(groups: readonly HomeLauncherGroup[], spaces: readonly SpaceDef[]) {
  const assigned = new Set(groups.flatMap(group => group.spaces));
  const classified = groups.map(group => ({
    id: group.id,
    label: group.label,
    spaces: spaces.filter(space => group.spaces.includes(space.id)),
  }));
  const other = spaces.filter(space => !assigned.has(space.id));
  return [...classified, { id: 'other', label: { ko: '기타', en: 'Other' }, spaces: other }].filter(group => group.spaces.length > 0);
}
