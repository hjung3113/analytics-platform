import { describe, expect, it } from 'vitest';

import type { CheckService } from '../../permissions/check-service.js';
import { EQV_MENU_PERMISSIONS } from '../../eqv/menu.js';
import { createPlatformPermissionResolver } from '../permissions.js';

// `eqv:view` (the reads) and `eqv-studio:view` (the Studio Layouts menu entry, #1654)
// share the capability `eqv.view` in the eqv module's declarations (#1667), so they stand and fall together with the capability `eqv.view`. The DB-backed bootstrap test is
// `platform-port.integration.test.ts` (host-only).
const resolver = createPlatformPermissionResolver(EQV_MENU_PERMISSIONS);
const actor = { actor_id: 'a', workspace_id: 'w', role_level: 'developer' };
const checkServiceHolding = (capabilities: readonly string[]): CheckService => ({
  checkCapability: async (_actor: unknown, capability: string) => ({ allow: capabilities.includes(capability), reason: 'test' }),
  capabilityScope: async () => ({ kind: 'none', managed_system_ids: [] }),
}) as unknown as CheckService;

const NAMES = [
  'eqv:view', 'eqv-studio:view', 'eqv-studio:layout-edit', 'eqv-studio:layout-publish',
  'eqv-studio:rules-edit', 'eqv-studio:dictionary-global-edit', 'eqv-studio:mapping-publish', 'eqv-studio:window-import',
] as const;
const held = async (capabilities: readonly string[]) => {
  const service = checkServiceHolding(capabilities);
  const out: string[] = [];
  for (const name of NAMES) if (await resolver.holds(service, actor, name)) out.push(name);
  return out;
};

describe('eqv view permission names', () => {
  it('grants both view names under eqv.view, and no write name', async () => {
    expect(await held(['eqv.view'])).toEqual(['eqv:view', 'eqv-studio:view']);
  });

  it('removes both view names when the capability is denied', async () => {
    expect(await held([])).toEqual([]);
  });

  it('keeps the write names on their own capabilities', async () => {
    expect(await held(['eqv.layout.edit', 'eqv.layout.publish'])).toEqual(['eqv-studio:layout-edit', 'eqv-studio:layout-publish']);
  });

  it('lists each Onboarding write name only for its own capability (#1658)', async () => {
    expect(await held(['eqv.rules.edit'])).toEqual(['eqv-studio:rules-edit']);
    expect(await held(['eqv.dictionary.global_edit'])).toEqual(['eqv-studio:dictionary-global-edit']);
    expect(await held(['eqv.mapping.publish'])).toEqual(['eqv-studio:mapping-publish']);
    expect(await held(['eqv.window.import'])).toEqual(['eqv-studio:window-import']);
  });
});
