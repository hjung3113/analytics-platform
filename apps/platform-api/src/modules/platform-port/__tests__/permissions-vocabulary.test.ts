import { describe, expect, it } from 'vitest';

import { eqvContribution } from '../../eqv/index.js';
import { improvementItemsContribution } from '../../improvement-items/item-endpoints.js';
import { logDatasetsContribution } from '../../log-datasets/index.js';
import { investigationContribution } from '../../log-explorer/index.js';
import { logKnowledgeContribution } from '../../log-knowledge/catalog-endpoints.js';
import { logLifecycleContribution } from '../../log-lifecycle/index.js';
import { createMenuDispatchRegistry } from '../../menu-dispatch/registry.js';
import type { MenuDispatchContribution } from '../../menu-dispatch/types.js';
import { PLATFORM_PERMISSION_TABLE, createPlatformPermissionResolver } from '../permissions.js';
import { platformVocab } from './platform-vocab.js';

// ADR-0068 "one vocabulary": the kernel's own permissions (@ap/contracts/vocab.json `kernelPermissions`)
// and this module's table must not drift. The menu permissions of the business modules are not kernel ones: each module
// declares them in its contribution (#1667), and this file asserts what the shipped modules declare.
const kernelPermissions = (): string[] => platformVocab().kernelPermissions;

// Contribution factories only build declarations; none touches its deps until a request runs.
const stubDeps = { db: {}, checkService: {} } as never;
const shippedContributions = (): MenuDispatchContribution[] => [
  logKnowledgeContribution(stubDeps),
  improvementItemsContribution(stubDeps),
  logLifecycleContribution(stubDeps),
  investigationContribution(stubDeps),
  eqvContribution(stubDeps),
  logDatasetsContribution(stubDeps),
];
const declared = () => createMenuDispatchRegistry(shippedContributions()).permissions;

describe('platform permission table vs @ap/contracts KERNEL_PERMISSIONS', () => {
  it('lists every kernel permission exactly once and nothing else', () => {
    const vocabulary = kernelPermissions();
    expect(vocabulary.length).toBeGreaterThan(0);
    const tabled = PLATFORM_PERMISSION_TABLE.map((entry) => entry.permission as string);
    expect([...tabled].sort()).toEqual([...vocabulary].sort());
    for (const permission of vocabulary) {
      expect(
        tabled.filter((p) => p === permission),
        permission,
      ).toHaveLength(1);
    }
  });

  it('names the feature permission features:access and keeps no feedbackops:access fallback', () => {
    const tabled = PLATFORM_PERMISSION_TABLE.map((entry) => entry.permission as string);
    expect(tabled).toContain('features:access');
    expect(tabled).not.toContain('feedbackops:access');
    expect(kernelPermissions()).not.toContain('feedbackops:access');
  });
});

describe('menu permissions the modules declare (#1667)', () => {
  it.each([
    ['knowledge:catalog-manage', 'knowledge.catalog.manage'],
    ['knowledge:item-publish', 'knowledge.item.publish'],
    ['knowledge:spec-publish', 'knowledge.spec.publish'],
    ['improvement:manage', 'improvement.manage'],
    ['lifecycle:project-manage', 'lifecycle.project.manage'],
    ['lifecycle:round-manage', 'lifecycle.round.manage'],
    ['lifecycle:gate-decide', 'lifecycle.gate.decide'],
    ['knowledge:draft-create', 'knowledge.draft.create'],
    ['explorer:investigate', 'explorer.investigate'],
    ['explorer:handoff', 'explorer.handoff'],
    ['dataset:manage', 'dataset.manage'],
    ['dataset:baseline-approve', 'dataset.baseline.approve'],
    ['dataset:suite-run', 'dataset.suite.run'],
    ['knowledge:access-manage', 'knowledge.access.manage'],
    ['eqv:view', 'eqv.view'],
    ['eqv-studio:layout-edit', 'eqv.layout.edit'],
    ['eqv-studio:layout-publish', 'eqv.layout.publish'],
  ] as const)('declares %s once, with the capability %s', (permission, capability) => {
    expect(declared().filter((d) => d.permission === permission)).toEqual([{ permission, capability }]);
    expect(kernelPermissions()).not.toContain(permission);
  });

  it('declares exactly the 17 menu permissions and none twice', () => {
    expect(declared()).toHaveLength(17);
  });

  it('lists the kernel permissions first, then the declared ones in registration order', () => {
    expect(createPlatformPermissionResolver(declared()).order()).toEqual([
      ...PLATFORM_PERMISSION_TABLE.map((e) => e.permission),
      ...declared().map((d) => d.permission),
    ]);
  });

  it('refuses a permission declared twice and a declaration that shadows a kernel permission', () => {
    const twice = { permissions: [{ permission: 'x:y', capability: 'eqv.view' }] } as const;
    expect(() => createMenuDispatchRegistry([twice, twice])).toThrow(/permission x:y: registered twice/);
    expect(() =>
      createMenuDispatchRegistry([{ permissions: [{ permission: 'platform:view', capability: 'eqv.view' }] }]),
    ).toThrow(/platform:view: is a kernel permission/);
  });
});
