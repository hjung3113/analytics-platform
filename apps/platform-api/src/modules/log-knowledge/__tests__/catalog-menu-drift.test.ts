import { describe, expect, it } from 'vitest';

import {
  ASSESSMENT_DIMENSIONS as MENU_ASSESSMENT_DIMENSIONS,
  CATALOG_MANAGE_PERMISSION,
  EVIDENCE_SOURCE_KINDS as MENU_EVIDENCE_SOURCE_KINDS,
  ITEM_LIMITS,
  ITEM_PUBLISH_PERMISSION,
  SPEC_FIELD_TYPES as MENU_SPEC_FIELD_TYPES,
  SPEC_PUBLISH_PERMISSION,
  SPEC_SAVE_LIMITS,
  LOG_KNOWLEDGE_MENU_ID,
  LOG_KNOWLEDGE_MODELS_MENU_ID,
  MODEL_SORT_IDS as MENU_MODEL_SORT_IDS,
  PROCESS_SORT_IDS as MENU_PROCESS_SORT_IDS,
  SOFTWARE_SORT_IDS as MENU_SOFTWARE_SORT_IDS,
  VENDOR_SORT_IDS as MENU_VENDOR_SORT_IDS,
  catalogActionSpecs,
  ITEM_SORT_IDS as MENU_ITEM_SORT_IDS,
  IMPORT_APPLY_STATUSES as MENU_IMPORT_APPLY_STATUSES,
  IMPORT_RESOLUTIONS as MENU_IMPORT_RESOLUTIONS,
  IMPORT_ROW_SORT_IDS as MENU_IMPORT_ROW_SORT_IDS,
  importActionSpecs,
  importEndpointSpecs,
  importRowFilterSpecs,
  LOG_KNOWLEDGE_ITEMS_MENU_ID,
  catalogEndpointSpecs,
  itemActionSpecs,
  itemEndpointSpecs,
  searchEndpointSpecs,
  itemFilterSpecs,
  modelEndpointSpecs,
  modelFilterSpecs,
  modelSpecEndpointSpecs,
  specActionSpecs,
  topViewActionSpecs,
  topViewEndpointSpecs,
  processFilterSpecs,
  softwareFilterSpecs,
  vendorFilterSpecs,
} from '../../../../../../menus/log-dev/log-knowledge/src/endpoints.js';
import { LOG_KNOWLEDGE_MODELS_MENU_ID as SERVER_MODELS_MENU_ID } from '../catalog-menu.js';
import { CATALOG_MENU_PERMISSION } from '../catalog-actions.js';
import { ITEM_MENU_PERMISSION } from '../item-actions.js';
import { SPEC_MENU_PERMISSION } from '../spec-actions.js';
import { REJECT_REASON_MAX, SPEC_BODY_MAX_BYTES, SPEC_FIELD_TYPES, SPEC_ROWS_MAX } from '../domain/spec-input.js';
import { logKnowledgeContribution } from '../catalog-endpoints.js';
import { APPLY_STATUSES, RESOLUTIONS } from '../domain/import-apply.js';
import { IMPORT_ROW_FILTER_SPECS, IMPORT_ROW_SORT_IDS } from '../import-endpoints.js';
import { CATALOG_FILTER_SPECS } from '../domain/catalog-filters.js';
import { ITEM_FILTER_SPECS } from '../domain/item-filters.js';
import {
  ASSESSMENT_DIMENSIONS,
  BODY_MAX,
  CHANGE_NOTE_MAX,
  EVIDENCE_FIELD_MAX,
  EVIDENCE_MAX,
  EVIDENCE_NOTE_MAX,
  EVIDENCE_SOURCE_KINDS,
  RATIONALE_MAX,
  TITLE_MAX,
} from '../domain/item-input.js';
import { MODEL_SORT_IDS, PROCESS_SORT_IDS, SOFTWARE_SORT_IDS, VENDOR_SORT_IDS } from '../repositories/catalog-read.js';
import { ITEM_SORT_IDS } from '../repositories/item-read.js';

