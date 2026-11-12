import { generateKeyPairSync } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { expect, it, vi } from 'vitest';
import { loadConfig } from '../../../../../config.js';
import { loadMenuDeclarationSetup } from '../../../../../menu-declarations.js';
import type { CheckService } from '../../../../permissions/check-service.js';
import { loadDeclarationBundle } from '../../../declarations-file.js';
import { withMenuSnapshotFile } from '../../../../../test-support/menu-snapshot.js';

vi.mock('node:fs/promises', async (original) => {
  const actual = await original<typeof import('node:fs/promises')>();
  return { ...actual, readFile: async (path: string, encoding: 'utf8') => {
    if (String(path).startsWith('/synthetic/secrets/')) return 'postgres://syn:synthetic@localhost/synthetic';
    if (path === '/synthetic/key') return generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' });
    return actual.readFile(path, encoding);
  } };
});
it('loads the published synthetic example through the real loader and production validator', async () => {
  const file = fileURLToPath(new URL('../../../../../../../../docs/integration/examples/routed-declarations.example.json', import.meta.url));
  const bundle = await loadDeclarationBundle(file);
  expect(bundle.endpointOwners['syn.legacy']).toBe('/synthetic/legacy');
  expect(bundle.endpoints).toHaveLength(3); expect(Object.keys(bundle.targets ?? {})).toHaveLength(3);
  const setup = await loadMenuDeclarationSetup(withMenuSnapshotFile({ ...loadConfig(), MENU_DECLARATIONS_FILE: file, MENU_UPSTREAM_BASE_URL: 'https://synthetic.invalid', MENU_IDENTITY_KEY_FILE: '/synthetic/key', MENU_IDENTITY_KEY_ID: 'syn-key' }), { checkService: {} as CheckService });
  expect(setup?.menuDispatch[0]?.endpoints).toHaveLength(3);
  expect(JSON.stringify(setup?.targetSecrets)).not.toContain('postgres://');
});
