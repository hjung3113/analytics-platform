import { describe, expect, it } from 'vitest';
import { emptyGlobal, validateSavedView, type CustomGroupTarget, type CustomGroupView, type EquipmentSummary } from '@ap/contracts';
import { customGroupMembers, expandCustomGroups } from '../expand-custom-groups';
import { createFakeSavedViewStore, testSavedView } from '../fake-store';
import { restoreSavedView } from '../restore';

const draft = { schemaVersion: 1, kind: 'custom-group', name: 'Targets', savedScopeId: 'S', target: { fixed: ['e1'] } } as const;
const view: CustomGroupView & { visibility: { kind: 'private' }; approval: 'none' } = { ...draft, id: 'g1', ownerId: 'u1', version: 1, updatedAt: 1, visibility: { kind: 'private' }, approval: 'none' };
const groups: Record<string, CustomGroupTarget | { denied: string }> = { g1: { fixed: ['e1', 'e2'] }, g2: { fixed: ['e2', 'e3'] }, blocked: { denied: 'no-access' } };
const facts: EquipmentSummary[] = [
  { equipmentId: 'e1', room: 'R1', axes: { model: ['A', 'B'], tag: ['x'] } },
  { equipmentId: 'e2', room: 'R2', axes: { model: ['B'], tag: ['y'] } },
  { equipmentId: 'e3', room: 'R1', axes: { model: ['C'], tag: ['x'] } },
];

describe('custom-group drafts', () => {
  it('accepts fixed and rule targets without context', () => {
    expect(validateSavedView(draft).ok).toBe(true);
    expect(validateSavedView({ ...draft, target: { rule: { model: ['A'] } } }).ok).toBe(true);
  });
  it.each([
    { savedScopeId: undefined }, { savedScopeId: '' }, { target: { fixed: [] } },
    { target: { fixed: ['e1', 'e1'] } }, { target: { fixed: [''] } },
    { target: { fixed: Array.from({ length: 5001 }, (_, i) => `e${i}`) } },
    { target: { rule: { customGroup: ['g1'] } } }, { target: { rule: { '': ['A'] } } },
    { target: { rule: { model: [] } } }, { target: { rule: { model: [''] } } },
    { target: { fixed: ['e1'], rule: {} } }, { target: {} }, { name: ' ' },
  ])('refuses invalid custom-group content: %j', patch => {
    expect(validateSavedView({ ...draft, ...patch })).toMatchObject({ ok: false, reason: 'invalid' });
  });
});

