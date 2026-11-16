import { describe, expect, it } from 'vitest';
import { CUSTOM_GROUP_FIXED_MAX, validateSavedView } from '@ap/contracts';
import savedViewDraftArtifact from '../../schemas/savedViewDraft.json';
import { savedViewCommandSchema, savedViewDraftSchema, savedViewSchema } from '../saved-view-commands';

type JsonSchemaNode = Record<string, unknown>;

/** Evaluates the JSON Schema 2020-12 keywords emitted for `target` without adding a validator dependency. */
function matchesJsonSchema(schema: JsonSchemaNode, value: unknown): boolean {
  if ('const' in schema && value !== schema.const) return false;
  if (schema.not && matchesJsonSchema(schema.not as JsonSchemaNode, value)) return false;
  if (Array.isArray(schema.anyOf) && !schema.anyOf.some(branch => matchesJsonSchema(branch as JsonSchemaNode, value))) return false;
  if (schema.type === 'string') {
    if (typeof value !== 'string') return false;
    if (typeof schema.minLength === 'number' && value.length < schema.minLength) return false;
    if (typeof schema.pattern === 'string' && !new RegExp(schema.pattern).test(value)) return false;
  }
  if (schema.type === 'array') {
    if (!Array.isArray(value)) return false;
    if (typeof schema.minItems === 'number' && value.length < schema.minItems) return false;
    if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) return false;
    if (schema.uniqueItems === true && new Set(value.map(v => JSON.stringify(v))).size !== value.length) return false;
    if (schema.items && !value.every(item => matchesJsonSchema(schema.items as JsonSchemaNode, item))) return false;
  }
  if (schema.type === 'object') {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record);
    if (Array.isArray(schema.required) && !schema.required.every(k => Object.hasOwn(record, String(k)))) return false;
    if (schema.propertyNames && !keys.every(k => matchesJsonSchema(schema.propertyNames as JsonSchemaNode, k))) return false;
    const props = (schema.properties ?? {}) as Record<string, JsonSchemaNode>;
    for (const [k, propSchema] of Object.entries(props)) {
      if (Object.hasOwn(record, k) && !matchesJsonSchema(propSchema, record[k])) return false;
    }
    const extraKeys = keys.filter(k => !Object.hasOwn(props, k));
    if (schema.additionalProperties === false && extraKeys.length > 0) return false;
    if (typeof schema.additionalProperties === 'object' && schema.additionalProperties !== null) {
      const addl = schema.additionalProperties as JsonSchemaNode;
      if (!extraKeys.every(k => matchesJsonSchema(addl, record[k]))) return false;
    }
  }
  return true;
}

const artifactTargetSchema = savedViewDraftArtifact.anyOf[0]!.properties.target as JsonSchemaNode;

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
  it.each([
    { fixed: ['e1', 'e1'] },
    { fixed: [''] },
    { rule: { customGroup: ['g1'] } },
    { fixed: [' '] },
    { rule: { '': ['A'] } },
    { rule: { model: [' '] } },
  ])('generated JSON artifact rejects invalid target %j', target => {
    expect(matchesJsonSchema(artifactTargetSchema, target)).toBe(false);
  });
  it.each([{ fixed: ['e1'] }, { rule: { model: ['A'] } }, { rule: {} }])('generated JSON artifact accepts valid target %j', target => {
    expect(matchesJsonSchema(artifactTargetSchema, target)).toBe(true);
  });
  it('restricts custom-group responses to private/groups and no approval tier', () => {
    const record = { ...draft, id: 'g', ownerId: 'u', version: 1, updatedAt: 1, approval: 'none', visibility: { kind: 'private' } };
    expect(savedViewSchema.safeParse(record).success).toBe(true);
    expect(savedViewSchema.safeParse({ ...record, visibility: { kind: 'people', userIds: [] } }).success).toBe(false);
    expect(savedViewSchema.safeParse({ ...record, visibility: { kind: 'official' } }).success).toBe(false);
  });
});
