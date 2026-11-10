import { describe, expect, it } from 'vitest';

import { AUDIT_EVENT_DETAIL_SCHEMAS } from '../../enums/audit-events.js';

const HASH = `sha256:${'a'.repeat(64)}`;

describe('eqv audit detail schemas (#1645)', () => {
  it.each([
    ['eqv.layout.draft_created', { layoutId: 'cluster-one', version: 1 }],
    ['eqv.layout.draft_saved', { layoutId: 'cluster-one', version: 4 }],
    ['eqv.layout.revision_published', { layoutId: 'cluster-one', revision: HASH, draftVersion: 4 }],
    ['eqv.template.promoted', { templateId: 'my-template', layoutId: 'cluster-one', revision: HASH }],
  ] as const)('%s accepts its detail', (type, detail) => {
    expect(AUDIT_EVENT_DETAIL_SCHEMAS[type].safeParse(detail).success).toBe(true);
  });

  it.each([
    ['eqv.layout.draft_saved', 'a document body', { layoutId: 'cluster-one', version: 2, document: {} }],
    ['eqv.layout.draft_saved', 'version 0', { layoutId: 'cluster-one', version: 0 }],
    ['eqv.layout.revision_published', 'a bare hex hash', { layoutId: 'cluster-one', revision: 'a'.repeat(64), draftVersion: 1 }],
    ['eqv.template.promoted', 'a name', { templateId: 'my-template', layoutId: 'cluster-one', revision: HASH, name: 'x' }],
    ['eqv.template.promoted', 'an invalid id', { templateId: 'My Template', layoutId: 'cluster-one', revision: HASH }],
  ] as const)('%s rejects %s', (type, _label, detail) => {
    expect(AUDIT_EVENT_DETAIL_SCHEMAS[type].safeParse(detail).success).toBe(false);
  });
});
