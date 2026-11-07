import { describe, expect, it } from 'vitest';

import { PLATFORM_PERMISSION_TABLE } from '../permissions.js';
import { CATALOG_MENU_PERMISSION } from '../../log-knowledge/catalog-actions.js';
import { ITEM_MENU_PERMISSION } from '../../log-knowledge/item-actions.js';
import { SPEC_MENU_PERMISSION } from '../../log-knowledge/spec-actions.js';
import { IMPROVEMENT_MENU_PERMISSION } from '../../improvement-items/item-actions.js';
import { platformVocab } from './platform-vocab.js';

// ADR-0068 "one vocabulary": the kernel's own permissions (@ap/contracts/vocab.json `kernelPermissions`)
// and this module's table must not drift. An app's menu permissions (ADR-0072) are not in either.
const kernelPermissions = (): string[] => platformVocab().kernelPermissions;

describe('platform permission table vs @ap/contracts KERNEL_PERMISSIONS', () => {
  it('lists every kernel permission exactly once and nothing else', () => {
    const vocabulary = kernelPermissions();
    expect(vocabulary.length).toBeGreaterThan(0);
    // The table also lists the catalog and item menu permissions (#1194 r, #1197 w): a menu permission, not a kernel one.
    const tabled = PLATFORM_PERMISSION_TABLE.map((entry) => entry.permission as string).filter(
      (permission) => permission !== CATALOG_MENU_PERMISSION &&
        permission !== ITEM_MENU_PERMISSION &&
        permission !== SPEC_MENU_PERMISSION &&
        permission !== IMPROVEMENT_MENU_PERMISSION &&
        permission !== 'lifecycle:project-manage' &&
        permission !== 'lifecycle:round-manage' &&
        permission !== 'knowledge:draft-create' &&
        permission !== 'explorer:investigate',
        permission !== 'dataset:manage',
    );
    expect([...tabled].sort()).toEqual([...vocabulary].sort());
    for (const permission of vocabulary) {
      expect(
        tabled.filter((p) => p === permission),
        permission,
      ).toHaveLength(1);
    }
  });

  it('lists the catalog menu permission once, with the rule the write actions use', () => {
    const entries = PLATFORM_PERMISSION_TABLE.filter((entry) => entry.permission === CATALOG_MENU_PERMISSION);
    expect(entries).toEqual([{ permission: 'knowledge:catalog-manage', rule: 'catalog-manage' }]);
    expect(kernelPermissions()).not.toContain(CATALOG_MENU_PERMISSION);
  });

  it('lists the item menu permission once, with the rule the item write actions use', () => {
    const entries = PLATFORM_PERMISSION_TABLE.filter((entry) => entry.permission === ITEM_MENU_PERMISSION);
    expect(entries).toEqual([{ permission: 'knowledge:item-publish', rule: 'item-publish' }]);
    expect(kernelPermissions()).not.toContain(ITEM_MENU_PERMISSION);
  });

  it('lists the spec menu permission once, with the rule the spec write actions use', () => {
    const entries = PLATFORM_PERMISSION_TABLE.filter((entry) => entry.permission === SPEC_MENU_PERMISSION);
    expect(entries).toEqual([{ permission: 'knowledge:spec-publish', rule: 'spec-publish' }]);
    expect(kernelPermissions()).not.toContain(SPEC_MENU_PERMISSION);
  });

  it('lists the improvement menu permission once, with the rule the improvement write actions use', () => {
    const entries = PLATFORM_PERMISSION_TABLE.filter((entry) => entry.permission === IMPROVEMENT_MENU_PERMISSION);
    expect(entries).toEqual([{ permission: 'improvement:manage', rule: 'improvement-manage' }]);
    expect(kernelPermissions()).not.toContain(IMPROVEMENT_MENU_PERMISSION);
  });

  it.each([
    ['lifecycle:project-manage', 'lifecycle-project-manage'],
    ['lifecycle:round-manage', 'lifecycle-round-manage'],
    ['knowledge:draft-create', 'draft-create'],
    ['explorer:investigate', 'explorer-investigate'],
    ['dataset:manage', 'dataset-manage'],
  ] as const)('lists the lifecycle and draft menu permission %s once, with the rule %s', (permission, rule) => {
    const entries = PLATFORM_PERMISSION_TABLE.filter((entry) => entry.permission === permission);
    expect(entries).toEqual([{ permission, rule }]);
    expect(kernelPermissions()).not.toContain(permission);
  });

  it('names the feature permission features:access and keeps no feedbackops:access fallback', () => {
    const tabled = PLATFORM_PERMISSION_TABLE.map((entry) => entry.permission as string);
    expect(tabled).toContain('features:access');
    expect(tabled).not.toContain('feedbackops:access');
    expect(kernelPermissions()).not.toContain('feedbackops:access');
  });
});
