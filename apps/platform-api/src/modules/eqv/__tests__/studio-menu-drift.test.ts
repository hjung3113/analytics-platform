import { describe, expect, it } from 'vitest';

import {
  EQV_STUDIO_MENU_ID as MENU_ID,
  EQV_READ_PERMISSION,
  LAYOUT_EDIT_PERMISSION,
  LAYOUT_PUBLISH_PERMISSION,
  STUDIO_VIEW_PERMISSION,
  studioActionSpecs,
  studioReadSpecs,
} from '../../../../../../menus/tools/topview-studio/src/endpoints.js';
import type { Db } from '../../../db/client.js';
import type { CheckService } from '../../permissions/check-service.js';
import { eqvContribution } from '../index.js';
import { EQV_EDIT_PERMISSION, EQV_MENU_PERMISSIONS, EQV_PUBLISH_PERMISSION, EQV_STUDIO_MENU_ID, EQV_STUDIO_VIEW_PERMISSION, EQV_VIEW_PERMISSION } from '../menu.js';

// The server declares the Studio reads and writes (it may not import the menu package at runtime); the menu declares the same ids, keys,
// rights and invalidations for the client and the mock. This test imports the menu's client-safe `src/endpoints.ts` and fails when they differ (#1654).
const server = eqvContribution({ db: {} as Db, checkService: {} as CheckService, knowledgeLookup: { getModel: async () => null, getVendor: async () => null } });
const serverReads = (server.endpoints ?? []).filter((e) => e.spec.menuId === EQV_STUDIO_MENU_ID);
const serverActions = (server.actions ?? []).filter((a) => a.spec.menuId === EQV_STUDIO_MENU_ID);
const sorted = (keys: Iterable<string>) => [...keys].sort();

describe('Layouts menu declarations vs the eqv module (#1654)', () => {
  it('uses the server menu id and permission names', () => {
    expect(MENU_ID).toBe(EQV_STUDIO_MENU_ID);
    expect(EQV_READ_PERMISSION).toBe(EQV_VIEW_PERMISSION);
    expect(LAYOUT_EDIT_PERMISSION).toBe(EQV_EDIT_PERMISSION);
    expect(LAYOUT_PUBLISH_PERMISSION).toBe(EQV_PUBLISH_PERMISSION);
  });

  it('declares the same six reads in the same order: id, menu, right, keys, scope, context, time domain', () => {
    expect(serverReads).toHaveLength(6);
    expect(studioReadSpecs.map((s) => s.id)).toEqual(serverReads.map((e) => e.spec.id));
    studioReadSpecs.forEach((menu, i) => {
      const spec = serverReads[i]?.spec;
      expect(sorted(Object.keys(menu.paramKeys)), menu.id).toEqual(sorted(spec?.paramKeys ?? []));
      expect(
        { menuId: menu.menuId, permission: menu.permission, requiresScope: menu.requiresScope, context: menu.context, mergeTimeDomain: menu.mergeTimeDomain },
        menu.id,
      ).toEqual({ menuId: spec?.menuId, permission: spec?.permission, requiresScope: spec?.requiresScope, context: spec?.context, mergeTimeDomain: spec?.mergeTimeDomain });
    });
  });

  it('declares the same three writes in the same order: keys, right, scope, concurrency and invalidations', () => {
    expect(serverActions).toHaveLength(3);
    expect(studioActionSpecs.map((s) => s.id)).toEqual(serverActions.map((a) => a.spec.id));
    studioActionSpecs.forEach((menu, i) => {
      const spec = serverActions[i]?.spec;
      expect(sorted(Object.keys(menu.inputKeys)), menu.id).toEqual(sorted(spec?.inputKeys ?? []));
      expect(menu.invalidates.map((e) => e.id), menu.id).toEqual([...(spec?.invalidates ?? [])]);
      expect(
        { menuId: menu.menuId, permission: menu.permission, requiresScope: menu.requiresScope, concurrency: menu.concurrency },
        menu.id,
      ).toEqual({ menuId: spec?.menuId, permission: spec?.permission, requiresScope: spec?.requiresScope, concurrency: spec?.concurrency });
    });
  });

  it('invalidates reads of the same menu', () => {
    const ids = serverReads.map((e) => e.spec.id);
    for (const menu of studioActionSpecs) for (const read of menu.invalidates) expect(ids, menu.id).toContain(read.id);
  });

  it('enters the menu with eqv-studio:view, a different name from the reads’ eqv:view, with the same capability', () => {
    expect(STUDIO_VIEW_PERMISSION).toBe(EQV_STUDIO_VIEW_PERMISSION);
    expect(STUDIO_VIEW_PERMISSION).not.toBe(EQV_READ_PERMISSION);
    const capability = (permission: string) => EQV_MENU_PERMISSIONS.find((entry) => entry.permission === permission)?.capability;
    expect(capability(STUDIO_VIEW_PERMISSION)).toBe('eqv.view');
    expect(capability(EQV_READ_PERMISSION)).toBe('eqv.view');
    expect(server.permissions?.map((d) => d.permission)).toContain(EQV_STUDIO_VIEW_PERMISSION);
  });
});
