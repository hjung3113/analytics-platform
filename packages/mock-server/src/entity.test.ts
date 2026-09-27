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
    expect(body(res)).not.toContain('PHOTO Lithius-Pro');
    expect(body(res)).not.toContain('PH-101');
  });

  it('forbids an id in an ungranted room with a message that leaks no fields', async () => {
    // engineer holds ICH PH-101/ET-102/CVD-201, not DIF-202. Row name is "DIFF XP8 #5".
    const res = await getEntity(ref('ICH-DIFF-0176'), undefined, { role: 'engineer', latency: 0 });
    expect(res.outcome).toBe('forbidden');
    expect(res.message).toBe('No grant for equipment');
    expect(body(res)).not.toContain('DIF-202');
    expect(body(res)).not.toContain('XP8');
    expect(body(res)).not.toContain('A412');
  });

  it('returns empty for an unknown id inside a granted room', async () => {
    const res = await getEntity(ref('ICH-PHOTO-9999'), undefined, { role: 'engineer', latency: 0 });
    expect(res.outcome).toBe('empty');
    expect(res.data).toBeNull();
  });

  it('does not return another site\'s row even with a valid ICH scope', async () => {
    // The design named CJU-ETCH-0210, which does not exist in world.ts; CJU-ETCH-0227 is the real
    // ET-302 "ETCH Lithius-Pro" row, so this proves invisibility of an existing other-site row.
    const res = await getEntity(ref('CJU-ETCH-0227'), undefined, { role: 'engineer', latency: 0 });
    expect(res.outcome).toBe('empty');
    expect(res.data).toBeNull();
    expect(body(res)).not.toContain('Lithius-Pro');
  });

  it('forbids a null or ungranted scope before searching, without leaking the row', async () => {
    const none = await getEntity(ref('ICH-PHOTO-0103', null), undefined, { role: 'engineer', latency: 0 });
    expect(none.outcome).toBe('forbidden');
    expect(none.message).toBe('Unknown scope null');
    const xia = await getEntity(ref('ICH-PHOTO-0103', 'XIA'), undefined, { role: 'engineer', latency: 0 });
    expect(xia.outcome).toBe('forbidden');
    expect(xia.message).toBe('No grant for scope XIA');
    expect(body(xia)).not.toContain('PHOTO Lithius-Pro');
  });

  it('serves a granted id with trust source mart.productivity_hourly and the default three assessments', async () => {
    const res = await getEntity(ref('ICH-PHOTO-0103'), undefined, { role: 'engineer', latency: 0 });
    expect(res.outcome).toBe('ok');
    expect(asEquipment(res).name).toBe('PHOTO Lithius-Pro #1');
    expect(asEquipment(res).room).toBe('PH-101');
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
      expect(asEquipment(res).name).toBe('PHOTO Lithius-Pro #1');
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
    expect(byId('ICH-PHOTO-0103')).toMatchObject({ site: 'ICH', room: 'PH-101', name: 'PHOTO Lithius-Pro #1' });
    expect(byId('ICH-PHOTO-0105')).toMatchObject({ site: 'ICH', room: 'PH-101' });
    expect(byId('ICH-DIFF-0176')).toMatchObject({ site: 'ICH', room: 'DIF-202' });
    expect(byId('CJU-ETCH-0227')).toMatchObject({ site: 'CJU', room: 'ET-302', name: 'ETCH Lithius-Pro #2' });
  });
});
