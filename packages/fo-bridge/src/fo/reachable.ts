import type { Registry } from '@ap/kernel';
import type { PlatformTarget } from './links';

/** A target whose menu the current registry does not hold is unmapped (ADR-0071 decision 10): `linkTo` would throw for it, and another space or a test registry may simply not have the menu. */
export const isReachable = (registry: Registry, target: PlatformTarget | null): target is PlatformTarget =>
  target !== null && registry.menus.some(menu => menu.id === target.menuId);
