import { generateKeyPairSync } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { expect, it, vi } from 'vitest';
import { loadConfig } from '../../../../../config.js';
import { loadMenuDeclarationSetup } from '../../../../../menu-declarations.js';
import type { CheckService } from '../../../../permissions/check-service.js';
import { loadDeclarationBundle } from '../../../declarations-file.js';
import { bundleSnapshotCheck, loadMenuSnapshot } from '../../../menu-snapshot.js';

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
  // The example's endpoint rows are `{ id }` (+ deployment-owned `limits`); the rest comes from its synthetic snapshot (#1900 node 1900b).
  const snapshotFile = fileURLToPath(new URL('../../../../../../../../docs/integration/examples/routed-declarations.example.snapshot.json', import.meta.url));
  const bundle = await loadDeclarationBundle(file, bundleSnapshotCheck(await loadMenuSnapshot(snapshotFile)));
  expect(bundle.endpointOwners['syn.legacy']).toBe('/synthetic/legacy');
  expect(bundle.endpoints).toHaveLength(4); expect(bundle.endpoints.find((row) => row.id === 'syn.shared')).toMatchObject({ menuId: 'syn', permission: 'syn:view', requiresScope: true, context: { roomNames: 'apply' }, kinds: ['collection'], limits: { maxRows: 100 } }); expect(Object.keys(bundle.targets ?? {})).toHaveLength(4);
  expect(bundle.targets?.procedural).toMatchObject({ dialect: 'mssql' });
  const setup = await loadMenuDeclarationSetup({ ...loadConfig(), MENU_DECLARATIONS_FILE: file, MENU_DECLARATIONS_SNAPSHOT_FILE: snapshotFile, MENU_UPSTREAM_BASE_URL: 'https://synthetic.invalid', MENU_IDENTITY_KEY_FILE: '/synthetic/key', MENU_IDENTITY_KEY_ID: 'syn-key' }, { checkService: {} as CheckService });
  expect(setup?.menuDispatch[0]?.endpoints).toHaveLength(4);
  expect(JSON.stringify(setup?.targetSecrets)).not.toContain('postgres://');
});
