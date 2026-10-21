import type { ComponentType, LazyExoticComponent } from 'react';
import type { LucideIcon } from 'lucide-react';
import { GLOBAL_KEYS, GROUP_IDS, PERMISSIONS, isAppRelativePath, parseQuery, type ContextKey, type GroupId, type HostFeature, type MenuMeta, type ModuleScopedId, type ModuleScreenProps, type PageType, type SpaceDef, type SpaceId, type Text } from '@ap/contracts';

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

/** Group ids a menu can name: the closed platform list or a module-prefixed id. */
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

export type RouteMatch = { menu: MenuEntry; params: Record<string, string> };

export type Registry = {
  groups: readonly GroupDef[];
  menus: readonly MenuEntry[];
  spaces: readonly SpaceDef[];
  groupById: (id: AnyGroupId) => GroupDef;
  spaceById: (id: SpaceId) => SpaceDef;
  /** Space of the menu's group — membership lives on the group, never on the menu. Null when the group is a global utility (06 §9.1). */
  spaceOf: (menu: MenuEntry) => SpaceDef | null;
  menuById: (id: string) => MenuEntry;
  matchRoute: (pathname: string) => RouteMatch | null;
  /**
   * Registry-dependent half of the URL contract (kept out of @ap/contracts — it needs the Registry; platform-packages.md §3).
   * Entry URL for “back”, or null. Registered non-detail menu, query parses for that menu.
   * Returns the original string so the entry URL is not rewritten.
   */
  safeReturnTo: (value: string | null) => string | null;
};

export class RegistryError extends Error {}

