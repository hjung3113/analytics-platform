import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMockAdapter } from '../../adapter';
import { setRole } from '../../server';
import { EQUIPMENT, USERS } from '../../world';

const adapter = createMockAdapter({ endpoints: [], registry: { menus: [] } });
const input = { scopeId: 'MEM', roomNames: null, lineNames: null, prcGroups: null, condition: null, membershipBasis: null, limit: 1 } as const;
beforeEach(() => setRole('engineer'));
afterEach(() => setRole('engineer'));

describe('selection metadata ports', () => {
  it('pages authorized candidates, reports authorized total, and resolves ordered deduplicated statuses without disclosing other sites', async () => {
    const first = await adapter.searchEquipment(input);
    const next = await adapter.searchEquipment({ ...input, cursor: first.nextCursor });
    expect(first.items).toHaveLength(1);
    expect(next.items).toHaveLength(1);
    expect(first.items[0].equipmentId).not.toBe(next.items[0].equipmentId);
    expect(first.total).toBe(EQUIPMENT.filter(e => e.site === 'MEM' && USERS.engineer.grants.MEM.includes(e.room)).length);
    const denied = EQUIPMENT.find(e => e.site === 'MEM' && e.room === 'DIFF')!.equipmentId;
    const foreign = EQUIPMENT.find(e => e.site === 'FDRY')!.equipmentId;
    const id = first.items[0].equipmentId;
    expect((await adapter.resolveSelection({ scopeId: 'MEM', ids: [id, denied, foreign, 'absent', id] })).items).toEqual([
      { id, status: 'ok', summary: first.items[0] }, { id: denied, status: 'forbidden' },
      { id: foreign, status: 'not_found' }, { id: 'absent', status: 'not_found' },
    ]);
  });
});

it('narrows dependent options, honors empty parents, and never lists denied-room-only values', async () => {
  const result = await adapter.listAxisOptions({ scopeId: 'MEM', axisId: 'model', parents: { maker: ['TEL'] }, limit: 200 });
  expect(result.items.length).toBeGreaterThan(0);
  expect(result.items.every(v => ['Tactras', 'Lithius-Pro'].includes(v.id))).toBe(true);
  expect((await adapter.listAxisOptions({ scopeId: 'MEM', axisId: 'model', parents: { maker: [] }, limit: 200 })).items).toEqual([]);
  const stgroups = await adapter.listAxisOptions({ scopeId: 'MEM', axisId: 'stgroup', limit: 200 });
  expect(stgroups.items.some(v => v.id.includes('DIFF'))).toBe(false);
  const narrowed = await adapter.listAxisOptions({ scopeId: 'MEM', axisId: 'model', query: 'LITHIUS', limit: 200 });
  expect(narrowed.items).toEqual([{ id: 'Lithius-Pro', label: 'Lithius-Pro' }]);
});

it('clamps integer limits and preserves null versus empty filters', async () => {
  expect((await adapter.searchEquipment({ ...input, limit: -20 })).items).toHaveLength(1);
  expect((await adapter.searchEquipment({ ...input, roomNames: [] })).items).toEqual([]);
  expect((await adapter.searchEquipment({ ...input, lineNames: [] })).items).toEqual([]);
  expect((await adapter.searchEquipment({ ...input, prcGroups: [] })).items).toEqual([]);
  const rows = Array.from({ length: 205 }, (_, i) => ({ ...EQUIPMENT[0], equipmentId: `ZZ-${i.toString().padStart(4, '0')}` }));
  EQUIPMENT.push(...rows);
  try { expect((await adapter.searchEquipment({ ...input, limit: 999 })).items).toHaveLength(200); }
  finally { EQUIPMENT.splice(EQUIPMENT.length - rows.length, rows.length); }
});

