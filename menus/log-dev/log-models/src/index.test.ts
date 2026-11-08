import { expect, it } from 'vitest';
import { manifests } from './index';
import { Cpu, Factory, GitBranch, Package } from 'lucide-react';
import { createRegistry } from '@ap/kernel';
import { groupId } from '@ap/contracts';

it('registers table and request menus with hidden stable-ID project/Round children', () => {
  expect(manifests.filter(m => !m.navHidden).map(m => m.id)).toEqual(['log-models', 'log-validation-requests']);
  expect(manifests.find(m => m.id === 'log-model-project')).toMatchObject({ parent: 'log-models', navHidden: true, path: '/log/models/:projectId' });
  expect(manifests.find(m => m.id === 'log-model-round')).toMatchObject({ parent: 'log-models', navHidden: true, path: '/log/models/:projectId/rounds/:roundId' });
  expect(manifests.every(m => m.requiresScope === false && m.component)).toBe(true);
});

it('declares a valid tree consumer with four menu-owned icons and stable object page keys', () => {
  const menu = manifests.find(m => m.id === 'log-models')!;
  expect(menu.navTree).toMatchObject({ mode: 'tree', label: { ko: '모델 계층', en: 'Model hierarchy' } });
  expect(['vendor', 'process', 'model', 'software'].map(k => menu.navTree?.levelIcon?.(k))).toEqual([Factory, GitBranch, Cpu, Package]);
  expect(menu.navTree?.levelIcon?.('unknown')).toBeUndefined();
  expect(menu.pageKeys).toContain('modelId');
  for (const id of ['log-model-project', 'log-model-round']) expect(manifests.find(m => m.id === id)?.pageKeys).toContain('node');
  expect(() => createRegistry({ spaces: [], groups: [{ id: groupId('logModels'), space: null, label: { ko: '모델', en: 'Models' }, icon: Cpu }], menus: manifests })).not.toThrow();
});
