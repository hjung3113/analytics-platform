// Negative check fixture — missing-required-host-feature: a module requiring a host feature the host does not provide
// is rejected at registration (HostFeature, §10.5).
import { expect, it } from 'vitest';
import type { ModuleManifest } from '@ap/contracts';
import { mountModule } from '@ap/kernel';

it('missing-required-host-feature: mountModule rejects a module requiring "write" on a host without it', () => {
  const manifest: ModuleManifest = {
    module: { id: 'negatives', label: { ko: '부정 시험', en: 'negatives' }, contract: 1, languages: ['ko', 'en'] },
    requires: ['write'],
    groups: [],
    screens: [],
  };
  expect(() => mountModule(manifest, {}, { prefix: '/negatives', groupSpace: {}, config: {}, icons: { groups: {}, screens: {} }, features: ['query'] }))
    .toThrow(/requires host feature "write" which this host does not provide/);
});
