import { describe, expect, it } from 'vitest';

import {
  DICTIONARY_GLOBAL_EDIT_PERMISSION,
  EQV_ONBOARDING_MENU_ID as MENU_ID,
  FLEET_STATUSES as MENU_FLEET_STATUSES,
  EQV_READ_PERMISSION,
  MAPPING_PUBLISH_PERMISSION,
  RULES_EDIT_PERMISSION,
  STUDIO_VIEW_PERMISSION,
  WINDOW_IMPORT_PERMISSION,
  onboardingActionSpecs,
  onboardingReadSpecs,
} from '../../../../../../menus/tools/topview-studio/src/endpoints.js';
import type { Db } from '../../../db/client.js';
import type { CheckService } from '../../permissions/check-service.js';
import { eqvContribution } from '../index.js';
import { FLEET_ROWS_MAX, FLEET_STATUSES } from '../onboarding-fleet.js';
import {
  EQV_DICTIONARY_GLOBAL_EDIT_PERMISSION,
  EQV_MAPPING_PUBLISH_PERMISSION,
  EQV_ONBOARDING_MENU_ID,
  EQV_RULES_EDIT_PERMISSION,
  EQV_STUDIO_VIEW_PERMISSION,
  EQV_VIEW_PERMISSION,
  EQV_WINDOW_IMPORT_PERMISSION,
} from '../menu.js';

// The server declares all the Onboarding reads and writes (nothing is pending since the Sample Window·Fleet PR); the menu (`@ap/menu-topview-studio`) declares the same ids, keys, rights and
// invalidations for the client and the mock. This test imports the menu's client-safe `src/endpoints.ts` and fails when they differ (#1658).
const server = eqvContribution({ db: {} as Db, checkService: {} as CheckService, knowledgeLookup: { getModel: async () => null, getVendor: async () => null }, uploads: { readUnlinkedUpload: async () => null } });
const serverReads = (server.endpoints ?? []).filter((e) => e.spec.menuId === EQV_ONBOARDING_MENU_ID);
const serverActions = (server.actions ?? []).filter((a) => a.spec.menuId === EQV_ONBOARDING_MENU_ID);
const sorted = (keys: Iterable<string>) => [...keys].sort();

const servedReads = onboardingReadSpecs;
const servedActions = onboardingActionSpecs;

describe('Onboarding menu declarations vs the eqv module (#1658)', () => {
  it('uses the server menu id and permission names', () => {
    expect(MENU_ID).toBe(EQV_ONBOARDING_MENU_ID);
    expect(STUDIO_VIEW_PERMISSION).toBe(EQV_STUDIO_VIEW_PERMISSION);
    expect(EQV_READ_PERMISSION).toBe(EQV_VIEW_PERMISSION);
    expect(RULES_EDIT_PERMISSION).toBe(EQV_RULES_EDIT_PERMISSION);
    expect(DICTIONARY_GLOBAL_EDIT_PERMISSION).toBe(EQV_DICTIONARY_GLOBAL_EDIT_PERMISSION);
    expect(MAPPING_PUBLISH_PERMISSION).toBe(EQV_MAPPING_PUBLISH_PERMISSION);
    expect(WINDOW_IMPORT_PERMISSION).toBe(EQV_WINDOW_IMPORT_PERMISSION);
  });

  it('uses the menu\'s Fleet status codes, and the Fleet row cap is the documented 500', () => {
    expect([...FLEET_STATUSES]).toEqual([...MENU_FLEET_STATUSES]);
    expect(FLEET_ROWS_MAX).toBe(500);
  });

  it('declares every read in the server order: id, menu, right, keys, scope, context, time domain', () => {
    expect(servedReads.map((s) => s.id)).toEqual(serverReads.map((e) => e.spec.id));
    servedReads.forEach((menu, i) => {
      const spec = serverReads[i]?.spec;
      expect(sorted(Object.keys(menu.paramKeys)), menu.id).toEqual(sorted(spec?.paramKeys ?? []));
      expect(
        { menuId: menu.menuId, permission: menu.permission, requiresScope: menu.requiresScope, context: menu.context, mergeTimeDomain: menu.mergeTimeDomain },
        menu.id,
      ).toEqual({ menuId: spec?.menuId, permission: spec?.permission, requiresScope: spec?.requiresScope, context: spec?.context, mergeTimeDomain: spec?.mergeTimeDomain });
    });
  });

  it('declares every write in the server order: keys, right, scope, concurrency and invalidations', () => {
    expect(servedActions.map((s) => s.id)).toEqual(serverActions.map((a) => a.spec.id));
    servedActions.forEach((menu, i) => {
      const spec = serverActions[i]?.spec;
      expect(sorted(Object.keys(menu.inputKeys)), menu.id).toEqual(sorted(spec?.inputKeys ?? []));
      expect(menu.invalidates.map((e) => e.id), menu.id).toEqual([...(spec?.invalidates ?? [])]);
      expect(
        { menuId: menu.menuId, permission: menu.permission, requiresScope: menu.requiresScope, concurrency: menu.concurrency },
        menu.id,
      ).toEqual({ menuId: spec?.menuId, permission: spec?.permission, requiresScope: spec?.requiresScope, concurrency: spec?.concurrency });
    });
  });
});
