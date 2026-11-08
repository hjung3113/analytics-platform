import { expect, it } from 'vitest';
import { manifests } from './index';

it('registers table and request menus with hidden stable-ID project/Round children', () => {
  expect(manifests.filter(m => !m.navHidden).map(m => m.id)).toEqual(['log-models', 'log-validation-requests']);
  expect(manifests.find(m => m.id === 'log-model-project')).toMatchObject({ parent: 'log-models', navHidden: true, path: '/log/models/:projectId' });
  expect(manifests.find(m => m.id === 'log-model-round')).toMatchObject({ parent: 'log-models', navHidden: true, path: '/log/models/:projectId/rounds/:roundId' });
  expect(manifests.every(m => m.requiresScope === false && m.component)).toBe(true);
});
