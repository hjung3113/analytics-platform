import { cleanup, configure, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { TopViewScreen } from '../src/screens/TopViewScreen.js';
import { assessments, createFake, ok } from './test-support.js';
import { contextData, EQUIPMENT, HOST_TIME, pages } from './replay-fixture.js';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
configure({ asyncUtilTimeout: 5000 });
afterEach(cleanup);

// A ready load whose scene preparation still throws: Top View's own replay-error branch, which `stateFor` does not cover.
vi.mock('@eqv/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@eqv/core')>()),
  seekSceneState: () => { throw new Error('scene failed'); },
}));

const OPTIONS_ID = 'eqv.equipment-options';
const CONTEXT_ID = 'eqv.topview-context';

it('a replay error after a ready load keeps the Data Trust status and the notices visible', async () => {
  const unknown = assessments({ coverage: { kind: 'coverage', state: 'unknown' } });
  const fake = createFake({
    path: '/tools/eqv-topview', page: { equipment: EQUIPMENT }, context: HOST_TIME,
    query: async ({ id, params }) => {
      if (id === OPTIONS_ID) return ok({ options: [{ id: EQUIPMENT, label: EQUIPMENT, dataRange: null }] }, []);
      if (id === CONTEXT_ID) return ok(contextData(), unknown);
      const token = (params as { continuationToken?: string }).continuationToken;
      return ok(token === undefined ? pages()[0] : pages()[1], unknown);
    },
  });
  fake.render(TopViewScreen);
  await screen.findByText('Replay 오류: scene failed');
  expect(screen.queryByRole('region', { name: 'Top View' })).toBeNull();
  screen.getByTitle(/일부 상태를 확인하지 못했습니다/);
  const notices = screen.getAllByRole('status').filter((node) => /초안 레이아웃/.test(node.textContent ?? ''));
  expect(notices).toHaveLength(1);
});
