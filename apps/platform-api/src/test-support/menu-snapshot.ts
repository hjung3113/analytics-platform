// Synthetic menu declaration snapshots for tests that boot a declaration bundle (#1900, ADR-0156). A real snapshot is
// written by the app assembly build; tests derive one that matches their bundle, so the bundle-focused assertions stay
// as they were. Synthetic identifiers only.

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import { menuSnapshotDigest, type MenuDeclarationSnapshot } from '../modules/menu-dispatch/menu-snapshot.js';

type Row = Record<string, unknown>;
const rows = (value: unknown): Row[] => (Array.isArray(value) ? value.filter((row): row is Row => row !== null && typeof row === 'object') : []);
const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []);
const text = (value: unknown, fallback: string) => (typeof value === 'string' && value.length > 0 ? value : fallback);
const firstById = <T extends { id: string }>(list: T[]) => list.filter((row, index) => list.findIndex((other) => other.id === row.id) === index);

/** A valid snapshot (digest computed) from the given parts. */
export function menuSnapshot(parts: Omit<MenuDeclarationSnapshot, 'schemaVersion' | 'sdkVersion' | 'digest'> & { sdkVersion?: string }): MenuDeclarationSnapshot {
  const body = { schemaVersion: 1 as const, sdkVersion: parts.sdkVersion ?? '0.0.0-test', menus: parts.menus, permissions: parts.permissions, endpoints: parts.endpoints, actions: parts.actions };
  return { ...body, digest: menuSnapshotDigest(body) };
}

/**
 * The menu declarations a bundle was copied from, derived from the bundle itself: every endpoint and action row as
 * declared, one menu per `menuId` (its first row's permission, Scope required when every row requires it, the Context
 * keys its endpoints apply), the bundle's permission names as the vocabulary. Malformed rows are skipped, so a test
 * about a bad bundle still gets the bundle's own refusal.
 */
export function menuSnapshotFor(bundle: unknown): MenuDeclarationSnapshot {
  const source = bundle !== null && typeof bundle === 'object' ? (bundle as Row) : {};
  const endpoints = firstById(rows(source.endpoints).filter((row) => typeof row.id === 'string' && typeof row.menuId === 'string').map((row) => ({
    id: row.id as string,
    menuId: row.menuId as string,
    paramKeys: strings(row.paramKeys),
    permission: text(row.permission, 'platform:view'),
    requiresScope: row.requiresScope === true,
    context: (row.context !== null && typeof row.context === 'object' ? row.context : {}) as Record<string, 'apply' | 'reference'>,
    ...(Array.isArray(row.requiredContext) ? { requiredContext: strings(row.requiredContext) as MenuDeclarationSnapshot['endpoints'][number]['requiredContext'] } : {}),
    kinds: strings(row.kinds) as MenuDeclarationSnapshot['endpoints'][number]['kinds'],
    mergeTimeDomain: row.mergeTimeDomain === true,
  })));
  const actions = firstById(rows(source.actions).filter((row) => typeof row.id === 'string' && typeof row.menuId === 'string').map((row) => ({
    id: row.id as string,
    menuId: row.menuId as string,
    inputKeys: strings(row.inputKeys),
    permission: text(row.permission, 'platform:view'),
    requiresScope: row.requiresScope === true,
    concurrency: row.concurrency === 'version' ? ('version' as const) : ('none' as const),
    invalidates: strings(row.invalidates),
  })));
  const menuIds = [...new Set([...endpoints, ...actions].map((row) => row.menuId))];
  const menus = menuIds.map((id) => {
    const owned = [...endpoints, ...actions].filter((row) => row.menuId === id);
    const context: Record<string, 'apply' | 'reference'> = {};
    for (const row of endpoints.filter((endpoint) => endpoint.menuId === id)) {
      for (const [key, capability] of Object.entries(row.context)) if (capability === 'apply' || context[key] === undefined) context[key] = capability;
    }
    return { id, permission: owned[0]?.permission ?? 'platform:view', requiresScope: owned.every((row) => row.requiresScope), context };
  });
  const permissions = [...new Set(rows(source.permissions).map((row) => row.permission).filter((name): name is string => typeof name === 'string' && name.length > 0))];
  return menuSnapshot({ menus, permissions, endpoints, actions });
}

/**
 * Config helper for file-booting tests: when `MENU_DECLARATIONS_FILE` is set and no snapshot file is, writes the
 * matching snapshot to a fresh temp folder (never beside the bundle: a published example lives in the repository) and
 * sets `MENU_DECLARATIONS_SNAPSHOT_FILE`.
 * A bundle file that is missing or not JSON gets an empty snapshot: the bundle refusal is reported first anyway.
 */
export function withMenuSnapshotFile<C extends { MENU_DECLARATIONS_FILE?: string | undefined; MENU_DECLARATIONS_SNAPSHOT_FILE?: string | undefined }>(config: C): C {
  const file = config.MENU_DECLARATIONS_FILE;
  if (file === undefined || config.MENU_DECLARATIONS_SNAPSHOT_FILE !== undefined) return config;
  let bundle: unknown = {};
  try { bundle = JSON.parse(readFileSync(file, 'utf8')); } catch { /* the bundle loader reports it */ }
  const snapshotFile = join(mkdtempSync(join(tmpdir(), 'menu-snapshot-')), `${basename(file)}.snapshot.json`);
  writeFileSync(snapshotFile, JSON.stringify(menuSnapshotFor(bundle)));
  return { ...config, MENU_DECLARATIONS_SNAPSHOT_FILE: snapshotFile };
}
