import { describe, expect, expectTypeOf, it } from 'vitest';
import { groupId, menuPermission, spaceId, type GroupId, type MenuPermission, type Permission, type SpaceId } from '@ap/contracts';
import type { GroupDef, PlatformMenuEntry } from '../registry';

// ADR-0072: group, space and menu-permission ids are brands, so a plain string or an id of another kind cannot sit in their slots.
describe('brand ids (ADR-0072)', () => {
  it('accepts what the constructors return and nothing else', () => {
    expectTypeOf(groupId('x')).toExtend<GroupId>();
    expectTypeOf(spaceId('x')).toExtend<SpaceId>();
    expectTypeOf(menuPermission('x:view')).toExtend<MenuPermission>();
    expectTypeOf<string>().not.toExtend<GroupId>();
    expectTypeOf<SpaceId>().not.toExtend<GroupId>();
    expectTypeOf<GroupId>().not.toExtend<SpaceId>();
    expectTypeOf<string>().not.toExtend<MenuPermission>();
    expectTypeOf<GroupId>().not.toExtend<MenuPermission>();
  });

  it('keeps the literal, so an app derives narrow types from its own declarations', () => {
    expect(groupId('equipment')).toBe('equipment');
    expectTypeOf(groupId('equipment')).toExtend<'equipment'>();
  });

  it('rejects a plain string where a group, a space or a menu permission is expected', () => {
    // @ts-expect-error a plain string is not a GroupId
    const group: GroupDef['id'] = 'equipment';
    // @ts-expect-error a SpaceId is not a GroupId
    const crossed: GroupDef['id'] = spaceId('mars');
    // @ts-expect-error a plain string is not a menu permission
    const permission: PlatformMenuEntry['permission'] = 'equipment:view';
    void group; void crossed; void permission;
  });

  it('keeps kernel permissions assignable without a constructor', () => {
    expectTypeOf<'platform:view'>().toExtend<Permission>();
    expectTypeOf<'equipment:view'>().not.toExtend<Permission>();
  });
});
