import type { MenuMeta } from '@ap/contracts';

export function singleValuePageKeyRoles(menu: Pick<MenuMeta, 'drill' | 'conditionPreset' | 'navViews'>) {
  return [
    ['drill level key', menu.drill?.levels.map(level => level.key) ?? []],
    ['drill basisKey', menu.drill?.levels.flatMap(({ basisKey }) => basisKey ?? []) ?? []],
    ['conditionPreset key', menu.conditionPreset ? [menu.conditionPreset.key] : []],
    ['navView preset key', menu.navViews?.flatMap(view => Object.keys(view.page)) ?? []],
  ] as const;
}
