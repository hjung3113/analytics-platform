import { describe, expect, it } from 'vitest';

import { AUDIT_EVENT_DETAIL_SCHEMAS } from '../../enums/audit-events.js';

const HASH = `sha256:${'a'.repeat(64)}`;
const UUID = '6f9619ff-8b86-4d11-b42d-00c04fc964ff';

describe('eqv audit detail schemas (#1645, #1658)', () => {
  it.each([
    ['eqv.layout.draft_created', { layoutId: 'cluster-one', version: 1 }],
    ['eqv.layout.draft_saved', { layoutId: 'cluster-one', version: 4 }],
    ['eqv.layout.revision_published', { layoutId: 'cluster-one', revision: HASH, draftVersion: 4 }],
    ['eqv.template.promoted', { templateId: 'my-template', layoutId: 'cluster-one', revision: HASH }],
    ['eqv.alias_rules.created', { level: 'global', version: 1 }],
    ['eqv.alias_rules.saved', { level: 'model', vendorId: UUID, modelId: UUID, version: 3 }],
    ['eqv.alias_rules.saved', { level: 'equipment', equipmentId: 'eq-synth-1', version: 2 }],
    ['eqv.type_dictionary.created', { level: 'maker', vendorId: UUID, version: 1 }],
    ['eqv.type_dictionary.saved', { level: 'global', version: 2 }],
    ['eqv.mapping.published', { equipmentId: 'eq-synth-1', mappingHash: HASH, layoutRevision: HASH, effectiveFrom: '2026-01-02T03:04:05.678' }],
  ] as const)('%s accepts its detail', (type, detail) => {
    expect(AUDIT_EVENT_DETAIL_SCHEMAS[type].safeParse(detail).success).toBe(true);
  });

  it.each([
    ['eqv.layout.draft_saved', 'a document body', { layoutId: 'cluster-one', version: 2, document: {} }],
    ['eqv.layout.draft_saved', 'version 0', { layoutId: 'cluster-one', version: 0 }],
    ['eqv.layout.revision_published', 'a bare hex hash', { layoutId: 'cluster-one', revision: 'a'.repeat(64), draftVersion: 1 }],
    ['eqv.template.promoted', 'a name', { templateId: 'my-template', layoutId: 'cluster-one', revision: HASH, name: 'x' }],
    ['eqv.template.promoted', 'an invalid id', { templateId: 'My Template', layoutId: 'cluster-one', revision: HASH }],
    ['eqv.alias_rules.saved', 'a rule body', { level: 'global', version: 1, document: {} }],
    ['eqv.alias_rules.saved', 'a free maker string', { level: 'maker', maker: 'acme', version: 1 }],
    ['eqv.type_dictionary.saved', 'the equipment level', { level: 'equipment', version: 1 }],
    ['eqv.mapping.published', 'a truncated wall-clock', { equipmentId: 'eq-synth-1', mappingHash: HASH, layoutRevision: HASH, effectiveFrom: '2026-01-02T03:04:05' }],
    ['eqv.mapping.published', 'an inventory body', { equipmentId: 'eq-synth-1', mappingHash: HASH, layoutRevision: HASH, effectiveFrom: '2026-01-02T03:04:05.678', baseline: {} }],
  ] as const)('%s rejects %s', (type, _label, detail) => {
    expect(AUDIT_EVENT_DETAIL_SCHEMAS[type].safeParse(detail).success).toBe(false);
  });
});
