import type { ComponentType, LazyExoticComponent } from 'react';
import type { LucideIcon } from 'lucide-react';
import { GLOBAL_KEYS, KERNEL_PERMISSIONS, isAppRelativePath, parseQuery, requiredContextError, RETURN_TO_KEY, menuPermissions, type CarrySetDef, type CarrySetId, type ContextKey, type GroupId, type HostFeature, type MenuMeta, type MenuPermission, type ModuleScopedId, type ModuleScreenProps, type PageType, type Permission, type SpaceDef, type SpaceId, type Text } from '@ap/contracts';

/** docs/06 §5: menus declare, the shell consumes. Metadata lives in @ap/contracts; this adds the React bindings. */
export type PageProps = { params: Record<string, string> };

export type PlatformMenuEntry = MenuMeta & {
  icon: LucideIcon;
  component?: LazyExoticComponent<ComponentType<PageProps>>;
  module?: undefined;
  moduleScreen?: undefined;
};

/**
 * A menu a module brings (ADR-0053): open vocabulary, prefixed with `module`. `moduleScreen` is rendered with
 * `{ params, host }` (the shell's ModuleScreen); it has no `component` but still counts as implemented.
 */
export type ModuleMenuEntry = Omit<MenuMeta, 'group' | 'permission'> & {
  module: string;
  group: ModuleScopedId;
  permission: ModuleScopedId;
  icon: LucideIcon;
  component?: undefined;
  moduleScreen: ComponentType<ModuleScreenProps>;
  /** Host features the module declared (`requires` ∪ `optional`) that this host provides; `mountModule` fills it. */
  moduleFeatures?: readonly HostFeature[];
  /** The manifest's `config` keys with the values the assembly gave; `mountModule` fills it. */
  moduleConfig?: Readonly<Record<string, string>>;
};

export type MenuEntry = PlatformMenuEntry | ModuleMenuEntry;

/** Group ids a menu can name: one the app declares or a module-prefixed id. */
export type AnyGroupId = GroupId | ModuleScopedId;

type GroupBase = {
  label: Text;
  icon: LucideIcon;
  /** `null` is a global utility. Required, not optional, so omission cannot skip the space check (06 §9.1). */
  space: SpaceId | null;
  /** In the expanded sidebar, omit the section label when only one visible menu remains. */
  hideLabelWhenSingle?: boolean;
};
export type PlatformGroupDef = GroupBase & { id: GroupId; module?: undefined };
export type ModuleGroupDef = GroupBase & { id: ModuleScopedId; module: string };
export type GroupDef = PlatformGroupDef | ModuleGroupDef;

/** `viaAlias` is true when the pathname matched a legacy alias instead of the menu's canonical path (ADR-0093). `params` always use the canonical path's parameter names. */
export type RouteMatch = { menu: MenuEntry; params: Record<string, string>; viaAlias: boolean };

export type Registry = {
  groups: readonly GroupDef[];
  menus: readonly MenuEntry[];
  spaces: readonly SpaceDef[];
  /** The app's declared carry sets (page keys that follow the user between member menus, any space). */
  carrySets: readonly CarrySetDef[];
  /** Every permission a menu or space may name: the kernel's, then the app's declared ones, in declaration order. The one runtime list for selects and validators. */
  permissions: readonly Permission[];
  groupById: (id: AnyGroupId) => GroupDef;
  spaceById: (id: SpaceId) => SpaceDef;
  /** Space of the menu's group — membership lives on the group, never on the menu. Null when the group is a global utility (06 §9.1). */
  spaceOf: (menu: MenuEntry) => SpaceDef | null;
  /** Carry set the menu joined with `carrySet`, or null. Independent of the menu's space. */
  carrySetOf: (menu: MenuEntry) => CarrySetDef | null;
  menuById: (id: string) => MenuEntry;
  /** The menu at the platform home path, declared by `platformHomeMenuId`. Null when the app has no space-less `/` menu. */
  platformHome: MenuEntry | null;
  matchRoute: (pathname: string) => RouteMatch | null;
  /** The href in canonical path form (ADR-0093): a legacy alias path becomes the menu's canonical path; search is kept byte for byte. Anything else is returned as is. */
  canonicalHref: (href: string) => string;
  /**
   * Registry-dependent half of the URL contract (kept out of @ap/contracts — it needs the Registry; platform-packages.md §3).
   * Entry URL for “back”, or null. Registered non-detail menu, query parses for that menu.
   * Returns the original string so the entry URL is not rewritten.
   */
  safeReturnTo: (value: string | null) => string | null;
};