// The server declares the catalog reads and writes (it may not import the menu package at runtime) and the menu
// declares the same ids, keys and filter fields for the client and the mock. This test imports the menu's client-safe
// `src/endpoints.ts` and fails when the two sides differ (#1194 r).
const server = logKnowledgeContribution({ db: {} as never, checkService: {} as never });
// The item reads (ADR-0109) sit on their own menu ids; the model reads (menu `log-knowledge-models`, #1197 s1) are
// compared below, then the item reads (menu `log-knowledge-items`, #1197 s2).
// The import staging declarations (#1195 a) share the catalog menu id and are compared in their own block below.
const isImport = (id: string) => id.startsWith('logKnowledge.import');
// The knowledge draft declarations (#1198 a) are server-only for now: the client menu declares no draft endpoints yet.
const isDraft = (id: string) => id.startsWith('logKnowledge.draft');
const serverEndpoints = (server.endpoints ?? []).filter((e) => e.spec.menuId === LOG_KNOWLEDGE_MENU_ID && !isImport(e.spec.id));
const serverActions = (server.actions ?? []).filter((a) => a.spec.menuId === LOG_KNOWLEDGE_MENU_ID && !isImport(a.spec.id));
const serverImportEndpoints = (server.endpoints ?? []).filter((e) => isImport(e.spec.id));
const serverImportActions = (server.actions ?? []).filter((a) => isImport(a.spec.id));
// The Top View pointer reads and writes (#1656) have their own block below.
const isTopView = (id: string) => /^logKnowledge\.(modelTopView|topViewRevisionOptions|linkTopView|unlinkTopView)$/.test(id);
const sorted = (keys: Iterable<string>) => [...keys].sort();

