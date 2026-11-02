import { describe, expect, it } from 'vitest';

import {
  CATALOG_MANAGE_PERMISSION,
  LOG_KNOWLEDGE_MENU_ID,
  LOG_KNOWLEDGE_MODELS_MENU_ID,
  MODEL_SORT_IDS as MENU_MODEL_SORT_IDS,
  PROCESS_SORT_IDS as MENU_PROCESS_SORT_IDS,
  SOFTWARE_SORT_IDS as MENU_SOFTWARE_SORT_IDS,
  VENDOR_SORT_IDS as MENU_VENDOR_SORT_IDS,
  catalogActionSpecs,
  catalogEndpointSpecs,
  modelEndpointSpecs,
  modelFilterSpecs,
  processFilterSpecs,
  softwareFilterSpecs,
  vendorFilterSpecs,
} from '../../../../../../menus/log-dev/log-knowledge/src/endpoints.js';
import { LOG_KNOWLEDGE_MODELS_MENU_ID as SERVER_MODELS_MENU_ID } from '../catalog-menu.js';
import { CATALOG_MENU_PERMISSION } from '../catalog-actions.js';
import { logKnowledgeContribution } from '../catalog-endpoints.js';
import { CATALOG_FILTER_SPECS } from '../domain/catalog-filters.js';
import { MODEL_SORT_IDS, PROCESS_SORT_IDS, SOFTWARE_SORT_IDS, VENDOR_SORT_IDS } from '../repositories/catalog-read.js';

// The server declares the catalog reads and writes (it may not import the menu package at runtime) and the menu
// declares the same ids, keys and filter fields for the client and the mock. This test imports the menu's client-safe
// `src/endpoints.ts` and fails when the two sides differ (#1194 r).
const server = logKnowledgeContribution({ db: {} as never, checkService: {} as never });
// The item reads (ADR-0109) sit on their own menu ids; the model reads (menu `log-knowledge-models`, #1197 s1) are
// compared below, the item reads are mirrored by the items menu (s2).
const serverEndpoints = (server.endpoints ?? []).filter((e) => e.spec.menuId === LOG_KNOWLEDGE_MENU_ID);
const serverActions = (server.actions ?? []).filter((a) => a.spec.menuId === LOG_KNOWLEDGE_MENU_ID);
const sorted = (keys: Iterable<string>) => [...keys].sort();

