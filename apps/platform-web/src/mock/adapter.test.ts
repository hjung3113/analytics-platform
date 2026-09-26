import { describe, expect, it } from 'vitest';
import { mockAdapter } from './adapter';
import { getRole, matchesCondition, setRole } from './server';
import { EQUIPMENT, USERS, type RoleId } from './world';

/** The pre-adapter GlobalContextBar computed this in the browser; the server-side evaluation must agree. */
function clientSide(role: RoleId, scopeId: string, roomNames: string[] | null, condition: Parameters<typeof matchesCondition>[1], selection: string[] | null) {
  const granted = USERS[role].grants[scopeId] ?? [];
  const pool = EQUIPMENT.filter(e => e.site === scopeId && granted.includes(e.room) && (roomNames === null || roomNames.includes(e.room)));
  const inCondition = pool.filter(e => matchesCondition(e, condition)).map(e => e.equipmentId);
  return { inCondition, outOfCondition: (selection ?? []).filter(id => !inCondition.includes(id)) };
}

describe('mockAdapter.evaluateSelection', () => {
  it('matches the former client-side computation across roles, rooms and conditions', async () => {
    const before = getRole();
    try {
      const stgroup = EQUIPMENT.find(e => e.site === 'ICH')!.stgroup;
      const someId = EQUIPMENT.find(e => e.site === 'ICH' && e.room === 'DIF-202')!.equipmentId; // DIF-202 is granted to admin only
      for (const role of ['engineer', 'admin', 'viewer'] as const) {
        setRole(role);
        for (const [roomNames, condition] of [[null, null], [['PH-101'], null], [null, { axis: 'stgroup' as const, id: stgroup }]] as const) {
          const selection = [someId, 'NOPE-1'];
          const got = await mockAdapter.evaluateSelection({ scopeId: 'ICH', roomNames: roomNames ? [...roomNames] : null, condition, selection });
          const want = clientSide(role, 'ICH', roomNames ? [...roomNames] : null, condition, selection);
          expect({ inCondition: got.inCondition.map(e => e.equipmentId), outOfCondition: got.outOfCondition }).toEqual(want);
        }
      }
    } finally {
      setRole(before);
    }
  });

  it('returns per-site condition choices', async () => {
    const got = await mockAdapter.contextOptions('ICH');
    expect(got.stgroup.length).toBeGreaterThan(0);
    expect(got.team.length).toBeGreaterThan(0);
    expect(got.makerModel.every(m => m.maker && m.model)).toBe(true);
  });
});
