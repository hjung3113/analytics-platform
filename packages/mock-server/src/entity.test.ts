import { describe, expect, it } from 'vitest';
import type { ApiResponse } from '@ap/contracts';
import { getEntity, getRole, setRole, setScenario } from './server';
import { EQUIPMENT, type Equipment } from './world';

const ref = (id: string, scopeId: string | null = 'ICH') => ({ type: 'equipment' as const, id, scopeId });
const asEquipment = (res: ApiResponse<unknown>) => res.data as Equipment;
const body = (res: ApiResponse<unknown>) => JSON.stringify(res);

describe('getEntity (destination single-row lookup, docs/06 §22)', () => {
  it('forbids a viewer (no equipment:view) before any scenario or lookup, without leaking the row', async () => {
    const res = await getEntity(ref('ICH-PHOTO-0103'), undefined, { role: 'viewer', latency: 0 });
    expect(res.outcome).toBe('forbidden');
    expect(res.message).toContain('equipment:view');
    expect(body(res)).not.toContain('ICH-PHOTO-0103');
    expect(body(res)).not.toContain('PHOTO');
    expect(body(res)).not.toContain('Lithius-Pro');
    expect(body(res)).not.toContain('STG-PHOTO-A');
  });

  it('forbids an id in an ungranted room with a message that leaks no fields', async () => {
    // engineer holds ICH PHOTO/ETCH/CVD, not DIFF. Model is XP8. The denial must not carry the id, room, or model.
    const res = await getEntity(ref('ICH-DIFF-0176'), undefined, { role: 'engineer', latency: 0 });
    expect(res.outcome).toBe('forbidden');
    expect(res.message).toBe('No grant for equipment');
    expect(body(res)).not.toContain('ICH-DIFF-0176');
    expect(body(res)).not.toContain('DIFF');
    expect(body(res)).not.toContain('XP8');
    expect(body(res)).not.toContain('A412');
    expect(body(res)).not.toContain('STG-DIFF-A');
  });

  it('returns empty for an unknown id inside a granted room', async () => {
    const res = await getEntity(ref('ICH-PHOTO-9999'), undefined, { role: 'engineer', latency: 0 });
    expect(res.outcome).toBe('empty');
    expect(res.data).toBeNull();
  });

  it('does not return another site\'s row even with a valid ICH scope', async () => {
    // CJU-ETCH-0227 is a real CJU row. Room ETCH also exists at ICH and XIA, so the miss is the
    // site + equipment id lookup (ICH scope never searches CJU), not a unique room string.
    const res = await getEntity(ref('CJU-ETCH-0227'), undefined, { role: 'engineer', latency: 0 });
    expect(res.outcome).toBe('empty');
    expect(res.data).toBeNull();
    expect(body(res)).not.toContain('CJU-ETCH-0227');
    expect(body(res)).not.toContain('STG-ETCH-C');
    expect(body(res)).not.toContain('Lithius-Pro');
  });

  it('forbids a null or ungranted scope before searching, without leaking the row', async () => {
    const none = await getEntity(ref('ICH-PHOTO-0103', null), undefined, { role: 'engineer', latency: 0 });
    expect(none.outcome).toBe('forbidden');
    expect(none.message).toBe('Unknown scope null');
    const xia = await getEntity(ref('ICH-PHOTO-0103', 'XIA'), undefined, { role: 'engineer', latency: 0 });
    expect(xia.outcome).toBe('forbidden');
    expect(xia.message).toBe('No grant for scope XIA');
    expect(body(xia)).not.toContain('ICH-PHOTO-0103');
    expect(body(xia)).not.toContain('Lithius-Pro');
    expect(body(xia)).not.toContain('STG-PHOTO-A');
  });

  it('serves a granted id with trust source mart.productivity_hourly and the default three assessments', async () => {
    const res = await getEntity(ref('ICH-PHOTO-0103'), undefined, { role: 'engineer', latency: 0 });
    expect(res.outcome).toBe('ok');
    expect(asEquipment(res).equipmentId).toBe('ICH-PHOTO-0103');
    expect(asEquipment(res).site).toBe('ICH');
    expect(asEquipment(res).room).toBe('PHOTO');
    expect(asEquipment(res)).not.toHaveProperty('name');
    expect(res.trust?.source).toBe('mart.productivity_hourly');
    expect(res.assessments.map(a => a.kind)).toEqual(['collection', 'processing_delay', 'coverage']);
  });

  it('errors on an unknown entity type', async () => {
    const res = await getEntity({ type: 'nope', id: 'ICH-PHOTO-0103', scopeId: 'ICH' }, undefined, { role: 'engineer', latency: 0 });
    expect(res.outcome).toBe('error');
    expect(res.message).toBe('Unknown entity type');
    expect(res.data).toBeNull();
  });

  it('evaluates an in-flight request with the role it was sent as', async () => {
    const previous = getRole();
    try {
      setRole('engineer');
      const pending = getEntity(ref('ICH-PHOTO-0103'), undefined, { latency: 60 });
      setRole('viewer'); // viewer lacks equipment:view; the pinned role must still decide
      const res = await pending;
      expect(res.outcome).toBe('ok');
      expect(asEquipment(res).equipmentId).toBe('ICH-PHOTO-0103');
      expect(asEquipment(res).room).toBe('PHOTO');
    } finally {
      setRole(previous);
    }
  });

  it('applies the forbidden scenario after permission and grants', async () => {
    setScenario('forbidden');
    try {
      const res = await getEntity(ref('ICH-PHOTO-0103'), undefined, { role: 'engineer', latency: 0 });
      expect(res.outcome).toBe('forbidden');
      expect(res.data).toBeNull();
      expect(res.trust).toBeNull();
    } finally {
      setScenario('normal');
    }
  });

  it('locks the fixture rows the cases above rely on', () => {
    const byId = (id: string) => EQUIPMENT.find(e => e.equipmentId === id);
    expect(byId('ICH-PHOTO-0103')).toMatchObject({ equipmentId: 'ICH-PHOTO-0103', site: 'ICH', room: 'PHOTO', model: 'Lithius-Pro', stgroup: 'STG-PHOTO-A' });
    expect(byId('ICH-PHOTO-0103')).not.toHaveProperty('name');
    expect(byId('ICH-PHOTO-0105')).toMatchObject({ equipmentId: 'ICH-PHOTO-0105', site: 'ICH', room: 'PHOTO', stgroup: 'STG-PHOTO-B' });
    expect(byId('ICH-DIFF-0176')).toMatchObject({ equipmentId: 'ICH-DIFF-0176', site: 'ICH', room: 'DIFF', model: 'XP8', stgroup: 'STG-DIFF-A' });
    expect(byId('CJU-ETCH-0227')).toMatchObject({ equipmentId: 'CJU-ETCH-0227', site: 'CJU', room: 'ETCH', model: 'Lithius-Pro', stgroup: 'STG-ETCH-C' });
    expect(byId('CJU-ETCH-0227')).not.toHaveProperty('name');
    // ETCH is shared across sites; the CJU row is a different equipment id from every ICH ETCH row.
    expect(EQUIPMENT.some(e => e.site === 'ICH' && e.room === 'ETCH' && e.equipmentId !== 'CJU-ETCH-0227')).toBe(true);
  });
});