it.each([
  ['scopeId', null], ['scopeId', ' '], ['roomNames', 'PHOTO'], ['lineNames', [null]], ['prcGroups', [1]],
  ['condition', []], ['condition', {}], ['condition', { maker: [] }], ['condition', { maker: [''] }],
  ['membershipBasis', 'current'], ['query', null], ['query', []], ['cursor', ''], ['cursor', 4],
  ['limit', NaN], ['limit', Infinity], ['limit', 1.5], ['limit', '10'], ['extra', true],
])('rejects invalid search %s=%j', async (field, value) => {
  await expect(adapter.searchEquipment({ ...input, [field]: value } as never)).rejects.toMatchObject({ code: 'invalid_input' });
});
it.each([null, [], 'bad', {}])('rejects invalid outer input %j on all ports', async value => {
  await expect(adapter.searchEquipment(value as never)).rejects.toMatchObject({ code: 'invalid_input' });
  await expect(adapter.listAxisOptions(value as never)).rejects.toMatchObject({ code: 'invalid_input' });
  await expect(adapter.resolveSelection(value as never)).rejects.toMatchObject({ code: 'invalid_input' });
});
it.each([
  ['axisId', null], ['axisId', ''], ['parents', []], ['parents', null], ['parents', { maker: '' }], ['parents', { maker: [null] }],
  ['parents', { team: ['x'] }], ['query', 5], ['cursor', false], ['limit', undefined], ['extra', true],
])('rejects invalid options %s', async (field, value) => {
  await expect(adapter.listAxisOptions({ scopeId: 'MEM', axisId: 'model', limit: 1, [field]: value } as never)).rejects.toMatchObject({ code: 'invalid_input' });
});
it.each([null, '', [1], [' ']])('rejects invalid resolution IDs %j', async value => {
  await expect(adapter.resolveSelection({ scopeId: 'MEM', ids: value } as never)).rejects.toMatchObject({ code: 'invalid_input' });
});
it('rejects unknown axes, scopes and explicit denied room filters, with no equipment-view requirement', async () => {
  await expect(adapter.listAxisOptions({ scopeId: 'MEM', axisId: 'unknown', limit: 1 })).rejects.toMatchObject({ code: 'unknown_axis' });
  await expect(adapter.searchEquipment({ ...input, condition: { unknown: ['x'] } })).rejects.toMatchObject({ code: 'unknown_axis' });
  await expect(adapter.searchEquipment({ ...input, roomNames: ['DIFF'] })).rejects.toMatchObject({ code: 'room_forbidden' });
  for (const scopeId of ['unknown', 'XIA']) {
    const code = scopeId === 'unknown' ? 'unknown_scope' : 'scope_forbidden';
    await expect(adapter.searchEquipment({ ...input, scopeId })).rejects.toMatchObject({ code });
    await expect(adapter.listAxisOptions({ scopeId, axisId: 'model', limit: 1 })).rejects.toMatchObject({ code });
    await expect(adapter.resolveSelection({ scopeId, ids: [] })).rejects.toMatchObject({ code });
  }
  setRole('viewer');
  expect((await adapter.searchEquipment(input)).items.length).toBe(1);
  expect((await adapter.listAxisOptions({ scopeId: 'MEM', axisId: 'model', limit: 1 })).items.length).toBe(1);
});
it.each([null, { from: '2026-02-30T00:00:00', to: '2026-03-01T00:00:00' }, { from: '2026-01-01T00:00:00Z', to: '2026-02-01T00:00:00' }, { from: '2026-02-01T00:00:00', to: '2026-01-01T00:00:00' }, { from: '2026-01-01T00:00:00' }])('rejects invalid/missing asOf period %j', async period => {
  await expect(adapter.searchEquipment({ ...input, membershipBasis: 'asOf', condition: { maker: ['TEL'] }, period } as never)).rejects.toMatchObject({ code: 'invalid_period' });
  await expect(adapter.listAxisOptions({ scopeId: 'MEM', axisId: 'model', membershipBasis: 'asOf', period, limit: 1 } as never)).rejects.toMatchObject({ code: 'invalid_period' });
});
it('rejects unsupported target/parent/condition and PRC history; configured history-capable axes use current mock membership', async () => {
  const period = { from: '2026-01-01T00:00:00', to: '2026-02-01T00:00:00' };
  await expect(adapter.listAxisOptions({ scopeId: 'MEM', axisId: 'model', membershipBasis: 'asOf', period, limit: 1 })).rejects.toMatchObject({ code: 'membership_basis_unsupported' });
  await expect(adapter.searchEquipment({ ...input, condition: { maker: ['TEL'] }, membershipBasis: 'asOf', period })).rejects.toMatchObject({ code: 'membership_basis_unsupported' });
  await expect(adapter.searchEquipment({ ...input, prcGroups: ['P'], membershipBasis: 'asOf', period })).rejects.toMatchObject({ code: 'membership_basis_unsupported' });
  const configured = createMockAdapter({ endpoints: [], registry: { menus: [] }, equipmentAxes: [
    { id: 'maker', label: { ko: 'M', en: 'M' }, membershipHistory: false },
    { id: 'model', label: { ko: 'V', en: 'V' }, membershipHistory: true, dependsOn: 'maker' },
  ] });
  await expect(configured.listAxisOptions({ scopeId: 'MEM', axisId: 'model', parents: { maker: ['TEL'] }, membershipBasis: 'asOf', period, limit: 1 })).rejects.toMatchObject({ code: 'membership_basis_unsupported' });
  expect((await configured.listAxisOptions({ scopeId: 'MEM', axisId: 'model', membershipBasis: 'asOf', period, limit: 1 })).items).toHaveLength(1);
});
it('binds cursors to inputs and authorization, permits limit changes, and keysets across deletion/insertion', async () => {
  const first = await adapter.searchEquipment(input);
  for (const patch of [{ query: 'a' }, { scopeId: 'FDRY' }, { roomNames: ['PHOTO'] }, { cursor: 'malformed' }]) {
    await expect(adapter.searchEquipment({ ...input, cursor: first.nextCursor, ...patch })).rejects.toMatchObject({ code: 'invalid_cursor' });
  }
  const removed = EQUIPMENT.splice(EQUIPMENT.findIndex(e => e.equipmentId === first.items[0].equipmentId), 1)[0];
  const inserted = { ...removed, equipmentId: 'AAA-insert' };
  EQUIPMENT.unshift(inserted);
  try {
    const next = await adapter.searchEquipment({ ...input, cursor: first.nextCursor, limit: 200 });
    expect(next.items.some(e => e.equipmentId === first.items[0].equipmentId)).toBe(false);
    expect(next.items.length).toBe(first.total! - 1);
    expect(next.nextCursor).toBe(null);
  } finally { EQUIPMENT.shift(); EQUIPMENT.push(removed); }
  setRole('viewer');
  await expect(adapter.searchEquipment({ ...input, cursor: first.nextCursor })).rejects.toMatchObject({ code: 'invalid_cursor' });
  setRole('engineer');
  await expect(adapter.searchEquipment({ ...input, cursor: first.nextCursor })).rejects.toMatchObject({ code: 'invalid_cursor' });
});