const PLATFORM_PERMISSIONS: readonly string[] = PERMISSIONS;
const PLATFORM_GROUPS: readonly string[] = GROUP_IDS;
/** Namespaces of the platform's own permissions; a module id may not take one, so a module grant never equals a platform grant. */
const RESERVED_MODULE_IDS = new Set<string>(PERMISSIONS.map(p => p.split(':')[0]));
export const isPlatformPermission = (value: string) => PLATFORM_PERMISSIONS.includes(value);
export const isReservedModuleId = (id: string) => RESERVED_MODULE_IDS.has(id);

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
export function createRegistry({ spaces, groups, menus }: { spaces: readonly SpaceDef[]; groups: readonly GroupDef[]; menus: readonly MenuEntry[] }): Registry {
  const fail = (message: string): never => { throw new RegistryError(message); };
  const spaceByIdMap = new Map<SpaceId, SpaceDef>();
  for (const s of spaces) {
    if (spaceByIdMap.has(s.id)) fail(`Duplicate space id "${s.id}"`);
    spaceByIdMap.set(s.id, s);
  }
  const byId = new Map<string, MenuEntry>();
  for (const m of menus) {
    if (byId.has(m.id)) fail(`Duplicate menu id "${m.id}"`);
    byId.set(m.id, m);
  }
  const groupIds = new Set<string>();
  const groupSpace = new Map<AnyGroupId, SpaceId | null>();
  const groupOwner = new Map<AnyGroupId, string | undefined>();
  for (const g of groups) {
    if (groupIds.has(g.id)) fail(`Duplicate group id "${g.id}"`);
    if (g.space !== null && !spaceByIdMap.has(g.space)) fail(`Group "${g.id}" uses undeclared space "${g.space}"`);
    if (g.module === undefined) {
      if (!PLATFORM_GROUPS.includes(g.id)) fail(`Group "${g.id}" has no module and is not a platform group`);
    } else {
      if (!g.id.startsWith(`${g.module}:`)) fail(`Group "${g.id}" of module "${g.module}" needs the "${g.module}:" prefix`);
      if (isReservedModuleId(g.module)) fail(`Group "${g.id}" module "${g.module}" is a reserved platform namespace`);
    }
    groupIds.add(g.id);
    groupSpace.set(g.id, g.space);
    groupOwner.set(g.id, g.module);
  }
  const shapes = new Map<string, string>();
  for (const m of menus) {
    if (segments(m.path)[0] === BOARD_PATH.slice(1)) fail(`Menu "${m.id}" path "${m.path}" is reserved for the analysis board (${BOARD_PATH})`);
    if (!groupIds.has(m.group)) fail(`Menu "${m.id}" uses undeclared group "${m.group}"`);
    if (m.module === undefined) {
      if (!isPlatformPermission(m.permission)) fail(`Menu "${m.id}" has no module and permission "${m.permission}" is not a platform permission`);
      if ((m as { moduleScreen?: unknown }).moduleScreen !== undefined) fail(`Menu "${m.id}" carries a moduleScreen but no module`);
    } else {
      if (!m.permission.startsWith(`${m.module}:`)) fail(`Menu "${m.id}" of module "${m.module}" permission "${m.permission}" needs the "${m.module}:" prefix`);
      if (isPlatformPermission(m.permission)) fail(`Menu "${m.id}" of module "${m.module}" permission "${m.permission}" is a reserved platform permission`);
      if (isReservedModuleId(m.module)) fail(`Menu "${m.id}" module "${m.module}" is a reserved platform namespace`);
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
      for (const key of m.query.required?.context ?? []) {
        if (!Object.hasOwn(CONTEXT_LABELS, key) || m.context[key] !== 'apply') fail(`Menu "${m.id}" required Context "${key}" must be applied`);
      }
      for (const { key, label } of m.query.required?.page ?? []) {
        if (!m.pageKeys.includes(key) || !label?.ko?.trim() || !label?.en?.trim()) fail(`Menu "${m.id}" required page "${key}" needs a declared key and nonempty labels`);
      }
    }
    if (clash) fail(`Menu "${m.id}" page key "${clash}" collides with a global Context key`);
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
        if (level.key === 'returnTo') fail(`Menu "${m.id}" drill level key "returnTo" cannot be a drill level`);
      }
    }
    // Same shape once parameter names are erased (/a/:x vs /a/:y) is ambiguous; static-vs-param overlaps are resolved below.
    const shape = '/' + segments(m.path).map(s => (isParam(s) ? ':' : s)).join('/');
    const other = shapes.get(shape);
    if (other) fail(`Menus "${other}" and "${m.id}" declare the same route shape ${shape}`);
    shapes.set(shape, m.id);
  }
  for (const g of groups) {
    const primaries = menus.filter(m => m.group === g.id && m.primary).length;
    if (primaries !== 1) fail(`Group "${g.id}" needs exactly one primary menu, found ${primaries}`);
  }
  for (const s of spaces) {
    if (typeof s.description?.ko !== 'string' || s.description.ko.trim() === '' || typeof s.description?.en !== 'string' || s.description.en.trim() === '') fail(`Space "${s.id}" description must not be empty`);
    if (s.subtitle !== undefined && (typeof s.subtitle.ko !== 'string' || s.subtitle.ko.trim() === '' || typeof s.subtitle.en !== 'string' || s.subtitle.en.trim() === '')) fail(`Space "${s.id}" subtitle must not be empty`);
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
  const menuById = (id: string) => byId.get(id) ?? fail(`Unknown menu ${id}`);

  // Static segments win over parameters, compared left to right, whatever the declaration order.
  const compiled = menus.map(menu => ({ menu, pattern: segments(menu.path) }));
  const specificity = (pattern: string[]) => pattern.map(s => (isParam(s) ? '0' : '1')).join('');
  compiled.sort((a, b) => (specificity(a.pattern) < specificity(b.pattern) ? 1 : specificity(a.pattern) > specificity(b.pattern) ? -1 : 0));

  const matchRoute = (pathname: string): RouteMatch | null => {
    const parts = segments(pathname.replace(/\/+$/, ''));
    for (const { menu, pattern } of compiled) {
      if (pattern.length !== parts.length) continue;
      const params: Record<string, string> = {};
      let ok = true;
      for (let i = 0; i < pattern.length; i++) {
        if (isParam(pattern[i])) {
          try { params[pattern[i].slice(1)] = decodeURIComponent(parts[i]); } catch { ok = false; break; }
        } else if (pattern[i] !== parts[i]) { ok = false; break; }
      }
      if (ok) return { menu, params };
    }
    return null;
  };

  const safeReturnTo = (value: string | null): string | null => {
    if (value === null || !isAppRelativePath(value)) return null;
    const q = value.indexOf('?');
    const path = q === -1 ? value : value.slice(0, q);
    const search = q === -1 ? '' : value.slice(q);
    const route = matchRoute(path);
    if (!route || route.menu.navHidden) return null;
    try { parseQuery(search, route.menu.pageKeys); } catch { return null; }
    return value;
  };

  return { groups, menus, spaces, groupById, spaceById, spaceOf, menuById, matchRoute, safeReturnTo };
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
  condition: { ko: '그룹 조건', en: 'Group condition' },
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