describe('expandCustomGroups', () => {
  it('uses one membership helper for fixed and rule targets', () => {
    expect(customGroupMembers({ rule: { roomNames: ['R1'], model: ['A', 'C'] } }, facts)).toEqual(['e1', 'e3']);
    expect(customGroupMembers({ fixed: ['e3', 'missing', 'e3'] }, facts)).toEqual(['e3', 'missing']);
  });
  it('unions groups, deduplicates members and removes only the reserved axis', () => {
    expect(expandCustomGroups({ condition: { customGroup: ['g1', 'g2'], model: ['A'] }, selection: null, groups, facts })).toEqual({ ok: true, condition: { model: ['A'] }, selection: ['e1', 'e2', 'e3'] });
  });
  it('intersects with an existing selection, including an explicit empty selection', () => {
    expect(expandCustomGroups({ condition: { customGroup: ['g1'] }, selection: ['e2', 'e9'], groups, facts })).toEqual({ ok: true, condition: null, selection: ['e2'] });
    expect(expandCustomGroups({ condition: { customGroup: ['g1'] }, selection: [], groups, facts })).toEqual({ ok: true, condition: null, selection: [] });
  });
  it('blocks on every denied or missing group rather than returning an empty selection', () => {
    expect(expandCustomGroups({ condition: { customGroup: ['blocked', 'missing'] }, selection: [], groups, facts })).toEqual({ ok: false, denied: [{ id: 'blocked', reason: 'no-access' }, { id: 'missing', reason: 'not-found' }] });
  });
  it('matches rule axes with AND across axes, OR within arrays, and roomNames from room', () => {
    expect(expandCustomGroups({ condition: { customGroup: ['rule'] }, selection: null, groups: { rule: { rule: { model: ['A', 'B'], tag: ['x'], roomNames: ['R1'] } } }, facts })).toEqual({ ok: true, condition: null, selection: ['e1'] });
  });
  it('matches every fact row for an empty rule while keeping other Condition axes and Selection', () => {
    expect(expandCustomGroups({ condition: { customGroup: ['all'], model: ['A'] }, selection: ['e1', 'e3'], groups: { all: { rule: {} } }, facts })).toEqual({ ok: true, condition: { model: ['A'] }, selection: ['e1', 'e3'] });
  });
  it.each(['toString', 'constructor', 'missingAxis'])('treats missing or inherited axis %s as empty without throwing', axis => {
    expect(expandCustomGroups({ condition: { customGroup: ['g'] }, selection: null, groups: { g: { rule: { [axis]: ['x'] } } }, facts })).toEqual({ ok: true, condition: null, selection: [] });
  });
  it('matches a genuinely present own property named toString', () => {
    const ownToStringFacts: EquipmentSummary[] = [{ equipmentId: 'e1', room: 'R1', axes: { toString: ['x'] } }, facts[1]!];
    expect(expandCustomGroups({ condition: { customGroup: ['g'] }, selection: null, groups: { g: { rule: { toString: ['x'] } } }, facts: ownToStringFacts })).toEqual({ ok: true, condition: null, selection: ['e1'] });
  });
  it('preserves an input with no selected custom group', () => {
    expect(expandCustomGroups({ condition: null, selection: null, groups, facts })).toEqual({ ok: true, condition: null, selection: null });
  });
});

describe('fake store and restore isolation', () => {
  it('builds custom-group fixtures without manufacturing view context', () => {
    expect(testSavedView({ ...draft, id: 'g' })).not.toHaveProperty('context');
  });
  it('lists custom groups only under the new key and refuses restoring them', async () => {
    const store = createFakeSavedViewStore([view]);
    expect(await store.list({ userId: 'u1', menuId: null })).toEqual([]);
    expect(await store.list({ userId: 'u1', menuId: null, kind: 'custom-group' })).toHaveLength(1);
    expect(restoreSavedView({ view, support: { menuId: 'm', menuSchemaVersion: 1, contextKeys: [], pageKeys: [] }, current: { global: emptyGlobal, page: [] }, extras: [], pathname: '/m', anchor: null, source: 'selected' })).toEqual({ ok: false, reason: 'wrong-menu' });
  });
  it('refuses defaults, people visibility and official operations', async () => {
    const store = createFakeSavedViewStore([view]);
    const key = { userId: 'u1', menuId: null, kind: 'custom-group' } as const;
    expect(await store.setDefault(key, null)).toMatchObject({ ok: false, reason: 'invalid' });
    expect(await store.setDefault({ userId: 'u1', menuId: null }, view.id)).toMatchObject({ ok: false, reason: 'invalid' });
    expect(await store.getDefaultId(key)).toBeNull();
    expect(await store.setVisibility(view.id, { kind: 'people', userIds: ['u2'] }, { expectedVersion: 1 })).toMatchObject({ ok: false, reason: 'invalid' });
    expect(await store.requestOfficial(view.id, { expectedVersion: 1 })).toMatchObject({ ok: false, reason: 'invalid' });
    expect(await store.decide(view.id, 'approve', undefined, { expectedVersion: 1 })).toMatchObject({ ok: false, reason: 'invalid' });
    expect(await store.revoke(view.id, { expectedVersion: 1 })).toMatchObject({ ok: false, reason: 'invalid' });
  });
});
