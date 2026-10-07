import { describe, expect, it } from 'vitest';
import { createMockAdapter } from './adapter';
import { getRole, matchesCondition, setRole, setScenario } from './server';
import { EQUIPMENT, USERS, type RoleId } from './world';

const mockAdapter = createMockAdapter({ endpoints: [], registry: { menus: [] } });

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
      const someId = EQUIPMENT.find(e => e.site === 'ICH' && e.room === 'DIFF')!.equipmentId; // DIFF is granted to admin only
      for (const role of ['engineer', 'admin', 'viewer'] as const) {
        setRole(role);
        for (const [roomNames, condition] of [[null, null], [['PHOTO'], null], [null, { axis: 'stgroup' as const, id: stgroup }]] as const) {
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

  it('returns condition choices only from rooms the session may see', async () => {
    const before = getRole();
    try {
      for (const role of ['engineer', 'admin', 'viewer'] as const) {
        setRole(role);
        const granted = USERS[role].grants.ICH ?? [];
        const visible = EQUIPMENT.filter(e => e.site === 'ICH' && granted.includes(e.room));
        const got = await mockAdapter.contextOptions('ICH');
        expect(got.stgroup).toEqual([...new Set(visible.map(e => e.stgroup))].sort());
        expect(got.team).toEqual([...new Set(visible.map(e => e.team))].sort());
        expect(new Set(got.makerModel.map(m => `${m.maker}/${m.model}`))).toEqual(new Set(visible.map(e => `${e.maker}/${e.model}`)));
      }
      setRole('viewer');
      expect(await mockAdapter.contextOptions('XIA')).toEqual({ stgroup: [], team: [], makerModel: [] }); // no grant
    } finally {
      setRole(before);
    }
  });

  // #242: room names repeat across Sites (PHOTO is in every Site), so a second granted Site must use its own grants
  // and rows. The engineer holds PHOTO/ETCH/CVD in ICH but only PHOTO in CJU.
  it('keeps a second granted Site to its own room grants and rows', async () => {
    const before = getRole();
    try {
      setRole('engineer');
      expect(USERS.engineer.grants.CJU).toEqual(['PHOTO']);
      const cjuPhoto = EQUIPMENT.filter(e => e.site === 'CJU' && e.room === 'PHOTO');
      const cjuEtch = EQUIPMENT.find(e => e.site === 'CJU' && e.room === 'ETCH')!;
      const ichPhoto = EQUIPMENT.find(e => e.site === 'ICH' && e.room === 'PHOTO')!;
      const got = await mockAdapter.evaluateSelection({ scopeId: 'CJU', roomNames: null, condition: null, selection: [cjuEtch.equipmentId, ichPhoto.equipmentId] });
      expect(got.inCondition.map(e => e.equipmentId).sort()).toEqual(cjuPhoto.map(e => e.equipmentId).sort());
      expect(got.outOfCondition).toEqual([cjuEtch.equipmentId, ichPhoto.equipmentId]);
      const options = await mockAdapter.contextOptions('CJU');
      expect(options.stgroup).toEqual([...new Set(cjuPhoto.map(e => e.stgroup))].sort());
      expect(options.stgroup).not.toContain(cjuEtch.stgroup);
    } finally {
      setRole(before);
    }
  });
});

describe('scope_error scenario (#167)', () => {
  it('rejects validateScope and leaves other calls normal', async () => {
    const before = getRole();
    setScenario('scope_error');
    try {
      setRole('engineer');
      await expect(mockAdapter.validateScope('ICH')).rejects.toThrow('Scope check failed (scenario)');
      const got = await mockAdapter.evaluateSelection({ scopeId: 'ICH', roomNames: null, condition: null, selection: [] });
      setScenario('normal');
      expect(got).toEqual(await mockAdapter.evaluateSelection({ scopeId: 'ICH', roomNames: null, condition: null, selection: [] }));
      expect((await mockAdapter.validateScope('ICH')).status).toBe('valid');
    } finally { setScenario('normal'); setRole(before); }
  });

  it('pins the scenario at send time — a later switch to normal does not rescue an in-flight check', async () => {
    const before = getRole();
    try {
      setRole('engineer');
      setScenario('scope_error');
      const failing = mockAdapter.validateScope('ICH');
      setScenario('normal');
      await expect(failing).rejects.toThrow('Scope check failed (scenario)');
    } finally { setScenario('normal'); setRole(before); }
  });

  it('pins the scenario at send time — a later switch to scope_error does not fail an in-flight check', async () => {
    const before = getRole();
    try {
      setRole('engineer');
      setScenario('normal');
      const passing = mockAdapter.validateScope('ICH');
      setScenario('scope_error');
      expect((await passing).status).toBe('valid');
    } finally { setScenario('normal'); setRole(before); }
  });
});
