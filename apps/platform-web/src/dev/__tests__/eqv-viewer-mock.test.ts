import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMockAdapter, getRole, setRole } from '@ap/mock-server';
import { EQV_MOCK_WINDOW, eqvMockContext, eqvMockEquipmentOptions, eqvMockEvents } from '@ap/menu-topview/mock-data';
import { MOCK_ENDPOINTS } from '../mock-assembly';
import { registry } from '../../menus';

// The viewer's three reads as the app assembles them (#801, #1659): `topviewMock` of @ap/menu-topview/mock answers from the synthetic fixture the assembly hands it.
const adapter = createMockAdapter({ endpoints: MOCK_ENDPOINTS, registry, permissions: registry.permissions });
const previous = getRole();
beforeEach(() => setRole('engineer'));
afterEach(() => setRole(previous));

/** The equipment list applies no Context; the replay reads apply the time window. */
const read = (endpoint: string, params: Record<string, unknown> = {}) => adapter.menuQuery({ endpoint, context: endpoint === 'eqv.equipment-options' ? {} : { ...EQV_MOCK_WINDOW }, params });

describe('viewer mock reads', () => {
  it('answers the fixture unchanged', async () => {
    expect((await read('eqv.equipment-options')).data).toEqual(eqvMockEquipmentOptions());
    expect((await read('eqv.topview-context', { equipmentId: 'eq-synth-01' })).data).toEqual(eqvMockContext('eq-synth-01'));
    expect((await read('eqv.topview-events', { equipmentId: 'eq-synth-01' })).data).toEqual(eqvMockEvents({ equipmentId: 'eq-synth-01', ...EQV_MOCK_WINDOW }));
  });

  it('sends assessments without a Trust: collection and time domain unverified, never clear', async () => {
    const answer = await read('eqv.topview-context', { equipmentId: 'eq-synth-01' });
    expect(answer.trust).toBeNull();
    expect(answer.assessments.filter(a => a.state === 'unknown').map(a => a.kind)).toEqual(['collection', 'time_domain']);
  });
});
