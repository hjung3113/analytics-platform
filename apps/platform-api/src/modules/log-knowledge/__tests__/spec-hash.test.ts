import { describe, expect, it } from 'vitest';

import { defined } from '../../../test-support/defined.js';
import { type HashEvent, type HashModule, type HashRelation, canonicalJson, specContentHash } from '../domain/spec-hash.js';

const modules: HashModule[] = [{ key: 'B', name: 'b', parentKey: 'A' }, { key: 'A', name: 'a', parentKey: null }];
const events: HashEvent[] = [
  { moduleKey: 'B', key: 'E2', name: 'e2', fields: [{ type: 'int', name: 'n', description: '' }], triggerRule: null, detailDocRef: null },
  { moduleKey: 'A', key: 'E1', name: 'e1', fields: [], triggerRule: 'on start', detailDocRef: null },
];
const relations: HashRelation[] = [
  { sourceModule: 'A', sourceEvent: 'E1', predicate: 'causes', targetModule: 'B', targetEvent: 'E2', ruleRef: null },
  { sourceModule: 'A', sourceEvent: 'E1', predicate: 'after', targetModule: 'B', targetEvent: 'E2', ruleRef: 'R1' },
];

describe('canonical spec hash', () => {
  it('is a 64-hex SHA-256', () => {
    expect(specContentHash(1, { modules, events, relations })).toMatch(/^[0-9a-f]{64}$/);
  });

  it('does not depend on row order or object key order', () => {
    const a = specContentHash(1, { modules, events, relations });
    const reordered = specContentHash(1, {
      modules: [...modules].reverse(),
      events: [{ ...defined(events[1]) }, { ...defined(events[0]), fields: [{ description: '', name: 'n', type: 'int' }] }],
      relations: [...relations].reverse(),
    });
    expect(reordered).toBe(a);
  });

  it.each([
    ['a changed name', { modules: [{ ...defined(modules[0]), name: 'bb' }, defined(modules[1])], events, relations }],
    ['a changed parent', { modules: [{ ...defined(modules[0]), parentKey: null }, defined(modules[1])], events, relations }],
    ['a changed field', { modules, events: [{ ...defined(events[0]), fields: [] }, defined(events[1])], relations }],
    ['a dropped relation', { modules, events, relations: [defined(relations[0])] }],
    ['a changed rule_ref', { modules, events, relations: [{ ...defined(relations[0]), ruleRef: 'R9' }, defined(relations[1])] }],
  ])('changes with %s', (_label, rows) => {
    expect(specContentHash(1, rows)).not.toBe(specContentHash(1, { modules, events, relations }));
  });

  it('includes the schema version', () => {
    expect(specContentHash(2, { modules, events, relations })).not.toBe(specContentHash(1, { modules, events, relations }));
  });

  it('canonicalJson sorts keys at every depth and keeps array order', () => {
    expect(canonicalJson({ b: [2, { d: 1, c: null }], a: 'x' })).toBe('{"a":"x","b":[2,{"c":null,"d":1}]}');
  });
});
