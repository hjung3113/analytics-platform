/**
 * Admin table label for a menu's space. Membership is `registry.spaceOf` (06 §9.1).
 * A global utility is 전역/Global; a space menu shows the space id, not its label.
 */
import type { SpaceId, Text } from '@ap/contracts';
import type { MenuEntry, Registry } from '@ap/kernel';

export function spaceFields(menu: MenuEntry, registry: Registry): { spaceId: SpaceId | null; spaceLabel: Text } {
  const space = registry.spaceOf(menu);
  return space === null
    ? { spaceId: null, spaceLabel: { ko: '전역', en: 'Global' } }
    : { spaceId: space.id, spaceLabel: { ko: space.id, en: space.id } };
}
