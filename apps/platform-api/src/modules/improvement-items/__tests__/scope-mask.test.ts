import { describe, expect, it } from 'vitest';
import { maskChanges } from '../scope-mask.js';

const grants = [{ site: 'A', rooms: ['ROOM'] }];
const target = { kind: 'equipment', externalKey: 'PRIVATE-EQ', displayName: 'PRIVATE-NAME' };
const origin = (scopeId: string) => ({ menuId: 'cycle-time', context: { scopeId, selection: ['PRIVATE-EQ'] } });
const link = (site: string) => `/mars/cycle-time?scopeId=${site}&selection=PRIVATE-EQ`;

describe('historical Scope projection', () => {
  it('recurses through arbitrary event keys and arrays without changing stored payloads', () => {
    const changes = { extra: [{ snapshot: { origin: origin('B'), targets: [target], effectCompareLink: link('B'), effect: { compareLink: link('B'), note: 'keep note' } } }] };
    const stored = structuredClone(changes);
    expect(maskChanges(changes, grants)).toEqual({ extra: [{ snapshot: {
      restricted: true, origin: { menuId: 'cycle-time', context: {}, restricted: true },
      targets: [{ kind: 'equipment', externalKey: '', displayName: '' }],
      effectCompareLink: null, effect: { compareLink: null, note: 'keep note' },
    } }] });
    expect(changes).toEqual(stored);
  });

  it('uses each before/after Site and validates nested comparison links against their own Site', () => {
    const changes = { before: { origin: origin('B'), targets: [target] }, after: {
      origin: origin('A'), targets: [target], effect: { compareLink: link('A'), note: 'keep note' },
      extra: [{ effectCompareLink: link('B') }],
    } };
    expect(maskChanges(changes, grants)).toMatchObject({
      before: { restricted: true, targets: [{ externalKey: '', displayName: '' }] },
      after: { origin: origin('A'), targets: [target], effect: { compareLink: link('A'), note: 'keep note' }, extra: [{ effectCompareLink: null }] },
    });
  });

  it('does not let a granted outer origin authorize partial before/after snapshots', () => {
    expect(maskChanges({ origin: origin('A'), before: { targets: [target] }, after: { effect: { compareLink: link('A'), result: 'effective' } } }, grants)).toMatchObject({
      before: { restricted: true, targets: [{ externalKey: '', displayName: '' }] },
      after: { restricted: true, effect: { compareLink: null, result: 'effective' } },
    });
  });
});
