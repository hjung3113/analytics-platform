// Negative check fixture — unsupported-contract-integer: a module manifest with a contract integer this host does not
// accept is rejected at registration (HOST_CONTRACTS = [1], fail closed).
import { expect, it } from 'vitest';
import type { ModuleManifest } from '@ap/contracts';
import { mountModule } from '@ap/kernel';

it('unsupported-contract-integer: mountModule rejects a manifest with contract 99', () => {
  const manifest: ModuleManifest = {
    module: { id: 'negatives', label: { ko: '부정 시험', en: 'negatives' }, contract: 99 as unknown as ModuleManifest['module']['contract'], languages: ['ko', 'en'] },
    requires: [],
    groups: [],
    screens: [],
  };
  expect(() => mountModule(manifest, {}, { prefix: '/negatives', groupSpace: {}, config: {}, icons: { groups: {}, screens: {} } }))
    .toThrow(/declares unsupported contract 99/);
});