it('rechecks grants between pages and preserves new-port AND/OR/filter semantics', async () => {
  const first = await adapter.searchEquipment(input);
  const rooms = USERS.engineer.grants.MEM;
  USERS.engineer.grants.MEM = [];
  try {
    await expect(adapter.searchEquipment({ ...input, cursor: first.nextCursor })).rejects.toMatchObject({ code: 'scope_forbidden' });
    await expect(adapter.listAxisOptions({ scopeId: 'MEM', axisId: 'model', limit: 1 })).rejects.toMatchObject({ code: 'scope_forbidden' });
    await expect(adapter.resolveSelection({ scopeId: 'MEM', ids: [first.items[0].equipmentId] })).rejects.toMatchObject({ code: 'scope_forbidden' });
  } finally { USERS.engineer.grants.MEM = rooms; }
  const row = EQUIPMENT.find(e => e.site === 'MEM' && e.room === 'PHOTO')!;
  const result = await adapter.searchEquipment({ ...input, roomNames: ['PHOTO'], lineNames: [row.line], prcGroups: [row.prcGroup], condition: { maker: [row.maker, 'other'], model: [row.model] }, limit: 200 });
  expect(result.items.some(e => e.equipmentId === row.equipmentId)).toBe(true);
  expect(result.items.every(e => e.room === 'PHOTO' && e.axes.maker.includes(row.maker) && e.axes.model.includes(row.model))).toBe(true);
  expect((await adapter.searchEquipment({ ...input, query: row.equipmentId.toLowerCase() })).items.map(e => e.equipmentId)).toEqual([row.equipmentId]);
});

it('supports multi-level parents without requiring every parent, and rejects unrelated/unknown parents', async () => {
  const axes = ['maker', 'model', 'chamberType'].map((id, n, ids) => ({ id, label: { ko: id, en: id }, membershipHistory: true, ...(n ? { dependsOn: ids[n - 1] } : {}) }));
  const configured = createMockAdapter({ endpoints: [], registry: { menus: [] }, equipmentAxes: axes });
  const base = { scopeId: 'MEM', axisId: 'chamberType', limit: 200 };
  const row = EQUIPMENT.find(e => e.site === 'MEM' && e.room === 'PHOTO')!;
  const page = await configured.listAxisOptions({ ...base, parents: { maker: [row.maker], model: [row.model] } });
  expect(page.items.some(i => i.id === row.chamberType)).toBe(true);
  expect((await configured.listAxisOptions(base)).items.length).toBeGreaterThanOrEqual(page.items.length);
  await expect(configured.listAxisOptions({ ...base, parents: { unknown: ['x'] } })).rejects.toMatchObject({ code: 'unknown_axis' });
  const period = { from: '2026-01-01T00:00:00', to: '2026-02-01T00:00:00' };
  const current = await configured.searchEquipment({ ...input, condition: { maker: [row.maker] }, limit: 200 });
  expect(await configured.searchEquipment({ ...input, condition: { maker: [row.maker] }, membershipBasis: 'asOf', period, limit: 200 })).toEqual(current);
});

