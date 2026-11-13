import { describe, expect, it } from 'vitest';
import { operatorHostLinks } from './operator-links';

describe('operatorHostLinks: requester page', () => {
  it('links /permission-requests (the duplicate-request notice reaches it from an operator screen) and only that exact path', () => {
    expect(operatorHostLinks.canLink('/permission-requests')).toBe(true);
    expect(operatorHostLinks.targetOf('/permission-requests')).toEqual({ menuId: 'permission-requests' });
    expect(operatorHostLinks.canLink('/permission-requests?x=1')).toBe(false);
  });
});