describe('log knowledge menu declarations vs the server', () => {
  it('uses one menu id and one menu permission name for the writes', () => {
    expect(LOG_KNOWLEDGE_MENU_ID).toBe('log-knowledge-catalog');
    expect(CATALOG_MANAGE_PERMISSION).toBe(CATALOG_MENU_PERMISSION);
  });

  it('declares the same four reads in the same order', () => {
    expect(catalogEndpointSpecs.map((s) => s.id)).toEqual(serverEndpoints.map((e) => e.spec.id));
    catalogEndpointSpecs.forEach((menu, i) => {
      const spec = serverEndpoints[i]?.spec;
      expect(sorted(Object.keys(menu.paramKeys)), menu.id).toEqual(sorted(spec?.paramKeys ?? []));
      expect(
        { menuId: menu.menuId, permission: menu.permission, requiresScope: menu.requiresScope, context: menu.context, mergeTimeDomain: menu.mergeTimeDomain },
        menu.id,
      ).toEqual({ menuId: spec?.menuId, permission: spec?.permission, requiresScope: spec?.requiresScope, context: spec?.context, mergeTimeDomain: spec?.mergeTimeDomain });
    });
  });

  it('declares the same twelve writes in the same order', () => {
    expect(serverActions).toHaveLength(12);
    expect(catalogActionSpecs.map((s) => s.id)).toEqual(serverActions.map((a) => a.spec.id));
    catalogActionSpecs.forEach((menu, i) => {
      const spec = serverActions[i]?.spec;
      expect(sorted(Object.keys(menu.inputKeys)), menu.id).toEqual(sorted(spec?.inputKeys ?? []));
      expect(menu.invalidates.map((e) => e.id), menu.id).toEqual([...(spec?.invalidates ?? [])]);
      expect(
        { menuId: menu.menuId, permission: menu.permission, requiresScope: menu.requiresScope, concurrency: menu.concurrency },
        menu.id,
      ).toEqual({ menuId: spec?.menuId, permission: spec?.permission, requiresScope: spec?.requiresScope, concurrency: spec?.concurrency });
    });
  });

  it.each([
    ['vendors', vendorFilterSpecs, VENDOR_SORT_IDS, MENU_VENDOR_SORT_IDS],
    ['processes', processFilterSpecs, PROCESS_SORT_IDS, MENU_PROCESS_SORT_IDS],
    ['models', modelFilterSpecs, MODEL_SORT_IDS, MENU_MODEL_SORT_IDS],
    ['softwareVersions', softwareFilterSpecs, SOFTWARE_SORT_IDS, MENU_SOFTWARE_SORT_IDS],
  ] as const)('%s: same filter fields, operators, multiple and cell, and the same sort ids', (name, menuSpecs, serverSort, menuSort) => {
    const serverSpecs: Record<string, { ops: readonly string[]; multiple: boolean; cell: string }> = CATALOG_FILTER_SPECS[name];
    expect(sorted(Object.keys(menuSpecs))).toEqual(sorted(Object.keys(serverSpecs)));
    for (const [field, spec] of Object.entries(menuSpecs)) {
      expect(spec.kind, `${name}.${field}`).toBe('enum');
      if (spec.kind !== 'enum') continue;
      const mirror = serverSpecs[field];
      expect(
        { ops: sorted(spec.ops ?? []), multiple: spec.multiple !== false, cell: spec.cell ?? 'scalar' },
        `${name}.${field}`,
      ).toEqual({ ops: sorted(mirror?.ops ?? []), multiple: mirror?.multiple, cell: mirror?.cell });
    }
    expect([...menuSort]).toEqual([...serverSort]);
  });
});

describe('model reads (menu log-knowledge-models) vs the server', () => {
  const serverModelEndpoints = (server.endpoints ?? []).filter((e) => e.spec.menuId === LOG_KNOWLEDGE_MODELS_MENU_ID);

  it('uses the server menu id', () => {
    expect(LOG_KNOWLEDGE_MODELS_MENU_ID).toBe(SERVER_MODELS_MENU_ID);
  });

  it('declares the same two reads in the same order, with the same keys, right and workspace rule', () => {
    expect(serverModelEndpoints).toHaveLength(2);
    expect(modelEndpointSpecs.map((s) => s.id)).toEqual(serverModelEndpoints.map((e) => e.spec.id));
    modelEndpointSpecs.forEach((menu, i) => {
      const spec = serverModelEndpoints[i]?.spec;
      expect(sorted(Object.keys(menu.paramKeys)), menu.id).toEqual(sorted(spec?.paramKeys ?? []));
      expect(
        { menuId: menu.menuId, permission: menu.permission, requiresScope: menu.requiresScope, context: menu.context, mergeTimeDomain: menu.mergeTimeDomain },
        menu.id,
      ).toEqual({ menuId: spec?.menuId, permission: spec?.permission, requiresScope: spec?.requiresScope, context: spec?.context, mergeTimeDomain: spec?.mergeTimeDomain });
    });
  });

  it('exploreModels takes the filters and sort ids of the models read', () => {
    // The server parses exploreModels with `CATALOG_FILTER_SPECS.models` and `MODEL_SORT_IDS` (item-endpoints.ts); the menu reuses its models declarations.
    expect(sorted(Object.keys(modelFilterSpecs))).toEqual(sorted(Object.keys(CATALOG_FILTER_SPECS.models)));
    expect([...MENU_MODEL_SORT_IDS]).toEqual([...MODEL_SORT_IDS]);
  });
});
