import { expect, it } from 'vitest';
import { createOriginHistory, originPosition, type OriginRecord } from '../return-origin';
import { createRegistry } from '../../registry/registry';

it('discards all forward records when a successful push branches from history', () => {
  const history = createOriginHistory(createRegistry({ spaces: [], groups: [], menus: [] }), () => true);
  const segment = 'active';
  const record: OriginRecord = {
    returnTo: '/source', sourceMenuId: 'source', scopeId: null, carried: {},
    destination: { menuId: 'detail', params: {}, selectors: [] },
  };
  for (const index of [1, 2, 3, 4]) {
    history.entries.set(originPosition(segment, index), { index, url: '/detail', record });
  }

  history.pruneForward(2);

  expect([...history.entries.keys()]).toEqual([originPosition(segment, 1)]);
});
