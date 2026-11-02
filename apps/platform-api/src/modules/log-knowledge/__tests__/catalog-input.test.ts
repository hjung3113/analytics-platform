import { describe, expect, it } from 'vitest';

import { PROCESS_IDS_MAX, validateCatalogInput } from '../domain/catalog-input.js';
import { CODE_MAX, NAME_MAX } from '../domain/code-key.js';

const ID = '11111111-1111-4111-8111-111111111111';
const ID2 = '22222222-2222-4222-8222-222222222222';
const long = (n: number) => 'x'.repeat(n);

describe('validateCatalogInput', () => {
  it.each([
    ['vendor', 'create', { code: 'A', name: 'Alpha' }],
    ['process', 'create', { code: 'ETCH', name: 'Etch' }],
    ['model', 'create', { vendorId: ID, code: 'MX', name: 'M', processIds: [ID, ID2] }],
    ['model', 'create', { vendorId: ID, code: 'MX', name: 'M', processIds: [] }],
    ['software', 'create', { modelId: ID, versionLabel: 'v1', name: '' }],
    ['vendor', 'update', { id: ID, code: long(CODE_MAX), name: long(NAME_MAX) }],
    ['model', 'update', { id: ID, code: 'MX', name: 'M', processIds: [ID] }],
    ['software', 'update', { id: ID, versionLabel: 'v2', name: 'n' }],
    ['process', 'setActive', { id: ID, active: false }],
  ] as const)('accepts a valid %s %s', (kind, op, input) => {
    expect(validateCatalogInput(kind, op, input)).toEqual([]);
  });

  it.each([
    ['vendor', 'create', {}, [['code', 'required'], ['name', 'required']]],
    ['vendor', 'create', { code: '   ', name: 'n' }, [['code', 'required']]],
    ['vendor', 'create', { code: 5, name: 'n' }, [['code', 'required']]],
    ['vendor', 'create', { code: long(CODE_MAX + 1), name: 'n' }, [['code', 'too_long']]],
    ['vendor', 'create', { code: 'a', name: long(NAME_MAX + 1) }, [['name', 'too_long']]],
    ['vendor', 'create', { code: 'a\u0000b', name: 'n' }, [['code', 'malformed']]],
    ['process', 'update', { id: 'nope', code: 'a', name: 'n' }, [['id', 'malformed']]],
    ['process', 'update', { code: 'a', name: 'n' }, [['id', 'required']]],
    ['model', 'create', { code: 'a', name: 'n', processIds: [] }, [['vendorId', 'required']]],
    ['model', 'create', { vendorId: ID, code: 'a', name: 'n' }, [['processIds', 'required']]],
    ['model', 'create', { vendorId: ID, code: 'a', name: 'n', processIds: [ID, ID] }, [['processIds.1', 'duplicate']]],
    ['model', 'update', { id: ID, code: 'a', name: 'n', processIds: ['x'] }, [['processIds.0', 'malformed']]],
    [
      'model',
      'update',
      { id: ID, code: 'a', name: 'n', processIds: Array.from({ length: PROCESS_IDS_MAX + 1 }, () => ID) },
      [['processIds', 'too_long']],
    ],
    ['software', 'create', { versionLabel: 'v', name: 'n' }, [['modelId', 'required']]],
    ['software', 'create', { modelId: ID, name: 'n' }, [['versionLabel', 'required']]],
    ['software', 'update', { id: ID, versionLabel: long(CODE_MAX + 1), name: 'n' }, [['versionLabel', 'too_long']]],
    ['software', 'update', { id: ID, versionLabel: 'v', name: 3 }, [['name', 'required']]],
    ['vendor', 'setActive', { id: ID, active: 'yes' }, [['active', 'required']]],
    ['vendor', 'setActive', { active: true }, [['id', 'required']]],
  ] as const)('refuses %s %s %j', (kind, op, input, expected) => {
    const errors = validateCatalogInput(kind, op, input as Record<string, unknown>);
    expect(errors.map((e) => [e.path.join('.'), e.code])).toEqual(expected);
  });
});