describe('log knowledge menu declarations vs the server', () => {
  it('uses one menu id and one menu permission name for the writes', () => {
    expect(LOG_KNOWLEDGE_MENU_ID).toBe('log-knowledge-catalog');
    expect(CATALOG_MANAGE_PERMISSION).toBe(CATALOG_MENU_PERMISSION);
  });

  it('declares the same five reads in the same order', () => {
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
  const serverModelEndpoints = (server.endpoints ?? []).filter((e) => e.spec.menuId === LOG_KNOWLEDGE_MODELS_MENU_ID && !isTopView(e.spec.id));

  it('uses the server menu id', () => {
    expect(LOG_KNOWLEDGE_MODELS_MENU_ID).toBe(SERVER_MODELS_MENU_ID);
  });

  // The two model reads of #1197 s1 followed by the model spec reads of #1196 a, b1, c, the #1496 coverage badge read, e (mappings, suggestions) and f (subject items).
  const menuModelReads = [...modelEndpointSpecs, ...modelSpecEndpointSpecs];

  it('declares the same ten reads in the same order, with the same keys, right and workspace rule', () => {
    expect(serverModelEndpoints).toHaveLength(10);
    expect(menuModelReads.map((s) => s.id)).toEqual(serverModelEndpoints.map((e) => e.spec.id));
    menuModelReads.forEach((menu, i) => {
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

// The two item reads of the `log-knowledge-items` menu (#1197 s2); the model reads are node s1's block.
describe('log knowledge item reads vs the server', () => {
  const serverItemReads = (server.endpoints ?? []).filter((e) => e.spec.menuId === LOG_KNOWLEDGE_ITEMS_MENU_ID && !isDraft(e.spec.id));

  it('declares the same two reads on the same menu in the same order', () => {
    expect(serverItemReads).toHaveLength(2);
    expect(itemEndpointSpecs.map((s) => s.id)).toEqual(serverItemReads.map((e) => e.spec.id));
    itemEndpointSpecs.forEach((menu, i) => {
      const spec = serverItemReads[i]?.spec;
      expect(sorted(Object.keys(menu.paramKeys)), menu.id).toEqual(sorted(spec?.paramKeys ?? []));
      expect(
        { menuId: menu.menuId, permission: menu.permission, requiresScope: menu.requiresScope, context: menu.context, mergeTimeDomain: menu.mergeTimeDomain },
        menu.id,
      ).toEqual({ menuId: spec?.menuId, permission: spec?.permission, requiresScope: spec?.requiresScope, context: spec?.context, mergeTimeDomain: spec?.mergeTimeDomain });
    });
  });

  it('items: same filter fields, operators, multiple, cell and enum values, and the same sort ids', () => {
    const serverSpecs: Record<string, { ops: readonly string[]; multiple: boolean; cell: string; values: 'boolean' | 'uuid' | 'enum' | 'text'; allowed?: readonly string[] }> = ITEM_FILTER_SPECS;
    expect(sorted(Object.keys(itemFilterSpecs))).toEqual(sorted(Object.keys(serverSpecs)));
    for (const [field, spec] of Object.entries(itemFilterSpecs)) {
      expect(spec.kind, `items.${field}`).toBe('enum');
      if (spec.kind !== 'enum') continue;
      const mirror = serverSpecs[field];
      expect(
        { ops: sorted(spec.ops ?? []), multiple: spec.multiple !== false, cell: spec.cell ?? 'scalar' },
        `items.${field}`,
      ).toEqual({ ops: sorted(mirror?.ops ?? []), multiple: mirror?.multiple, cell: mirror?.cell });
      // A field with a closed vocabulary lists exactly the server's values; the uuid and boolean fields carry their own shape rules.
      if (mirror?.allowed) expect(sorted(spec.options.map((o) => o.value)), `items.${field} values`).toEqual(sorted(mirror.allowed));
      // Value shapes: a boolean field offers exactly 'true'/'false'; a uuid field has no closed vocabulary (the menu lists none, the server takes uuid strings).
      if (mirror?.values === 'boolean') expect(sorted(spec.options.map((o) => o.value)), `items.${field} boolean values`).toEqual(['false', 'true']);
      if (mirror?.values === 'uuid') expect(spec.options, `items.${field} uuid values`).toEqual([]);
      if (mirror?.values === 'enum') expect(mirror.allowed, `items.${field} enum has a vocabulary`).toBeDefined();
    }
    expect([...MENU_ITEM_SORT_IDS]).toEqual([...ITEM_SORT_IDS]);
  });
});

// The four model spec writes of the `log-knowledge-models` menu (#1196 b1): same comparison as the item writes.
describe('log knowledge model spec writes vs the server', () => {
  const serverSpecActions = (server.actions ?? []).filter((a) => a.spec.menuId === LOG_KNOWLEDGE_MODELS_MENU_ID && !isTopView(a.spec.id));

  it("uses the server's menu permission name for the writes and the draft read", () => {
    expect(SPEC_PUBLISH_PERMISSION).toBe(SPEC_MENU_PERMISSION);
  });

  it('declares the same ten writes on the same menu in the same order', () => {
    expect(serverSpecActions).toHaveLength(10);
    expect(specActionSpecs.map((s) => s.id)).toEqual(serverSpecActions.map((a) => a.spec.id));
    specActionSpecs.forEach((menu, i) => {
      const spec = serverSpecActions[i]?.spec;
      expect(sorted(Object.keys(menu.inputKeys)), menu.id).toEqual(sorted(spec?.inputKeys ?? []));
      expect(menu.invalidates.map((e) => e.id), menu.id).toEqual([...(spec?.invalidates ?? [])]);
      expect(
        { menuId: menu.menuId, permission: menu.permission, requiresScope: menu.requiresScope, concurrency: menu.concurrency },
        menu.id,
      ).toEqual({ menuId: spec?.menuId, permission: spec?.permission, requiresScope: spec?.requiresScope, concurrency: spec?.concurrency });
    });
  });

  it('invalidates reads that are endpoints of the same menu', () => {
    const modelReadIds = (server.endpoints ?? []).filter((e) => e.spec.menuId === LOG_KNOWLEDGE_MODELS_MENU_ID && !isTopView(e.spec.id)).map((e) => e.spec.id);
    for (const menu of specActionSpecs) for (const read of menu.invalidates) expect(modelReadIds, menu.id).toContain(read.id);
  });

  it('shares the field vocabulary and the call caps', () => {
    expect([...MENU_SPEC_FIELD_TYPES]).toEqual([...SPEC_FIELD_TYPES]);
    expect(SPEC_SAVE_LIMITS).toEqual({ rows: SPEC_ROWS_MAX, bodyBytes: SPEC_BODY_MAX_BYTES, rejectReason: REJECT_REASON_MAX });
  });
});

// The five item writes of the `log-knowledge-items` menu (#1197 s3a): ids, menu, input keys, concurrency, permission,
// scope and the reads they invalidate. The server lists them in create, revise, assess, derive, set-archived order.
describe('log knowledge item writes vs the server', () => {
  const serverItemActions = (server.actions ?? []).filter((a) => a.spec.menuId === LOG_KNOWLEDGE_ITEMS_MENU_ID && !isDraft(a.spec.id));

  it('uses the server\'s menu permission name for the writes', () => {
    expect(ITEM_PUBLISH_PERMISSION).toBe(ITEM_MENU_PERMISSION);
  });

  it('declares the same five writes on the same menu in the same order', () => {
    expect(serverItemActions).toHaveLength(5);
    expect(itemActionSpecs.map((s) => s.id)).toEqual(serverItemActions.map((a) => a.spec.id));
    itemActionSpecs.forEach((menu, i) => {
      const spec = serverItemActions[i]?.spec;
      expect(sorted(Object.keys(menu.inputKeys)), menu.id).toEqual(sorted(spec?.inputKeys ?? []));
      expect(menu.invalidates.map((e) => e.id), menu.id).toEqual([...(spec?.invalidates ?? [])]);
      expect(
        { menuId: menu.menuId, permission: menu.permission, requiresScope: menu.requiresScope, concurrency: menu.concurrency },
        menu.id,
      ).toEqual({ menuId: spec?.menuId, permission: spec?.permission, requiresScope: spec?.requiresScope, concurrency: spec?.concurrency });
    });
  });

  it('invalidates reads that are endpoints of the same menu', () => {
    const itemReadIds = itemEndpointSpecs.map((s) => s.id);
    for (const menu of itemActionSpecs) expect(menu.invalidates.map((e) => e.id), menu.id).toEqual(itemReadIds);
  });

  it('shares the input vocabularies and limits the mock validates against', () => {
    expect([...MENU_EVIDENCE_SOURCE_KINDS]).toEqual([...EVIDENCE_SOURCE_KINDS]);
    expect([...MENU_ASSESSMENT_DIMENSIONS]).toEqual([...ASSESSMENT_DIMENSIONS]);
    expect(ITEM_LIMITS).toEqual({
      title: TITLE_MAX, body: BODY_MAX, evidence: EVIDENCE_MAX, evidenceField: EVIDENCE_FIELD_MAX,
      evidenceNote: EVIDENCE_NOTE_MAX, changeNote: CHANGE_NOTE_MAX, rationale: RATIONALE_MAX,
    });
  });
});

describe('log knowledge search menu vs the server', () => {
  it('declares the same search and suggestion requests without Context coupling', () => {
    for (const menu of searchEndpointSpecs) {
      const spec = server.endpoints?.find(endpoint => endpoint.spec.id === menu.id)?.spec;
      expect(spec, menu.id).toBeDefined();
      expect(Object.keys(menu.paramKeys).sort(), menu.id).toEqual([...(spec?.paramKeys ?? [])].sort());
      expect({ menuId: menu.menuId, permission: menu.permission, context: menu.context, requiresScope: menu.requiresScope, mergeTimeDomain: menu.mergeTimeDomain }, menu.id)
        .toEqual({ menuId: spec?.menuId, permission: spec?.permission, context: spec?.context, requiresScope: spec?.requiresScope, mergeTimeDomain: spec?.mergeTimeDomain });
    }
  });
});

describe('catalog import staging declarations (#1195 a) vs the server', () => {
  it('declares the same read in the same order, with the same keys, right and workspace rule', () => {
    expect(serverImportEndpoints).toHaveLength(1);
    expect(importEndpointSpecs.map((s) => s.id)).toEqual(serverImportEndpoints.map((e) => e.spec.id));
    importEndpointSpecs.forEach((menu, i) => {
      const spec = serverImportEndpoints[i]?.spec;
      expect(sorted(Object.keys(menu.paramKeys)), menu.id).toEqual(sorted(spec?.paramKeys ?? []));
      expect(
        { menuId: menu.menuId, permission: menu.permission, requiresScope: menu.requiresScope, context: menu.context, mergeTimeDomain: menu.mergeTimeDomain },
        menu.id,
      ).toEqual({ menuId: spec?.menuId, permission: spec?.permission, requiresScope: spec?.requiresScope, context: spec?.context, mergeTimeDomain: spec?.mergeTimeDomain });
    });
  });

  it('declares the same six actions in the same order, with keys, permission, concurrency and invalidations', () => {
    expect(serverImportActions).toHaveLength(6);
    expect(importActionSpecs.map((s) => s.id)).toEqual(serverImportActions.map((a) => a.spec.id));
    importActionSpecs.forEach((menu, i) => {
      const spec = serverImportActions[i]?.spec;
      expect(sorted(Object.keys(menu.inputKeys)), menu.id).toEqual(sorted(spec?.inputKeys ?? []));
      expect(menu.invalidates.map((e) => e.id), menu.id).toEqual([...(spec?.invalidates ?? [])]);
      expect(
        { menuId: menu.menuId, permission: menu.permission, requiresScope: menu.requiresScope, concurrency: menu.concurrency },
        menu.id,
      ).toEqual({ menuId: spec?.menuId, permission: spec?.permission, requiresScope: spec?.requiresScope, concurrency: spec?.concurrency });
    });
  });

  it('importDetail: same filter field, operators, allowed values and sort ids', () => {
    expect(sorted(Object.keys(importRowFilterSpecs))).toEqual(sorted(Object.keys(IMPORT_ROW_FILTER_SPECS)));
    const menu = importRowFilterSpecs.planState;
    expect(menu?.kind).toBe('enum');
    if (menu?.kind !== 'enum') return;
    expect(sorted(menu.ops ?? [])).toEqual(sorted(IMPORT_ROW_FILTER_SPECS.planState.ops));
    expect(sorted(menu.options.map((o) => o.value))).toEqual(sorted(IMPORT_ROW_FILTER_SPECS.planState.allowed));
    expect([...MENU_IMPORT_ROW_SORT_IDS]).toEqual([...IMPORT_ROW_SORT_IDS]);
  });

  it('importDetail: the applyStatus filter and the resolution vocabulary match', () => {
    const menu = importRowFilterSpecs.applyStatus;
    expect(menu?.kind).toBe('enum');
    if (menu?.kind !== 'enum') return;
    expect(sorted(menu.ops ?? [])).toEqual(sorted(IMPORT_ROW_FILTER_SPECS.applyStatus.ops));
    expect(sorted(menu.options.map((o) => o.value))).toEqual(sorted(IMPORT_ROW_FILTER_SPECS.applyStatus.allowed));
    expect(sorted(MENU_IMPORT_APPLY_STATUSES)).toEqual(sorted(APPLY_STATUSES));
    expect(sorted(MENU_IMPORT_RESOLUTIONS)).toEqual(sorted(RESOLUTIONS));
  });
});

// The Top View pointer: two reads and two writes of the models menu (#1656), compared in the server's order.
describe('model Top View pointer declarations vs the server', () => {
  const serverReads = (server.endpoints ?? []).filter((e) => isTopView(e.spec.id));
  const serverWrites = (server.actions ?? []).filter((a) => isTopView(a.spec.id));

  it('declares the same two reads with the same keys, right and workspace rule', () => {
    expect(topViewEndpointSpecs.map((s) => s.id)).toEqual(serverReads.map((e) => e.spec.id));
    topViewEndpointSpecs.forEach((menu, i) => {
      const spec = serverReads[i]?.spec;
      expect(sorted(Object.keys(menu.paramKeys)), menu.id).toEqual(sorted(spec?.paramKeys ?? []));
      expect(
        { menuId: menu.menuId, permission: menu.permission, requiresScope: menu.requiresScope, context: menu.context, mergeTimeDomain: menu.mergeTimeDomain },
        menu.id,
      ).toEqual({ menuId: spec?.menuId, permission: spec?.permission, requiresScope: spec?.requiresScope, context: spec?.context, mergeTimeDomain: spec?.mergeTimeDomain });
    });
  });

  it('declares the same two writes, versioned, on the catalog-manage right, invalidating modelTopView', () => {
    expect(topViewActionSpecs.map((s) => s.id)).toEqual(serverWrites.map((a) => a.spec.id));
    topViewActionSpecs.forEach((menu, i) => {
      const spec = serverWrites[i]?.spec;
      expect(sorted(Object.keys(menu.inputKeys)), menu.id).toEqual(sorted(spec?.inputKeys ?? []));
      expect(menu.invalidates.map((e) => e.id), menu.id).toEqual([...(spec?.invalidates ?? [])]);
      expect(
        { menuId: menu.menuId, permission: menu.permission, requiresScope: menu.requiresScope, concurrency: menu.concurrency },
        menu.id,
      ).toEqual({ menuId: spec?.menuId, permission: spec?.permission, requiresScope: spec?.requiresScope, concurrency: spec?.concurrency });
      expect(spec?.permission).toBe(CATALOG_MENU_PERMISSION);
    });
  });
});