it('includes literal Line and PRC memberships in search and successful resolution independently of descriptors', async () => {
  const row = { ...EQUIPMENT[0], site: 'MEM', room: 'PHOTO', equipmentId: 'FIX1-membership', line: 'FIX1-line', prcGroup: 'FIX1-prc' };
  EQUIPMENT.push(row);
  try {
    const expected = { lineNames: ['FIX1-line'], prcGroups: ['FIX1-prc'] };
    expect((await adapter.searchEquipment({ ...input, query: row.equipmentId })).items[0].axes).toMatchObject(expected);
    expect((await adapter.resolveSelection({ scopeId: 'MEM', ids: [row.equipmentId] })).items).toEqual([
      { id: row.equipmentId, status: 'ok', summary: expect.objectContaining({ axes: expect.objectContaining(expected) }) },
    ]);
  } finally { EQUIPMENT.pop(); }
});

it.each(['lineNames', 'prcGroups'] as const)('pages authorized global %s options and narrows by other global keys', async axisId => {
  const rows = [
    { ...EQUIPMENT[0], site: 'MEM', room: 'PHOTO', equipmentId: 'FIX1-a', line: 'FIX1-a', prcGroup: 'FIX1-a' },
    { ...EQUIPMENT[0], site: 'MEM', room: 'PHOTO', equipmentId: 'FIX1-b', line: 'FIX1-b', prcGroup: 'FIX1-b' },
    { ...EQUIPMENT[0], site: 'MEM', room: 'DIFF', equipmentId: 'FIX1-denied', line: 'FIX1-secret', prcGroup: 'FIX1-secret' },
    { ...EQUIPMENT[0], site: 'FDRY', room: 'PHOTO', equipmentId: 'FIX1-foreign', line: 'FIX1-foreign', prcGroup: 'FIX1-foreign' },
  ];
  EQUIPMENT.push(...rows);
  try {
    const base = { scopeId: 'MEM', axisId, query: 'FIX1-', parents: { roomNames: ['PHOTO'] }, limit: 1 };
    const first = await adapter.listAxisOptions(base);
    expect(first.items).toEqual([{ id: 'FIX1-a', label: 'FIX1-a' }]);
    expect(first.nextCursor).toEqual(expect.any(String));
    expect(await adapter.listAxisOptions({ ...base, cursor: first.nextCursor, limit: 999 })).toEqual({ items: [{ id: 'FIX1-b', label: 'FIX1-b' }], nextCursor: null });
    await expect(adapter.listAxisOptions({ ...base, cursor: first.nextCursor, parents: { roomNames: [] } })).rejects.toMatchObject({ code: 'invalid_cursor' });
    expect((await adapter.listAxisOptions({ ...base, parents: { [axisId === 'lineNames' ? 'prcGroups' : 'lineNames']: ['FIX1-b'] } })).items).toEqual([{ id: 'FIX1-b', label: 'FIX1-b' }]);
    expect((await adapter.listAxisOptions({ ...base, parents: { roomNames: [] } })).items).toEqual([]);
    expect((await adapter.listAxisOptions({ ...base, parents: { roomNames: ['DIFF'] } })).items).toEqual([]);
    await expect(adapter.listAxisOptions({ ...base, parents: { [axisId]: ['FIX1-a'] } })).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(adapter.listAxisOptions({ ...base, parents: { maker: ['TEL'] } })).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(adapter.listAxisOptions({ ...base, parents: { roomNames: [null] } } as never)).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(adapter.listAxisOptions({ ...base, scopeId: 'XIA' })).rejects.toMatchObject({ code: 'scope_forbidden' });
    await expect(adapter.listAxisOptions({ ...base, membershipBasis: 'asOf', period: { from: '2026-01-01T00:00:00', to: '2026-02-01T00:00:00' } })).rejects.toMatchObject({ code: 'membership_basis_unsupported' });
    setRole('viewer');
    await expect(adapter.listAxisOptions({ ...base, cursor: first.nextCursor })).rejects.toMatchObject({ code: 'invalid_cursor' });
    expect((await adapter.listAxisOptions(base)).items).toEqual(first.items);
  } finally { EQUIPMENT.splice(EQUIPMENT.length - rows.length, rows.length); }
});
