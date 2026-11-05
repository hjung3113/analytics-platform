import { describe, expect, it } from 'vitest';

import { improvementItemTarget } from './improvement-links';

const ITEM = '99999999-9999-4999-8999-999999999999';

describe('improvementItemTarget', () => {
  it.each([
    ['the bare notification deep link', `/improvement-items/${ITEM}`, { menuId: 'improvement-item', params: { itemId: ITEM } }],
  ])('maps %s to the 개선 아이템 상세 menu', (_name, to, target) => {
    expect(improvementItemTarget(to)).toEqual(target);
  });

  it.each([
    ['a non-uuid id', '/improvement-items/im-not-a-uuid'],
    ['the list menu', '/improvement-items'],
    ['a path with a trailing segment', `/improvement-items/${ITEM}/extra`],
    ['a hash link', `/improvement-items/${ITEM}#effect`],
    ['a link with a query', `/improvement-items/${ITEM}?view=all`],
    ['another feature path', `/tasks?view=board&param=${ITEM}`],
  ])('leaves %s unlinked', (_name, to) => {
    expect(improvementItemTarget(to)).toBeNull();
  });
});
