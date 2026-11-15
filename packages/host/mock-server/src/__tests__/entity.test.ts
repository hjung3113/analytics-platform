import { describe, expect, it } from 'vitest';
import type { ApiResponse } from '@ap/contracts';
import { getEntity, getRole, setRole, setScenario } from '../server';
import { EQUIPMENT, type Equipment } from '../world';

const ref = (id: string, scopeId: string | null = 'MEM') => ({ type: 'equipment' as const, id, scopeId });
const asEquipment = (res: ApiResponse<unknown>) => res.data as Equipment;
const body = (res: ApiResponse<unknown>) => JSON.stringify(res);

describe('getEntity (destination single-row lookup, docs/06 §22)', () => {
  it('forbids a viewer (no equipment:view) before any scenario or lookup, without leaking the row', async () => {
    const res = await getEntity(ref('MEM-PHOTO-0103'), undefined, { role: 'viewer', latency: 0 });
    expect(res.outcome).toBe('forbidden');
    expect(res.message).toContain('equipment:view');
    expect(body(res)).not.toContain('MEM-PHOTO-0103');
    expect(body(res)).not.toContain('PHOTO');
    expect(body(res)).not.toContain('Lithius-Pro');
    expect(body(res)).not.toContain('STG-PHOTO-A');
  });

  it('forbids an id in an ungranted room with a message that leaks no fields', async () => {
    // engineer holds MEM PHOTO/ETCH/CVD, not DIFF. Model is XP8. The denial must not carry the id, room, or model.
    const res = await getEntity(ref('MEM-DIFF-0176'), undefined, { role: 'engineer', latency: 0 });
    expect(res.outcome).toBe('forbidden');
    expect(res.message).toBe('No grant for equipment');
    expect(body(res)).not.toContain('MEM-DIFF-0176');
    expect(body(res)).not.toContain('DIFF');
    expect(body(res)).not.toContain('XP8');
    expect(body(res)).not.toContain('A412');
    expect(body(res)).not.toContain('STG-DIFF-A');
  });

  it('returns empty for an unknown id inside a granted room', async () => {
    const res = await getEntity(ref('MEM-PHOTO-9999'), undefined, { role: 'engineer', latency: 0 });
    expect(res.outcome).toBe('empty');
    expect(res.data).toBeNull();
  });

  it('does not return another site\'s row even with a valid MEM scope', async () => {
    // FDRY-ETCH-0227 is a real FDRY row. Room ETCH also exists at MEM and XIA, so the miss is the
    // site + equipment id lookup (MEM scope never searches FDRY), not a unique room string.
    const res = await getEntity(ref('FDRY-ETCH-0227'), undefined, { role: 'engineer', latency: 0 });
    expect(res.outcome).toBe('empty');
    expect(res.data).toBeNull();
    expect(body(res)).not.toContain('FDRY-ETCH-0227');
    expect(body(res)).not.toContain('STG-ETCH-C');
    expect(body(res)).not.toContain('Lithius-Pro');
  });

  it('forbids a null or ungranted scope before searching, without leaking the row', async () => {
    const none = await getEntity(ref('MEM-PHOTO-0103', null), undefined, { role: 'engineer', latency: 0 });
    expect(none.outcome).toBe('forbidden');
    expect(none.message).toBe('Unknown scope null');
    const xia = await getEntity(ref('MEM-PHOTO-0103', 'XIA'), undefined, { role: 'engineer', latency: 0 });
    expect(xia.outcome).toBe('forbidden');
    expect(xia.message).toBe('No grant for scope XIA');
    expect(body(xia)).not.toContain('MEM-PHOTO-0103');
    expect(body(xia)).not.toContain('Lithius-Pro');
    expect(body(xia)).not.toContain('STG-PHOTO-A');
  });

  it('serves a granted id with trust source mart.productivity_hourly and the default three assessments', async () => {
    const res = await getEntity(ref('MEM-PHOTO-0103'), undefined, { role: 'engineer', latency: 0 });
    expect(res.outcome).toBe('ok');
    expect(asEquipment(res).equipmentId).toBe('MEM-PHOTO-0103');
    expect(asEquipment(res).site).toBe('MEM');
    expect(asEquipment(res).room).toBe('PHOTO');
    expect(asEquipment(res)).not.toHaveProperty('name');
    expect(res.trust?.source).toBe('mart.productivity_hourly');
    expect(res.assessments.map(a => a.kind)).toEqual(['collection', 'processing_delay', 'coverage']);
  });

  it('errors on an unknown entity type', async () => {
    const res = await getEntity({ type: 'nope', id: 'MEM-PHOTO-0103', scopeId: 'MEM' }, undefined, { role: 'engineer', latency: 0 });
    expect(res.outcome).toBe('error');
    expect(res.message).toBe('Unknown entity type');
    expect(res.data).toBeNull();
  });

  it('evaluates an in-flight request with the role it was sent as', async () => {
    const previous = getRole();
    try {
      setRole('engineer');
      const pending = getEntity(ref('MEM-PHOTO-0103'), undefined, { latency: 60 });
      setRole('viewer'); // viewer lacks equipment:view; the pinned role must still decide
      const res = await pending;
      expect(res.outcome).toBe('ok');
      expect(asEquipment(res).equipmentId).toBe('MEM-PHOTO-0103');
      expect(asEquipment(res).room).toBe('PHOTO');
    } finally {
      setRole(previous);
    }
  });

  it('applies the forbidden scenario after permission and grants', async () => {
    setScenario('forbidden');
    try {
      const res = await getEntity(ref('MEM-PHOTO-0103'), undefined, { role: 'engineer', latency: 0 });
      expect(res.outcome).toBe('forbidden');
      expect(res.data).toBeNull();
      expect(res.trust).toBeNull();
    } finally {
      setScenario('normal');
    }
  });

  it('locks the fixture rows the cases above rely on', () => {
    const byId = (id: string) => EQUIPMENT.find(e => e.equipmentId === id);
    expect(byId('MEM-PHOTO-0103')).toMatchObject({ equipmentId: 'MEM-PHOTO-0103', site: 'MEM', room: 'PHOTO', model: 'Lithius-Pro', stgroup: 'STG-PHOTO-A' });
    expect(byId('MEM-PHOTO-0103')).not.toHaveProperty('name');
    expect(byId('MEM-PHOTO-0105')).toMatchObject({ equipmentId: 'MEM-PHOTO-0105', site: 'MEM', room: 'PHOTO', stgroup: 'STG-PHOTO-B' });
    expect(byId('MEM-DIFF-0176')).toMatchObject({ equipmentId: 'MEM-DIFF-0176', site: 'MEM', room: 'DIFF', model: 'XP8', stgroup: 'STG-DIFF-A' });
    expect(byId('FDRY-ETCH-0227')).toMatchObject({ equipmentId: 'FDRY-ETCH-0227', site: 'FDRY', room: 'ETCH', model: 'Lithius-Pro', stgroup: 'STG-ETCH-C' });
    expect(byId('FDRY-ETCH-0227')).not.toHaveProperty('name');
    // ETCH is shared across sites; the FDRY row is a different equipment id from every MEM ETCH row.
    expect(EQUIPMENT.some(e => e.site === 'MEM' && e.room === 'ETCH' && e.equipmentId !== 'FDRY-ETCH-0227')).toBe(true);
  });
});
