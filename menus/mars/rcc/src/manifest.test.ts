import { afterEach, describe, expect, it, vi } from 'vitest';
import { groupId, menuPermission, spaceId } from '@ap/contracts';
import { createRegistry } from '@ap/kernel';
import { RCC_DRILL } from './pageKeys';

describe('RCC prototype registration', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('registers the existing route and shape-changing page keys in mock development', async () => {
    vi.stubEnv('DEV', true);
    vi.stubEnv('MODE', 'development');
    const { manifests } = await import('./index');
    const [entry] = manifests;
    expect(entry).toMatchObject({
      id: 'rcc', path: '/rcc', requiresScope: true,
      context: { time: 'apply', roomNames: 'apply', prcGroup: 'apply', condition: 'apply', selection: 'apply' },
      query: { mode: 'apply', autoApplyDefault: true },
      repeatedPageKeys: ['ppidFilter', 'layerFilter', 'recipeFilter'],
      drill: { levels: [{ key: 'unit' }, { key: 'layer' }, { key: 'step' }], resetKeys: ['equipment'] },
    });
    expect(entry?.pageKeys).not.toContain('variant');
    expect(entry?.contextResetKeys).toEqual(expect.arrayContaining(['unit', 'layer', 'step', 'equipment']));
    expect(entry?.component).toBeDefined();
    const space = spaceId('mars');
    const registry = createRegistry({
      spaces: [{ id: space, label: { ko: 'MARS', en: 'MARS' }, description: { ko: '분석', en: 'Analysis' }, homeMenuId: 'rcc' }],
      groups: [{ id: groupId('rcc'), label: { ko: 'RCC', en: 'RCC' }, icon: entry!.icon, space }],
      menus: manifests, permissions: [menuPermission('analytics:view')],
    });
    expect(registry.menuById('rcc').path).toBe('/mars/rcc');
  });

  it.each([['real', true], ['mock', false], ['production', false]] as const)('keeps RCC planned in %s mode', async (mode, dev) => {
    vi.stubEnv('DEV', dev);
    vi.stubEnv('MODE', mode);
    const { manifests: [entry] } = await import('./index');
    expect(entry?.pageKeys).toEqual([]);
    expect(entry?.context.time).toBe('unsupported');
    expect(entry?.drill).toBeUndefined();
    expect(entry?.component).toBeUndefined();
  });

  it.each([
    ['development', true, { ko: '프로세스 시간 분석', en: 'Process time analysis' }],
    ['real', true, { ko: '프로세스 시간 분석 (예정)', en: 'Process time (planned)' }],
    ['development', false, { ko: '프로세스 시간 분석 (예정)', en: 'Process time (planned)' }],
  ] as const)('shows the appropriate description for %s (DEV=%s)', async (mode, dev, description) => {
    vi.stubEnv('DEV', dev);
    vi.stubEnv('MODE', mode);
    const { manifests: [entry] } = await import('./index');
    expect(entry?.description).toEqual(description);
  });
});

describe('RCC drill labels', () => {
  it.each([
    ['unit', '204-2-042', 'PPID-204 · L2 · RCP-042'],
    ['unit', 'PPID-204', 'PPID-204'],
    ['layer', '204-2-042', 'L2'],
    ['step', '20:3', 'Step 20 / Seq 3'],
    ['step', '55:6', 'Step 55 / Seq 6'],
  ])('labels %s value %s and preserves unknown values', (key, value, label) => {
    const level = RCC_DRILL.levels.find(item => item.key === key);
    expect(level?.valueLabel?.(value, 'ko')).toBe(label);
    expect(level?.valueLabel?.(value, 'en')).toBe(label);
    expect(level?.valueLabel?.('unknown', 'ko')).toBe('unknown');
  });
});
