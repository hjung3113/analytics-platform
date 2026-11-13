// ADR-0157 decisions 1–3 at the bundle boundary (#1902): the loader and the programmatic contribution refuse a bundle whose
// capability rows or permission rows break the rules, and accept an unused declared capability. Synthetic names only.

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { capabilitiesOf, createCheckService, type CheckService } from '../../permissions/check-service.js';
import { menuSnapshotFor } from '../../../test-support/menu-snapshot.js';
import { DeclarationBundleError, loadDeclarationBundle, type DeclarationBundle } from '../declarations-file.js';
import { declaredContribution } from '../declared-endpoints.js';
import type { MenuForwarder } from '../forwarder.js';

const bundleWith = (over: Record<string, unknown>) => ({
  endpoints: [{
    id: 'synthetic.rows', menuId: 'synthetic', paramKeys: ['q'], permission: 'widget:annotate',
    requiresScope: false, context: { time: 'apply' }, mergeTimeDomain: false,
  }],
  actions: [],
  permissions: [{ permission: 'widget:annotate', capability: 'ext.widget.annotate' }],
  capabilities: [{ id: 'ext.widget.annotate' }],
  endpointOwners: { 'synthetic.rows': '/upstream/synthetic/rows' },
  ...over,
});

describe('bundle capability rows (ADR-0157)', () => {
  let dir: string;
  beforeAll(async () => { dir = await mkdtemp(join(tmpdir(), 'ap-declared-capabilities-')); });
  afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

  const load = async (name: string, value: unknown) => {
    const path = join(dir, name);
    await writeFile(path, JSON.stringify(value));
    return loadDeclarationBundle(path);
  };
  const refusal = async (name: string, value: unknown) => {
    const error = await load(name, value).then(() => null, (caught: unknown) => caught);
    expect(error).toBeInstanceOf(DeclarationBundleError);
    return (error as Error).message;
  };

  it('loads a permission row on a declared capability, and an unused declared capability is not a boot failure', async () => {
    const bundle = await load('ok.json', bundleWith({ capabilities: [{ id: 'ext.widget.annotate' }, { id: 'ext.widget.retired' }] }));
    expect(bundle.capabilities?.map((row) => row.id)).toEqual(['ext.widget.annotate', 'ext.widget.retired']);
  });

  it.each([
    ['an id without the reserved prefix', { capabilities: [{ id: 'widget.annotate' }], permissions: [{ permission: 'widget:annotate', capability: 'workspace.read' }] }, /widget\.annotate: must match ext/],
    ['an id equal to a platform capability', { capabilities: [{ id: 'workspace.read' }], permissions: [{ permission: 'widget:annotate', capability: 'workspace.read' }] }, /workspace\.read: is a platform capability/],
    ['an id equal to a token-only scope', { capabilities: [{ id: 'validation.worker' }], permissions: [{ permission: 'widget:annotate', capability: 'workspace.read' }] }, /validation\.worker: is a token-only scope/],
    ['a tokenOnly field', { capabilities: [{ id: 'ext.widget.annotate', tokenOnly: true }] }, /tokenOnly/],
    ['a bypass without admin on the allow-list', { capabilities: [{ id: 'ext.widget.annotate', adminModuleBypass: 'always', roleLevels: ['developer'] }] }, /requires admin in roleLevels/],
    ['a permission row on scope.read', { permissions: [{ permission: 'widget:annotate', capability: 'scope.read' }] }, /scope\.read cannot open a menu permission/],
    ['a permission row on an undeclared name', { capabilities: [], permissions: [{ permission: 'widget:annotate', capability: 'ext.widget.annotate' }] }, /ext\.widget\.annotate is not a platform capability nor declared/],
    ['a display name over the length cap', { capabilities: [{ id: 'ext.widget.annotate', displayName: 'x'.repeat(81) }] }, /capabilities\.0\.displayName/],
  ])('refuses %s', async (_label, over, message) => {
    expect(await refusal(`bad-${Math.random().toString(36).slice(2)}.json`, bundleWith(over))).toMatch(message);
  });
});

describe('the contribution carries one registry shared with its check service (decision 7)', () => {
  const bundle = bundleWith({}) as unknown as DeclarationBundle;
  const snapshot = menuSnapshotFor(bundle);

  it('builds the check service from the bundle registry and carries the same object', () => {
    let seen: unknown = null;
    const contribution = declaredContribution({
      bundle, snapshot, forwarder: {} as MenuForwarder,
      checkService: (capabilities) => { seen = capabilities; return createCheckService({ db: {} as never, capabilities }); },
    });
    expect(contribution.capabilities).toBe(seen);
    expect(contribution.capabilities?.has('ext.widget.annotate')).toBe(true);
    expect(contribution.permissions).toEqual([{ permission: 'widget:annotate', capability: 'ext.widget.annotate' }]);
  });

  it('refuses a ready check service that was built without the bundle registry', () => {
    const foreign = createCheckService({ db: {} as never });
    expect(capabilitiesOf(foreign).has('ext.widget.annotate')).toBe(false);
    expect(() => declaredContribution({ bundle, snapshot, forwarder: {} as MenuForwarder, checkService: foreign as CheckService }))
      .toThrow(/check service built from the bundle registry/);
  });

  it('refuses a programmatic permission row on scope.read or an undeclared name', () => {
    for (const capability of ['scope.read', 'ext.widget.other']) {
      const bad = bundleWith({ permissions: [{ permission: 'widget:annotate', capability }] }) as unknown as DeclarationBundle;
      expect(() => declaredContribution({ bundle: bad, snapshot: menuSnapshotFor(bad), forwarder: {} as MenuForwarder, checkService: (c) => createCheckService({ db: {} as never, capabilities: c }) }))
        .toThrow(/not a platform capability nor declared/);
    }
  });
});
