import { describe, expect, it } from 'vitest';

import { ENTITY_FIELDS, mappingShapeErrors, validateMapping } from '../domain/import-mapping.js';

const headers = ['VC', 'VN', 'MC', 'MN', 'PC'];

describe('import mapping', () => {
  it('accepts the minimum columns of every entity', () => {
    expect(validateMapping('vendor', headers, { vendor_code: 'VC', vendor_name: 'VN' })).toEqual([]);
    expect(validateMapping('process', headers, { process_code: 'VC', process_name: 'VN' })).toEqual([]);
    expect(validateMapping('model', headers, { vendor_code: 'VC', model_code: 'MC', model_name: 'MN', process_codes: 'PC' })).toEqual([]);
    expect(validateMapping('software', headers, { vendor_code: 'VC', model_code: 'MC', version_key: 'MN' })).toEqual([]);
  });

  it('reports every missing required field', () => {
    expect(validateMapping('model', headers, { vendor_code: 'VC' }).map((e) => `${e.path.join('.')}/${e.code}`)).toEqual([
      'mapping.model_code/required',
      'mapping.model_name/required',
    ]);
    expect(ENTITY_FIELDS.model.required).toEqual(['vendor_code', 'model_code', 'model_name']);
  });

  it('rejects a header that is not in the file and an unknown field', () => {
    expect(validateMapping('vendor', headers, { vendor_code: 'NOPE', vendor_name: 'VN', extra: 'VC' })).toEqual([
      { path: ['mapping', 'extra'], code: 'unknown_field' },
      { path: ['mapping', 'vendor_code'], code: 'unknown_header' },
    ]);
  });

  it('rejects one header mapped to two fields as duplicate_source', () => {
    expect(validateMapping('vendor', headers, { vendor_code: 'VC', vendor_name: 'VC' })).toEqual([
      { path: ['mapping', 'vendor_name'], code: 'duplicate_source' },
    ]);
  });

  it('judges the mapping shape', () => {
    expect(mappingShapeErrors(null)).toEqual([{ path: ['mapping'], code: 'required' }]);
    expect(mappingShapeErrors([])).toEqual([{ path: ['mapping'], code: 'required' }]);
    expect(mappingShapeErrors({ a: 1, b: '' })).toEqual([
      { path: ['mapping', 'a'], code: 'required' },
      { path: ['mapping', 'b'], code: 'required' },
    ]);
    expect(mappingShapeErrors({ a: 'x' })).toEqual([]);
  });
});
