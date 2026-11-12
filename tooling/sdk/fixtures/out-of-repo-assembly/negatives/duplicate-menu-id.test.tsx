// Negative check fixture — duplicate-menu-id: the same menu id registered twice is rejected at startup (§10.5).
// Copied into the consumer project's src/negatives/ by sdk-consumer-negatives.mjs; never part of the kit asset.
import { expect, it } from 'vitest';
import { buildRegistry } from '@ap/app-host';
import { declarations } from '../../menus';

it('duplicate-menu-id: createRegistry rejects a second menu with the same id', () => {
  const duplicate = { ...declarations.menus[0]! };
  expect(() => buildRegistry({ ...declarations, menus: [...declarations.menus, duplicate] }))
    .toThrow(/Duplicate menu id "kit-overview"/);
});
