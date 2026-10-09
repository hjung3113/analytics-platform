// THROWAWAY #250 — never merge.
import type { ComponentType, LazyExoticComponent } from 'react';
import type { LucideIcon } from 'lucide-react';
import { GLOBAL_KEYS, isAppRelativePath, parseQuery, type ContextKey, type GroupId, type MenuMeta, type PageType, type SpaceDef, type SpaceId, type Text } from '@ap/contracts';

/** docs/06 §5: menus declare, the shell consumes. Metadata lives in @ap/contracts; this adds the React bindings. */
export type PageProps = { params: Record<string, string> };

export type MenuEntry = MenuMeta & {
  icon: LucideIcon;
  component?: LazyExoticComponent<ComponentType<PageProps>>;
};

export type GroupDef = {
  id: GroupId;
  label: Text;
  icon: LucideIcon;
  space: SpaceId;
  /** In the expanded sidebar, omit the section label when only one visible menu remains. */
  hideLabelWhenSingle?: boolean;
  /** THROWAWAY #250. `hidden` keeps the group out of the sidebar. Absent means a normal group. */
  protoPlacement?: 'hidden';
};

export type RouteMatch = { menu: MenuEntry; params: Record<string, string> };

export type Registry = {
  groups: readonly GroupDef[];
  menus: readonly MenuEntry[];
  spaces: readonly SpaceDef[];
  groupById: (id: GroupId) => GroupDef;
  spaceById: (id: SpaceId) => SpaceDef;
  /** Space of the menu's group — membership lives on the group, never on the menu (06 §9.1). */
  spaceOf: (menu: MenuEntry) => SpaceDef;
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

const segments = (path: string) => path.split('/').filter(Boolean);
const isParam = (seg: string) => seg.startsWith(':');

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
  const groupSpace = new Map<GroupId, SpaceId>();
  for (const g of groups) {
    if (groupIds.has(g.id)) fail(`Duplicate group id "${g.id}"`);
    if (!spaceByIdMap.has(g.space)) fail(`Group "${g.id}" uses undeclared space "${g.space}"`);
    groupIds.add(g.id);
    groupSpace.set(g.id, g.space);
  }
  const shapes = new Map<string, string>();
  for (const m of menus) {
    if (!groupIds.has(m.group)) fail(`Menu "${m.id}" uses undeclared group "${m.group}"`);
    if (m.parent !== undefined) {
      const parent = byId.get(m.parent) ?? fail(`Menu "${m.id}" has unknown parent "${m.parent}"`);
      // Breadcrumbs and returnTarget link to the parent without params, so a parent route must not need any.
      if (segments(parent.path).some(isParam)) fail(`Menu "${m.id}" has parent "${parent.id}" whose route needs parameters`);
      // A parent whose group is undeclared is reported by the parent's own iteration; only compare known spaces.
      const parentSpace = groupSpace.get(parent.group);
      if (parentSpace !== undefined && parentSpace !== groupSpace.get(m.group)) fail(`Menu "${m.id}" parent "${parent.id}" is in another space`);
    }
    const clash = m.pageKeys.find(k => GLOBAL_KEYS.has(k));
    if (clash) fail(`Menu "${m.id}" page key "${clash}" collides with a global Context key`);
    const foreignReset = (m.contextResetKeys ?? []).find(k => !m.pageKeys.includes(k));
    if (foreignReset) fail(`Menu "${m.id}" contextResetKey "${foreignReset}" is not a declared pageKeys entry`);
    // Drill levels are page keys and contextResetKeys, 1–4, never returnTo (06 §6.4, ADR-0025).
    if (m.drill) {
      const levels = m.drill.levels;
      if (levels.length < 1 || levels.length > 4) fail(`Menu "${m.id}" drill needs 1 to 4 levels, found ${levels.length}`);
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
    const home = byId.get(s.homeMenuId) ?? fail(`Space "${s.id}" homeMenuId "${s.homeMenuId}" is unknown`);
    if (groupSpace.get(home.group) !== s.id) fail(`Space "${s.id}" homeMenuId "${s.homeMenuId}" is not in that space`);
    // Space entry lands on the home menu without params, so its route must not need any.
    if (segments(home.path).some(isParam)) fail(`Space "${s.id}" homeMenuId "${s.homeMenuId}" home route must not need parameters`);
    // The landing menu must not re-block a user who passed the space gate.
    if (s.permission !== undefined && home.permission !== s.permission) fail(`Space "${s.id}" home permission must be "${s.permission}"`);
  }

  const groupById = (id: GroupId) => groups.find(g => g.id === id) ?? fail(`Unknown group ${id}`);
  const spaceById = (id: SpaceId) => spaceByIdMap.get(id) ?? fail(`Unknown space ${id}`);
  const spaceOf = (menu: MenuEntry) => spaceById(groupById(menu.group).space);
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

export function pathFor(menu: MenuEntry, params: Record<string, string> = {}): string {
  return '/' + segments(menu.path).map(seg => (isParam(seg) ? encodeURIComponent(params[seg.slice(1)] ?? missing(seg)) : seg)).join('/');
}
function missing(seg: string): never { throw new Error(`Missing route param ${seg}`); }

export const CONTEXT_LABELS: Record<ContextKey, Text> = {
  time: { ko: '기간', en: 'Period' },
  roomNames: { ko: 'room_name', en: 'room_name' },
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
