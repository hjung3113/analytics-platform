import type { ComponentType, LazyExoticComponent } from 'react';
import type { LucideIcon } from 'lucide-react';
import { GLOBAL_KEYS, isAppRelativePath, parseQuery, type ContextKey, type GroupId, type MenuMeta, type PageType, type Text } from '@ap/contracts';

/** docs/06 §5: menus declare, the shell consumes. Metadata lives in @ap/contracts; this adds the React bindings. */
export type PageProps = { params: Record<string, string> };

export type MenuEntry = MenuMeta & {
  icon: LucideIcon;
  component?: LazyExoticComponent<ComponentType<PageProps>>;
};

export type GroupDef = { id: GroupId; label: Text; icon: LucideIcon };

export type RouteMatch = { menu: MenuEntry; params: Record<string, string> };

export type Registry = {
  groups: readonly GroupDef[];
  menus: readonly MenuEntry[];
  groupById: (id: GroupId) => GroupDef;
  menuById: (id: string) => MenuEntry;
  matchRoute: (pathname: string) => RouteMatch | null;
  /**
   * Registry-dependent half of the URL contract (kept out of @ap/contracts, platform-packages.md D9).
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
export function createRegistry({ groups, menus }: { groups: readonly GroupDef[]; menus: readonly MenuEntry[] }): Registry {
  const fail = (message: string): never => { throw new RegistryError(message); };
  const byId = new Map<string, MenuEntry>();
  for (const m of menus) {
    if (byId.has(m.id)) fail(`Duplicate menu id "${m.id}"`);
    byId.set(m.id, m);
  }
  const groupIds = new Set<string>();
  for (const g of groups) {
    if (groupIds.has(g.id)) fail(`Duplicate group id "${g.id}"`);
    groupIds.add(g.id);
  }
  const shapes = new Map<string, string>();
  for (const m of menus) {
    if (!groupIds.has(m.group)) fail(`Menu "${m.id}" uses undeclared group "${m.group}"`);
    if (m.parent !== undefined) {
      const parent = byId.get(m.parent) ?? fail(`Menu "${m.id}" has unknown parent "${m.parent}"`);
      // Breadcrumbs and returnTarget link to the parent without params, so a parent route must not need any.
      if (segments(parent.path).some(isParam)) fail(`Menu "${m.id}" has parent "${parent.id}" whose route needs parameters`);
    }
    const clash = m.pageKeys.find(k => GLOBAL_KEYS.has(k));
    if (clash) fail(`Menu "${m.id}" page key "${clash}" collides with a global Context key`);
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

  const groupById = (id: GroupId) => groups.find(g => g.id === id) ?? fail(`Unknown group ${id}`);
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

  return { groups, menus, groupById, menuById, matchRoute, safeReturnTo };
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
