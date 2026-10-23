import type { ComponentType } from 'react';
import type { LucideIcon } from 'lucide-react';
import { HOST_CONTRACTS, type HostFeature, type ModuleManifest, type ModuleScreenProps, type SpaceId } from '@ap/contracts';
import { isDotSegment } from './location';
import { isKernelNamespace, RegistryError, type ModuleGroupDef, type ModuleMenuEntry } from './registry';

export type MountOptions = {
  /** Absolute app path the module lives under, e.g. `/collab`. No params, no trailing slash. */
  prefix: string;
  /** Space of each module group, or null for a global utility. Every manifest group needs an entry. */
  groupSpace: Readonly<Record<string, SpaceId | null>>;
  /** Values for the manifest's `config` keys. */
  config: Readonly<Record<string, string>>;
  icons: { groups: Readonly<Record<string, LucideIcon>>; screens: Readonly<Record<string, LucideIcon>> };
  /** Host features this host provides. */
  features?: readonly HostFeature[];
};

/** A pathname pattern the browser keeps as written: no URL delimiters, backslash, control characters or any (Unicode) whitespace, no `//`, no raw or encoded dot segments. `:param` segments stay allowed. */
function isPathPattern(path: string): boolean {
  return !/[?#\\\u0000-\u0020\u007F]|\s/u.test(path) && !path.includes('//') && !path.split('/').some(isDotSegment);
}

/**
 * Registers a module (ADR-0053): checks the manifest against what this host offers and returns the entries for
 * `createRegistry`. Any violation throws RegistryError (fail closed). Entries carry `moduleScreen` (rendered with
 * `{ params, host }` by the shell) and no `component`, plus the declared features and config the host port needs.
 */
export function mountModule(
  manifest: ModuleManifest,
  screens: Readonly<Record<string, ComponentType<ModuleScreenProps>>>,
  { prefix, groupSpace, config, icons, features = ['query', 'detailSlot', 'write'] }: MountOptions,
): { menus: ModuleMenuEntry[]; groups: ModuleGroupDef[] } {
  const fail = (message: string): never => { throw new RegistryError(message); };
  const { id } = manifest.module;
  const at = `Module "${id}"`;
  if (!(HOST_CONTRACTS as readonly number[]).includes(manifest.module.contract)) fail(`${at} declares unsupported contract ${String(manifest.module.contract)}`);
  for (const feature of manifest.requires) if (!features.includes(feature)) fail(`${at} requires host feature "${feature}" which this host does not provide`);
  for (const key of manifest.config ?? []) if (!Object.hasOwn(config, key)) fail(`${at} needs config key "${key}"`);
  if (isKernelNamespace(id)) fail(`${at} id is a reserved platform namespace`);
  if (!isPathPattern(prefix) || !prefix.startsWith('/') || prefix.endsWith('/') || prefix.split('/').some(s => s.startsWith(':'))) {
    fail(`${at} prefix "${prefix}" must be an absolute app path without params or a trailing slash`);
  }

  const owns = (value: string) => value.startsWith(`${id}:`);
  const groupIds = new Set<string>();
  for (const g of manifest.groups) {
    if (!owns(g.id)) fail(`${at} group "${g.id}" needs the "${id}:" prefix`);
    groupIds.add(g.id);
  }
  const screenIds = new Set<string>();
  for (const s of manifest.screens) {
    if (screenIds.has(s.id)) fail(`${at} declares screen "${s.id}" twice`);
    screenIds.add(s.id);
  }
  for (const s of manifest.screens) {
    if (!owns(s.permission)) fail(`${at} screen "${s.id}" permission "${s.permission}" needs the "${id}:" prefix`);
    if (!groupIds.has(s.group)) fail(`${at} screen "${s.id}" uses group "${s.group}" which the manifest does not declare`);
    if (s.path.startsWith('/') || !isPathPattern(s.path)) fail(`${at} screen "${s.id}" path "${s.path}" must be relative and stay inside the module`);
    if (s.parent !== undefined && !screenIds.has(s.parent)) fail(`${at} screen "${s.id}" has parent "${s.parent}" outside the module`);
    if (!Object.hasOwn(screens, s.id)) fail(`${at} screen "${s.id}" has no component`);
  }
  for (const key of Object.keys(screens)) if (!screenIds.has(key)) fail(`${at} has a component for "${key}" which no screen declares`);

  const groups = manifest.groups.map((g): ModuleGroupDef => {
    if (!Object.hasOwn(groupSpace, g.id)) fail(`${at} group "${g.id}" has no groupSpace entry`);
    return { id: g.id, module: id, label: g.label, icon: icons.groups[g.id] ?? fail(`${at} group "${g.id}" has no icon`), space: groupSpace[g.id] };
  });
  const moduleFeatures = [...new Set([...manifest.requires, ...(manifest.optional ?? [])])].filter(feature => features.includes(feature));
  const moduleConfig = Object.fromEntries((manifest.config ?? []).map(key => [key, config[key]]));
  const menus = manifest.screens.map((s): ModuleMenuEntry => ({
    ...s,
    id: `${id}:${s.id}`,
    parent: s.parent === undefined ? undefined : `${id}:${s.parent}`,
    path: s.path === '' ? prefix : `${prefix}/${s.path}`,
    module: id,
    icon: icons.screens[s.id] ?? fail(`${at} screen "${s.id}" has no icon`),
    moduleScreen: screens[s.id],
    moduleFeatures,
    moduleConfig,
  }));
  return { menus, groups };
}
