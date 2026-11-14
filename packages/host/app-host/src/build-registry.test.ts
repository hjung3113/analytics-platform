import { describe, expect, it } from 'vitest';
import { menuPermission } from '@ap/contracts';
import { RegistryError } from '@ap/kernel';
import { buildRegistry } from './build-registry';
import { testDeclarations, testMenu } from './test-support';

describe('buildRegistry', () => {
  it('returns the Kernel registry for valid declarations', () => {
    const registry = buildRegistry(testDeclarations());
    expect(registry.menus.map(menu => menu.id)).toEqual(['first']);
  });

  it('throws the Kernel message for a duplicate menu id, synchronously', () => {
    const declarations = testDeclarations({ menus: [testMenu('first'), testMenu('first', { path: '/other' })] });
    expect(() => buildRegistry(declarations)).toThrow(RegistryError);
    expect(() => buildRegistry(declarations)).toThrow('Duplicate menu id "first"');
  });

  it('throws the Kernel message for a permission the declarations never declared', () => {
    const declarations = testDeclarations({ permissions: [], menus: [testMenu('first', { permission: menuPermission('equipment:view') })] });
    expect(() => buildRegistry(declarations)).toThrow(RegistryError);
    expect(() => buildRegistry(declarations)).toThrow(/equipment:view/);
  });
});
