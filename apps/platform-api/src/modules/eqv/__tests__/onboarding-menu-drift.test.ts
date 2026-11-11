import { describe, expect, it } from 'vitest';

import {
  DICTIONARY_GLOBAL_EDIT_PERMISSION,
  EQV_ONBOARDING_MENU_ID as MENU_ID,
  EQV_READ_PERMISSION,
  MAPPING_PUBLISH_PERMISSION,
  RULES_EDIT_PERMISSION,
  STUDIO_VIEW_PERMISSION,
  onboardingActionSpecs,
  onboardingReadSpecs,
} from '../../../../../../menus/tools/topview-studio/src/endpoints.js';
import type { Db } from '../../../db/client.js';
import type { CheckService } from '../../permissions/check-service.js';
import { eqvContribution } from '../index.js';
import {
  EQV_DICTIONARY_GLOBAL_EDIT_PERMISSION,
  EQV_MAPPING_PUBLISH_PERMISSION,
  EQV_ONBOARDING_MENU_ID,
  EQV_RULES_EDIT_PERMISSION,
  EQV_STUDIO_VIEW_PERMISSION,
  EQV_VIEW_PERMISSION,
} from '../menu.js';

// The server declares the Onboarding reads and writes; the menu (`@ap/menu-topview-studio`) declares the same ids, keys, rights and
// invalidations for the client and the mock. This test imports the menu's client-safe `src/endpoints.ts` and fails when they differ (#1658).
const server = eqvContribution({ db: {} as Db, checkService: {} as CheckService, knowledgeLookup: { getModel: async () => null, getVendor: async () => null } });
const serverReads = (server.endpoints ?? []).filter((e) => e.spec.menuId === EQV_ONBOARDING_MENU_ID);
const serverActions = (server.actions ?? []).filter((a) => a.spec.menuId === EQV_ONBOARDING_MENU_ID);
const sorted = (keys: Iterable<string>) => [...keys].sort();

/** Declared by the menu, «Server: pending (#1658 Sample Window·Fleet PR)»: the mock serves them; the server must not yet. */
const PENDING_READS = ['eqv.fleet', 'eqv.sampleWindows', 'eqv.observedInventory', 'eqv.bundledTemplates'];
const PENDING_ACTIONS = ['eqv.replaceSampleWindow', 'eqv.retireSampleWindow'];

const servedReads = onboardingReadSpecs.filter((s) => !PENDING_READS.includes(s.id));
const servedActions = onboardingActionSpecs.filter((s) => !PENDING_ACTIONS.includes(s.id));

describe('Onboarding menu declarations vs the eqv module (#1658)', () => {
  it('uses the server menu id and permission names', () => {
    expect(MENU_ID).toBe(EQV_ONBOARDING_MENU_ID);
    expect(STUDIO_VIEW_PERMISSION).toBe(EQV_STUDIO_VIEW_PERMISSION);
    expect(EQV_READ_PERMISSION).toBe(EQV_VIEW_PERMISSION);
    expect(RULES_EDIT_PERMISSION).toBe(EQV_RULES_EDIT_PERMISSION);
    expect(DICTIONARY_GLOBAL_EDIT_PERMISSION).toBe(EQV_DICTIONARY_GLOBAL_EDIT_PERMISSION);
    expect(MAPPING_PUBLISH_PERMISSION).toBe(EQV_MAPPING_PUBLISH_PERMISSION);
  });

  it('lists the pending declarations explicitly, and the server serves none of them yet', () => {
    expect(onboardingReadSpecs.filter((s) => PENDING_READS.includes(s.id)).map((s) => s.id)).toEqual(PENDING_READS);
    expect(onboardingActionSpecs.filter((s) => PENDING_ACTIONS.includes(s.id)).map((s) => s.id)).toEqual(PENDING_ACTIONS);
    const ids = [...(server.endpoints ?? []).map((e) => e.spec.id), ...(server.actions ?? []).map((a) => a.spec.id)];
    for (const id of [...PENDING_READS, ...PENDING_ACTIONS]) expect(ids, id).not.toContain(id);
  });

  it('declares the served reads in the server order: id, menu, right, keys, scope, context, time domain', () => {
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

  it('declares the served writes in the server order: keys, right, scope, concurrency and invalidations', () => {
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