export class RegistryError extends Error {}

const namespaceOf = (permission: string) => permission.split(':')[0];
const KERNEL_NAMESPACES = new Set<string>(KERNEL_PERMISSIONS.map(namespaceOf));
/** True when `id` is the namespace of a kernel permission; a module id may not take one. `createRegistry` also reserves the namespaces of the app's declared permissions. */
export const isKernelNamespace = (id: string) => KERNEL_NAMESPACES.has(id);
/** An id the URL and the Registry can carry as is: non-empty, no whitespace, none of `? # & /`. */
const isIdShape = (id: unknown): id is string => typeof id === 'string' && /^[^\s?#&/]+$/.test(id);
/** `<namespace>:<action>`, each part an id shape without `:`. */
const isPermissionShape = (value: unknown): value is string => typeof value === 'string' && /^[^\s:?#&/]+:[^\s:?#&/]+$/.test(value);

/** Roots the platform itself serves; a space id may not take one (ADR-0093). The app adds its own menu roots through `createRegistry`'s `reservedRoots`. */
const RESERVED_PLATFORM_ROOTS: readonly string[] = ['board', 'api', 'auth'];
/** Path segment derived from a menu id: `:` → `-`, camelCase → kebab-case, lower-case. */
export const menuSlug = (id: string) => id.replace(/:/g, '-').replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

const segments = (path: string) => path.split('/').filter(Boolean);
const isParam = (seg: string) => seg.startsWith(':');

/** The analysis board's reserved path (docs/16 §7). A platform screen, not a Registry route; no menu may take it or live under it. */
export const BOARD_PATH = '/board';
/** True for `/board` itself, with or without a trailing slash. Deeper paths are not the board. */
export const isBoardPath = (pathname: string) => pathname.replace(/\/+$/, '') === BOARD_PATH;

/**
 * Validates the declared IA once and returns the lookup functions the kernel and shell use
 * (docs/integration/platform-packages.md §5). Throws RegistryError on any violation.
 */
export function createRegistry({ spaces, groups, menus: menusIn, permissions: declared = [], carrySets = [], platformHomeMenuId, reservedRoots = [] }: { spaces: readonly SpaceDef[]; groups: readonly GroupDef[]; menus: readonly MenuEntry[]; /** The app's menu permissions. Omit when the menus use only kernel permissions. */ permissions?: readonly MenuPermission[]; /** The app's carry sets. Omit when no page key follows the user between menus. */ carrySets?: readonly CarrySetDef[]; /** Id of the menu at the platform home path. Required when a space-less menu declares `/`. */ platformHomeMenuId?: string; /** Roots the app serves outside the Registry (its menu roots, e.g. `voc`); a space id may not take one. Added to the platform's own `board`, `api` and `auth`. */ reservedRoots?: readonly string[] }): Registry {
  const fail = (message: string): never => { throw new RegistryError(message); };
  // Runtime config can hold non-strings the brand does not stop: check the shape before the namespace is taken.
  for (const p of declared) if (!isPermissionShape(p)) fail(`Declared permission "${String(p)}" must be "<namespace>:<action>" without whitespace or ? # & /`);
  for (const root of reservedRoots) if (!isIdShape(root)) fail(`Reserved root "${String(root)}" must be non-empty without whitespace or ? # & /`);
  const permissions: readonly Permission[] = [...KERNEL_PERMISSIONS, ...declared];
  const reserved = new Set<string>(permissions.map(namespaceOf));
  const isPlatformPermission = (value: string) => (permissions as readonly string[]).includes(value);
  const seenPermissions = new Set<string>();
  for (const p of declared) {
    if ((KERNEL_PERMISSIONS as readonly string[]).includes(p)) fail(`Declared permission "${p}" duplicates a kernel permission`);
    if (seenPermissions.has(p)) fail(`Duplicate declared permission "${p}"`);
    seenPermissions.add(p);
  }
  const carrySetByIdMap = new Map<CarrySetId, CarrySetDef>();
  for (const c of carrySets) {
    if (!isIdShape(c?.id)) fail(`Carry set id "${String(c?.id)}" must be non-empty without whitespace or ? # & /`);
    if (carrySetByIdMap.has(c.id)) fail(`Duplicate carry set id "${c.id}"`);
    carrySetByIdMap.set(c.id, c);
    if (!Array.isArray(c.pageKeys)) fail(`Carry set "${c.id}" pageKeys must be a list`);
    const seenCarried = new Set<string>();
    for (const key of c.pageKeys) {
      if (!isIdShape(key)) fail(`Carry set "${c.id}" page key "${String(key)}" must be non-empty without whitespace or ? # & /`);
      if (GLOBAL_KEYS.has(key)) fail(`Carry set "${c.id}" page key "${key}" collides with a global Context key`);
      if (seenCarried.has(key)) fail(`Carry set "${c.id}" page key "${key}" is declared twice`);
      seenCarried.add(key);
    }
  }
  const spaceByIdMap = new Map<SpaceId, SpaceDef>();
  for (const s of spaces) {
    if (!isIdShape(s.id)) fail(`Space id "${String(s.id)}" must be non-empty without whitespace or ? # & /`);
    if (RESERVED_PLATFORM_ROOTS.includes(s.id) || reservedRoots.includes(s.id)) fail(`Space id "${s.id}" is a reserved platform root`);
    if (s.permission !== undefined && !isPlatformPermission(s.permission)) fail(`Space "${s.id}" permission "${s.permission}" is not a platform permission (kernel or declared)`);
    if (spaceByIdMap.has(s.id)) fail(`Duplicate space id "${s.id}"`);
    spaceByIdMap.set(s.id, s);
  }
  const byId = new Map<string, MenuEntry>();
  for (const m of menusIn) {
    if (byId.has(m.id)) fail(`Duplicate menu id "${m.id}"`);
    byId.set(m.id, m);
  }
  const groupIds = new Set<string>();
  const groupSpace = new Map<AnyGroupId, SpaceId | null>();
  const groupOwner = new Map<AnyGroupId, string | undefined>();
  for (const g of groups) {
    if (groupIds.has(g.id)) fail(`Duplicate group id "${g.id}"`);
    if (g.space !== null && !spaceByIdMap.has(g.space)) fail(`Group "${g.id}" uses undeclared space "${g.space}"`);
    if (!isIdShape(g.id)) fail(`Group id "${String(g.id)}" must be non-empty without whitespace or ? # & /`);
    if (g.module === undefined) {
      if (g.id.includes(':')) fail(`Group "${g.id}" has no module and is not a platform group id (no ":" allowed)`);
    } else {
      if (!g.id.startsWith(`${g.module}:`)) fail(`Group "${g.id}" of module "${g.module}" needs the "${g.module}:" prefix`);
      if (reserved.has(g.module)) fail(`Group "${g.id}" module "${g.module}" is a reserved platform namespace`);
    }
    groupIds.add(g.id);
    groupSpace.set(g.id, g.space);
    groupOwner.set(g.id, g.module);
  }
  // Canonical paths (ADR-0093): a menu in a space lives at /{space}/{menu-slug} + its manifest's :param segments; the manifest path becomes a legacy alias.
  const slugs = new Map<string, string>();
  const menus: MenuEntry[] = menusIn.map(m => {
    const space = groupSpace.get(m.group) ?? null;
    const declaredAliases = m.aliases ?? [];
    const own = [m.path, ...declaredAliases];
    for (const path of own) if (segments(path)[0] === BOARD_PATH.slice(1)) fail(`Menu "${m.id}" path "${path}" is reserved for the analysis board (${BOARD_PATH})`);
    const params = segments(m.path).filter(isParam);
    for (const path of declaredAliases) if (segments(path).filter(isParam).length !== params.length) fail(`Menu "${m.id}" alias "${path}" must have the same parameters as its path`);
    if (space === null) {
      const clash = own.find(path => spaceByIdMap.has(segments(path)[0] as SpaceId));
      if (clash !== undefined) fail(`Menu "${m.id}" path "${clash}" starts with a space id; space-less paths may not use a space's root`);
      return m;
    }
    const slug = menuSlug(m.id);
    if (!isIdShape(slug)) fail(`Menu "${m.id}" slug "${slug}" must be non-empty without whitespace or ? # & /`);
    const slugKey = `${space}/${slug}`;
    const sameSlug = slugs.get(slugKey);
    if (sameSlug !== undefined) fail(`Menus "${sameSlug}" and "${m.id}" in space "${space}" have the same slug "${slug}"`);
    slugs.set(slugKey, m.id);
    const canonical = '/' + [space, slug, ...params].join('/');
    const aliases = [...declaredAliases, ...(m.path === canonical ? [] : [m.path])];
    return { ...m, path: canonical, ...(aliases.length > 0 ? { aliases } : {}) } as MenuEntry;
  });
  byId.clear();
  for (const m of menus) byId.set(m.id, m);
  const shapes = new Map<string, string>();
  for (const m of menus) {
    if (!groupIds.has(m.group)) fail(`Menu "${m.id}" uses undeclared group "${m.group}"`);
    if (m.module === undefined) {
      if (!isPlatformPermission(m.permission)) fail(`Menu "${m.id}" has no module and permission "${m.permission}" is not a platform permission (kernel or declared)`);
      if ((m as { moduleScreen?: unknown }).moduleScreen !== undefined) fail(`Menu "${m.id}" carries a moduleScreen but no module`);
    } else {
      if (!m.permission.startsWith(`${m.module}:`)) fail(`Menu "${m.id}" of module "${m.module}" permission "${m.permission}" needs the "${m.module}:" prefix`);
      if (isPlatformPermission(m.permission)) fail(`Menu "${m.id}" of module "${m.module}" permission "${m.permission}" is a reserved platform permission`);
      if (reserved.has(m.module)) fail(`Menu "${m.id}" module "${m.module}" is a reserved platform namespace`);
    }
    if (m.additionalPermissions !== undefined) {
      if (m.module !== undefined) fail(`Menu "${m.id}" of module "${m.module}" cannot declare additionalPermissions (one permission per module menu, ADR-0053)`);
      if (!Array.isArray(m.additionalPermissions) || m.additionalPermissions.length === 0) fail(`Menu "${m.id}" additionalPermissions must be a non-empty list`);
      const needed = new Set<string>();
      for (const extra of menuPermissions(m)) {
        if (!isPermissionShape(extra) || !isPlatformPermission(extra)) fail(`Menu "${m.id}" additional permission "${String(extra)}" is not a platform permission (kernel or declared)`);
        if (needed.has(extra)) fail(`Menu "${m.id}" permission "${extra}" is listed twice`);
        needed.add(extra);
      }
    }
    if (groupOwner.get(m.group) !== m.module) fail(`Menu "${m.id}" and its group "${m.group}" belong to different modules`);
    if (m.parent !== undefined) {
      const parent = byId.get(m.parent) ?? fail(`Menu "${m.id}" has unknown parent "${m.parent}"`);
      // Breadcrumbs and returnTarget link to the parent without params, so a parent route must not need any.
      if (segments(parent.path).some(isParam)) fail(`Menu "${m.id}" has parent "${parent.id}" whose route needs parameters`);
      // A parent whose group is undeclared is reported by the parent's own iteration; only compare known spaces.
      const parentSpace = groupSpace.get(parent.group);
      if (parentSpace !== undefined && parentSpace !== groupSpace.get(m.group)) fail(`Menu "${m.id}" parent "${parent.id}" is in another space`);
    }
    const clash = m.pageKeys.find(k => GLOBAL_KEYS.has(k));
    if (m.query) {
      if (m.query.mode !== 'apply' || m.context.time !== 'apply') fail(`Menu "${m.id}" apply mode requires time: apply`);
      const contextError = requiredContextError(m.query.required?.context ?? [], m.context);
      if (contextError) {
        const detail = contextError.replace(/^required Context ([\s\S]*) must be applied$/, 'required Context "$1" must be applied');
        fail(`Menu "${m.id}" ${detail}`);
      }
      for (const { key, label } of m.query.required?.page ?? []) {
        if (!m.pageKeys.includes(key) || !label?.ko?.trim() || !label?.en?.trim()) fail(`Menu "${m.id}" required page "${key}" needs a declared key and nonempty labels`);
      }
    }
    if (clash) fail(`Menu "${m.id}" page key "${clash}" collides with a global Context key`);
    for (const [field, keys] of [['repeatedPageKeys', m.repeatedPageKeys], ['hiddenPageKeys', m.hiddenPageKeys]] as const) {
      if (keys === undefined) continue;
      if (!Array.isArray(keys)) fail(`Menu "${m.id}" ${field} must be a list`);
      const seen = new Set<string>();
      for (const key of keys) {
        if (!m.pageKeys.includes(key)) fail(`Menu "${m.id}" ${field} key "${String(key)}" is not a declared page key`);
        if (seen.has(key)) fail(`Menu "${m.id}" ${field} key "${key}" is declared twice`);
        seen.add(key);
      }
    }
    const menuCarrySet = m.carrySet === undefined ? undefined : carrySetByIdMap.get(m.carrySet) ?? fail(`Menu "${m.id}" uses undeclared carry set "${String(m.carrySet)}"`);
    const missingCarried = (menuCarrySet?.pageKeys ?? []).find(k => !m.pageKeys.includes(k));
    if (missingCarried) fail(`Menu "${m.id}" does not declare carry set "${menuCarrySet?.id}" page key "${missingCarried}" in pageKeys`);
    // Sidebar sub-items: preset keys are the menu's own page keys, never carried or `focus`; ids unique (06 §8).
    if (m.navViews !== undefined) {
      if (m.navHidden && m.navViews.length > 0) fail(`Menu "${m.id}" is navHidden and cannot declare navViews`);
      const carriedKeys = menuCarrySet?.pageKeys ?? [];
      const viewIds = new Set<string>();
      for (const view of m.navViews) {
        if (typeof view.id !== 'string' || view.id.trim() === '') fail(`Menu "${m.id}" navView id must not be blank`);
        if (viewIds.has(view.id)) fail(`Menu "${m.id}" navView id "${view.id}" is duplicated`);
        viewIds.add(view.id);
        if (typeof view.label?.ko !== 'string' || view.label.ko.trim() === '' || typeof view.label?.en !== 'string' || view.label.en.trim() === '') fail(`Menu "${m.id}" navView "${view.id}" needs nonempty ko and en labels`);
        if (Object.keys(view.page).length === 0) fail(`Menu "${m.id}" navView "${view.id}" needs at least one preset key`);
        for (const key of Object.keys(view.page)) {
          if (key === 'focus') fail(`Menu "${m.id}" navView "${view.id}" preset key "focus" cannot be a view key`);
          if (!m.pageKeys.includes(key)) fail(`Menu "${m.id}" navView "${view.id}" preset key "${key}" is not a declared pageKeys entry`);
          if (carriedKeys.includes(key)) fail(`Menu "${m.id}" navView "${view.id}" preset key "${key}" is a carry set page key`);
        }
      }
    }
    // Condition presets narrow the menu's projection only; the page key holds the active id (06 §6.4, ADR-0083).
    if (m.conditionPresets !== undefined || m.conditionPreset !== undefined) {
      const presets = m.conditionPresets;
      const holder = m.conditionPreset;
      if (presets === undefined || holder === undefined) fail(`Menu "${m.id}" conditionPresets and conditionPreset must be declared together`);
      else {
        if (presets.length < 2) fail(`Menu "${m.id}" conditionPresets needs at least 2 presets, found ${presets.length}`);
        const presetIds = new Set<string>();
        for (const preset of presets) {
          if (typeof preset.id !== 'string' || preset.id.trim() === '') fail(`Menu "${m.id}" condition preset id must not be blank`);
          if (presetIds.has(preset.id)) fail(`Menu "${m.id}" condition preset id "${preset.id}" is duplicated`);
          presetIds.add(preset.id);
          if (typeof preset.label?.ko !== 'string' || preset.label.ko.trim() === '' || typeof preset.label?.en !== 'string' || preset.label.en.trim() === '') fail(`Menu "${m.id}" condition preset "${preset.id}" needs nonempty ko and en labels`);
          if (preset.axes.length === 0) fail(`Menu "${m.id}" condition preset "${preset.id}" needs at least one axis`);
        }
        if (!presetIds.has(holder.default)) fail(`Menu "${m.id}" conditionPreset default "${holder.default}" is not a declared preset id`);
        if (!m.pageKeys.includes(holder.key)) fail(`Menu "${m.id}" conditionPreset key "${holder.key}" is not a declared pageKeys entry`);
        if (m.context.condition !== 'apply' && m.context.condition !== 'reference') fail(`Menu "${m.id}" conditionPresets need a condition capability of apply or reference`);
      }
    }
    const foreignReset = (m.contextResetKeys ?? []).find(k => !m.pageKeys.includes(k));
    if (foreignReset) fail(`Menu "${m.id}" contextResetKey "${foreignReset}" is not a declared pageKeys entry`);
    // Drill levels are page keys and contextResetKeys, at least one, never returnTo (06 §6.4, ADR-0063).
    if (m.drill) {
      const levels = m.drill.levels;
      if (levels.length < 1) fail(`Menu "${m.id}" drill needs at least 1 level, found ${levels.length}`);
      const seen = new Set<string>();
      for (const level of levels) {
        if (seen.has(level.key)) fail(`Menu "${m.id}" drill level key "${level.key}" is duplicated`);
        seen.add(level.key);
        if (!m.pageKeys.includes(level.key)) fail(`Menu "${m.id}" drill level key "${level.key}" is not a declared pageKeys entry`);
        if (!(m.contextResetKeys ?? []).includes(level.key)) fail(`Menu "${m.id}" drill level key "${level.key}" is not a declared contextResetKeys entry`);
        if (level.key === RETURN_TO_KEY) fail(`Menu "${m.id}" drill level key "${RETURN_TO_KEY}" cannot be a drill level`);
      }
      const seenReset = new Set<string>();
      for (const key of m.drill.resetKeys ?? []) {
        if (seenReset.has(key)) fail(`Menu "${m.id}" drill resetKey "${key}" is duplicated`);
        seenReset.add(key);
        if (!m.pageKeys.includes(key)) fail(`Menu "${m.id}" drill resetKey "${key}" is not a declared pageKeys entry`);
        if (seen.has(key)) fail(`Menu "${m.id}" drill resetKey "${key}" is a drill level key`);
        if (key === RETURN_TO_KEY) fail(`Menu "${m.id}" drill resetKey "${RETURN_TO_KEY}" cannot be reset by a drill step`);
      }
    }
    // A repeated key holds a list; a drill level, a condition-preset holder and a navView preset key hold exactly one value (plan-review P1).
    for (const key of m.repeatedPageKeys ?? []) {
      const role = (m.drill?.levels ?? []).some(level => level.key === key) ? 'a drill level key'
        : m.conditionPreset?.key === key ? 'the conditionPreset key'
          : (m.navViews ?? []).some(view => Object.keys(view.page).includes(key)) ? 'a navView preset key' : null;
      if (role) fail(`Menu "${m.id}" repeatedPageKeys key "${key}" cannot also be ${role}`);
    }
    // Same shape once parameter names are erased (/a/:x vs /a/:y) is ambiguous; static-vs-param overlaps are resolved below.
    for (const path of [m.path, ...(m.aliases ?? [])]) {
      const shape = '/' + segments(path).map(s => (isParam(s) ? ':' : s)).join('/');
      const other = shapes.get(shape);
      if (other === m.id) fail(`Menu "${m.id}" declares the route shape ${shape} more than once`);
      if (other) fail(`Menus "${other}" and "${m.id}" declare the same route shape ${shape}`);
      shapes.set(shape, m.id);
    }
  }
  // Members of one carry set must agree on whether a carried key is a list, or a two-item source would land on a one-value destination.
  for (const set of carrySets) {
    for (const key of set.pageKeys) {
      const members = menus.filter(m => m.carrySet === set.id);
      const lists = members.filter(m => m.repeatedPageKeys?.includes(key));
      if (lists.length > 0 && lists.length < members.length) fail(`Carry set "${set.id}" key "${key}" is a repeated page key of menu "${lists[0].id}" but not of menu "${members.find(m => !m.repeatedPageKeys?.includes(key))!.id}"`);
    }
  }
  const homeMenus = menus.filter(m => groupSpace.get(m.group) === null && [m.path, ...(m.aliases ?? [])].some(path => segments(path).length === 0));
  let platformHome: MenuEntry | null = null;
  if (platformHomeMenuId !== undefined) {
    platformHome = byId.get(platformHomeMenuId) ?? fail(`platformHomeMenuId "${platformHomeMenuId}" is unknown`);
    if (groupSpace.get(platformHome.group) !== null) fail(`platformHomeMenuId "${platformHomeMenuId}" must be a menu outside every space`);
    if (segments(platformHome.path).some(isParam)) fail(`platformHomeMenuId "${platformHomeMenuId}" route must not need parameters`);
  } else if (homeMenus.length > 0) fail(`Menu "${homeMenus[0].id}" declares the platform home path "/": pass platformHomeMenuId`);
  for (const g of groups) {
    const primaries = menus.filter(m => m.group === g.id && m.primary).length;
    if (primaries !== 1) fail(`Group "${g.id}" needs exactly one primary menu, found ${primaries}`);
  }
  for (const s of spaces) {
    if (typeof s.description?.ko !== 'string' || s.description.ko.trim() === '' || typeof s.description?.en !== 'string' || s.description.en.trim() === '') fail(`Space "${s.id}" description must not be empty`);
    if (s.subtitle !== undefined && (typeof s.subtitle.ko !== 'string' || s.subtitle.ko.trim() === '' || typeof s.subtitle.en !== 'string' || s.subtitle.en.trim() === '')) fail(`Space "${s.id}" subtitle must not be empty`);
    if (s.scopePresentation !== undefined && s.scopePresentation !== 'default' && s.scopePresentation !== 'hidden') fail(`Space "${s.id}" scopePresentation must be "default" or "hidden"`);
    if (s.scopePresentation === 'hidden') {
      const scoped = menus.find(m => m.requiresScope && groupSpace.get(m.group) === s.id);
      if (scoped !== undefined) fail(`Space "${s.id}" hides Scope but menu "${scoped.id}" requires Scope`);
    }
    const home = byId.get(s.homeMenuId) ?? fail(`Space "${s.id}" homeMenuId "${s.homeMenuId}" is unknown`);
    if (groupSpace.get(home.group) !== s.id) fail(`Space "${s.id}" homeMenuId "${s.homeMenuId}" is not in that space`);
    // Space entry lands on the home menu without params, so its route must not need any.
    if (segments(home.path).some(isParam)) fail(`Space "${s.id}" homeMenuId "${s.homeMenuId}" home route must not need parameters`);
    // The landing menu must not re-block a user who passed the space gate.
    if (s.permission !== undefined && home.permission !== s.permission) fail(`Space "${s.id}" home permission must be "${s.permission}"`);
  }

  const groupById = (id: AnyGroupId) => groups.find(g => g.id === id) ?? fail(`Unknown group ${id}`);
  const spaceById = (id: SpaceId) => spaceByIdMap.get(id) ?? fail(`Unknown space ${id}`);
  const spaceOf = (menu: MenuEntry): SpaceDef | null => {
    const space = groupById(menu.group).space;
    return space === null ? null : spaceById(space);
  };
  const carrySetOf = (menu: MenuEntry): CarrySetDef | null => (menu.carrySet === undefined ? null : carrySetByIdMap.get(menu.carrySet) ?? null);
  const menuById = (id: string) => byId.get(id) ?? fail(`Unknown menu ${id}`);

  // Static segments win over parameters, compared left to right, whatever the declaration order.
  const compiled = menus.flatMap(menu => [{ menu, pattern: segments(menu.path), canonical: segments(menu.path), viaAlias: false }, ...(menu.aliases ?? []).map(alias => ({ menu, pattern: segments(alias), canonical: segments(menu.path), viaAlias: true }))]);
  const specificity = (pattern: string[]) => pattern.map(s => (isParam(s) ? '0' : '1')).join('');
  compiled.sort((a, b) => (specificity(a.pattern) < specificity(b.pattern) ? 1 : specificity(a.pattern) > specificity(b.pattern) ? -1 : 0));
  // A pattern that wins over another menu's canonical pattern captures URLs that menu's pathFor builds (a param value equal to the static
  // segment): the redirect or the direct open would land on the wrong menu and permission. Static-over-param stays for legacy aliases only.
  const overlaps = (a: string[], b: string[]) => a.length === b.length && a.every((segment, i) => isParam(segment) || isParam(b[i]) || segment === b[i]);
  compiled.forEach((winner, i) => {
    for (const loser of compiled.slice(i + 1)) {
      if (loser.viaAlias || loser.menu.id === winner.menu.id || !overlaps(winner.pattern, loser.pattern)) continue;
      fail(`Menu "${winner.menu.id}" ${winner.viaAlias ? 'alias' : 'path'} "/${winner.pattern.join('/')}" captures canonical paths of menu "${loser.menu.id}" ("/${loser.pattern.join('/')}")`);
    }
  });

  const matchRoute = (pathname: string): RouteMatch | null => {
    const parts = segments(pathname.replace(/\/+$/, ''));
    for (const { menu, pattern, canonical, viaAlias } of compiled) {
      if (pattern.length !== parts.length) continue;
      const params: Record<string, string> = {};
      let ok = true;
      let paramIndex = 0;
      for (let i = 0; i < pattern.length; i++) {
        if (isParam(pattern[i])) {
          try { params[canonical.filter(isParam)[paramIndex++].slice(1)] = decodeURIComponent(parts[i]); } catch { ok = false; break; }
        } else if (pattern[i] !== parts[i]) { ok = false; break; }
      }
      if (ok) return { menu, params, viaAlias };
    }
    return null;
  };

  const canonicalHref = (href: string): string => {
    const q = href.indexOf('?');
    const route = matchRoute(q === -1 ? href : href.slice(0, q));
    return route?.viaAlias ? pathFor(route.menu, route.params) + (q === -1 ? '' : href.slice(q)) : href;
  };

  const safeReturnTo = (value: string | null): string | null => {
    if (value === null || !isAppRelativePath(value)) return null;
    const q = value.indexOf('?');
    const path = q === -1 ? value : value.slice(0, q);
    const search = q === -1 ? '' : value.slice(q);
    const route = matchRoute(path);
    if (!route || route.menu.navHidden) return null;
    try { parseQuery(search, route.menu.pageKeys, { repeated: route.menu.repeatedPageKeys }); } catch { return null; }
    return value;
  };

  return { groups, menus, spaces, carrySets, permissions, groupById, spaceById, spaceOf, carrySetOf, menuById, platformHome, matchRoute, canonicalHref, safeReturnTo };
}

/** Parameter names declared by route segments, in route order. */
export function routeParamNames(path: string): string[] {
  return segments(path).filter(isParam).map(segment => segment.slice(1));
}

export function pathFor(menu: MenuEntry, params: Record<string, string> = {}): string {
  return '/' + segments(menu.path).map(seg => (isParam(seg) ? encodeURIComponent(params[seg.slice(1)] ?? missing(seg)) : seg)).join('/');
}
function missing(seg: string): never { throw new Error(`Missing route param ${seg}`); }

export const CONTEXT_LABELS: Record<ContextKey, Text> = {
  time: { ko: '기간', en: 'Period' },
  roomNames: { ko: 'room_name', en: 'room_name' },
  line: { ko: 'Line', en: 'Line' },
  prcGroup: { ko: 'PRC 그룹', en: 'PRC group' },
  condition: { ko: '설비 그룹 조건', en: 'Group condition' },
  selection: { ko: '설비 선택', en: 'Equipment selection' },
  lot: { ko: 'Lot', en: 'Lot' },
  ppid: { ko: 'PPID', en: 'PPID' },
  recipe: { ko: 'Recipe', en: 'Recipe' },
  metric: { ko: '지표·버전', en: 'Metric & version' },
};

export const PAGE_TYPE_LABELS: Record<PageType, Text> = {
  overview: { ko: 'Overview', en: 'Overview' },
  analysis: { ko: 'Analysis Workspace', en: 'Analysis Workspace' },
  management: { ko: 'Management', en: 'Management' },
  catalog: { ko: 'Catalog', en: 'Catalog' },
  workflow: { ko: 'Workflow', en: 'Workflow' },
};
