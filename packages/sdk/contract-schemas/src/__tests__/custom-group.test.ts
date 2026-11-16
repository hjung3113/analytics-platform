import { describe, expect, it } from 'vitest';
import { CUSTOM_GROUP_FIXED_MAX, validateSavedView } from '@ap/contracts';
import { savedViewCommandSchema, savedViewDraftSchema, savedViewSchema } from '../saved-view-commands';

const draft = { schemaVersion: 1, kind: 'custom-group', name: 'Targets', savedScopeId: 'S', target: { fixed: ['e1'] } };
describe('custom-group wire contract', () => {
  it('accepts draft, patch and list key shapes strictly', () => {
    expect(savedViewDraftSchema.safeParse(draft).success).toBe(true);
    for (const fields of [
      { op: 'save', draft },
      { op: 'update', id: 'g', patch: { target: { rule: { model: ['A'] } } }, expectedVersion: 1 },
      { op: 'list', key: { menuId: null, kind: 'custom-group' } },
    ]) expect(savedViewCommandSchema.safeParse({ version: 1, ...fields }).success).toBe(true);
    expect(savedViewDraftSchema.safeParse({ ...draft, context: {} }).success).toBe(false);
    expect(savedViewCommandSchema.safeParse({ version: 1, op: 'list', key: { menuId: null, kind: 'other' } }).success).toBe(false);
  });
  it.each([
    { fixed: [] }, { fixed: ['e1', 'e1'] }, { fixed: [''] },
    { fixed: Array.from({ length: CUSTOM_GROUP_FIXED_MAX + 1 }, (_, i) => String(i)) },
    { rule: { customGroup: ['g1'] } }, { rule: { '': ['A'] } }, { rule: { model: [] } }, { rule: { model: [''] } },
    { fixed: ['e1'], rule: {} },
  ])('mirrors contract target validation: %j', target => {
    expect(validateSavedView({ ...draft, target }).ok).toBe(false);
    expect(savedViewDraftSchema.safeParse({ ...draft, target }).success).toBe(false);
  });
  it('restricts custom-group responses to private/groups and no approval tier', () => {
    const record = { ...draft, id: 'g', ownerId: 'u', version: 1, updatedAt: 1, approval: 'none', visibility: { kind: 'private' } };
    expect(savedViewSchema.safeParse(record).success).toBe(true);
    expect(savedViewSchema.safeParse({ ...record, visibility: { kind: 'people', userIds: [] } }).success).toBe(false);
    expect(savedViewSchema.safeParse({ ...record, visibility: { kind: 'official' } }).success).toBe(false);
  });
});
