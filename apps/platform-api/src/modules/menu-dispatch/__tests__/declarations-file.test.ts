import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PLATFORM_PERMISSION_TABLE } from '../../platform-port/permissions.js';
import { DeclarationBundleError, loadDeclarationBundle } from '../declarations-file.js';

// ADR-0146 decision 6: public tests use synthetic declarations only; no real in-house names.
const validBundle = () => ({
  endpoints: [
    {
      id: 'synthetic.rows',
      menuId: 'synthetic',
      paramKeys: ['q'],
      permission: 'synthetic:view',
      requiresScope: false,
      context: { time: 'apply' },
      mergeTimeDomain: false,
    },
  ],
  actions: [
    {
      id: 'synthetic.save',
      menuId: 'synthetic',
      inputKeys: ['name'],
      permission: 'synthetic:write',
      requiresScope: false,
      concurrency: 'none',
      invalidates: ['synthetic.rows'],
    },
  ],
  permissions: [
    { permission: 'synthetic:view', capability: 'workspace.read' },
    { permission: 'synthetic:write', capability: 'workspace.read' },
  ],
  endpointOwners: { 'synthetic.rows': '/upstream/synthetic/rows' },
});

describe('declaration bundle loader (fail-closed, ADR-0146 decision 4)', () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ap-declaration-bundle-'));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const write = async (name: string, value: unknown) => {
    const path = join(dir, name);
    await writeFile(path, typeof value === 'string' ? value : JSON.stringify(value));
    return path;
  };

  const refusing = async (path: string) => {
    try {
      await loadDeclarationBundle(path);
    } catch (error) {
      expect(error).toBeInstanceOf(DeclarationBundleError);
      return (error as Error).message;
    }
    throw new Error('the bundle was accepted');
  };

  it('loads a valid bundle as plain row data with the owner table', async () => {
    const path = await write('valid.json', validBundle());
    const bundle = await loadDeclarationBundle(path);
    expect(bundle.endpoints).toHaveLength(1);
    expect(bundle.endpoints[0]?.id).toBe('synthetic.rows');
    expect(bundle.actions[0]?.id).toBe('synthetic.save');
    expect(bundle.permissions.map((row) => row.permission)).toEqual(['synthetic:view', 'synthetic:write']);
    expect(bundle.endpointOwners['synthetic.rows']).toBe('/upstream/synthetic/rows');
    // Row data only: the handler is supplied later (node 1729g), so no function may ride along.
    for (const row of [...bundle.endpoints, ...bundle.actions]) {
      expect(Object.values(row).every((value) => typeof value !== 'function')).toBe(true);
    }
  });

  it('refuses a missing file', async () => {
    const message = await refusing(join(dir, 'absent.json'));
    expect(message).toMatch(/absent\.json.*cannot be read/);
  });

  it('refuses a file that is not valid JSON', async () => {
    const path = await write('bad-json.txt', '{not json');
    const message = await refusing(path);
    expect(message).toMatch(/bad-json\.txt.*not valid JSON/);
  });

  it.each([
    ['a missing required field', { endpoints: [{ id: 'synthetic.rows' }] }, /endpoints\.0.*requiresScope/],
    ['an unknown root key', { extra: 1 }, /Unrecognized key.*extra/],
    ['an unknown context key', { endpoints: [{ ...validBundle().endpoints[0], context: { planet: 'apply' } }] }, /Unrecognized key.*planet/],
  ])('refuses a schema error: %s', async (_name, over, pattern) => {
    const path = await write('schema.json', { ...validBundle(), ...over });
    const message = await refusing(path);
    expect(message).toMatch(/schema/);
    expect(message).toMatch(pattern);
  });

  it('refuses limits.maxRows and names the reason', async () => {
    const endpoint = { ...validBundle().endpoints[0], limits: { maxRows: 100 } };
    const path = await write('max-rows.json', { ...validBundle(), endpoints: [endpoint] });
    const message = await refusing(path);
    expect(message).toMatch(/maxRows/);
    expect(message).toMatch(/too_large/);
  });
  it.each([
    ['duplicate endpoint id', { endpoints: [validBundle().endpoints[0], validBundle().endpoints[0]] }, /endpoint synthetic\.rows.*declared 2 times/],
    ['duplicate action id', { actions: [validBundle().actions[0], validBundle().actions[0]] }, /action synthetic\.save.*declared 2 times/],
    ['duplicate permission', { permissions: [...validBundle().permissions, validBundle().permissions[0]] }, /permission synthetic:view.*declared 2 times/],
  ])('refuses %s', async (_name, over, pattern) => {
    const path = await write('duplicate.json', { ...validBundle(), ...over });
    expect(await refusing(path)).toMatch(pattern);
  });

  it('refuses a permission row that shadows a kernel permission', async () => {
    const kernel = PLATFORM_PERMISSION_TABLE[0]?.permission ?? 'platform:view';
    const path = await write('kernel.json', { ...validBundle(), permissions: [{ permission: kernel, capability: 'workspace.read' }] });
    expect(await refusing(path)).toMatch(new RegExp(`permission ${kernel.replace(':', ':')}.*kernel permission`));
  });

  it('refuses a permission row whose capability is not in the platform vocabulary', async () => {
    const path = await write('capability.json', {
      ...validBundle(),
      permissions: [{ permission: 'synthetic:view', capability: 'not.a.capability' }],
    });
    expect(await refusing(path)).toMatch(/not\.a\.capability.*not a platform capability/);
  });

  it('refuses an owner-table row without a matching endpoint', async () => {
    const owners = { ...validBundle().endpointOwners, 'synthetic.gone': '/upstream/gone' };
    const path = await write('orphan-owner.json', { ...validBundle(), endpointOwners: owners });
    expect(await refusing(path)).toMatch(/synthetic\.gone.*not declared/);
  });

  it('refuses an endpoint without an owner-table row', async () => {
    const path = await write('no-owner.json', { ...validBundle(), endpointOwners: {} });
    expect(await refusing(path)).toMatch(/endpoint synthetic\.rows.*no owner-table row/);
  });

  it.each([
    ['endpoint', { endpoints: [{ ...validBundle().endpoints[0], permission: 'ghost:view' }], permissions: [] }, /endpoint synthetic\.rows.*ghost:view/],
    ['action', { actions: [{ ...validBundle().actions[0], permission: 'ghost:write' }], permissions: [validBundle().permissions[0]] }, /action synthetic\.save.*ghost:write/],
  ])('refuses a %s permission that is neither declared nor a kernel permission', async (_name, over, pattern) => {
    const path = await write('permission.json', { ...validBundle(), ...over });
    expect(await refusing(path)).toMatch(pattern);
  });
});
