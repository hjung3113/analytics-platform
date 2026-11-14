import { describe, expect, it } from 'vitest';
import { manifests } from './index';

describe('equipment inbound destination (#1930)', () => {
  it('opens the equipment id through its only route parameter', () => {
    const detail = manifests.find(menu => menu.id === 'equipment-detail')!;
    expect(detail.opensObject).toEqual({ equipment: { param: 'equipmentId' } });
    expect(detail.path.match(/:[^/]+/g)).toEqual([':equipmentId']);
  });
});
