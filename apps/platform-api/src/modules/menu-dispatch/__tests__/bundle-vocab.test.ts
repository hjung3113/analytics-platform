import { assessmentKindSchema } from '@ap/contract-schemas';
import { describe, expect, it } from 'vitest';

import { CONTEXT_WIRE_FIELDS } from '../bundle/bindings.js';
import { ASSESSMENT_KINDS } from '../bundle/routing.js';
import { appliedContextFields } from '../query.js';
import { testEndpoint } from './test-declarations.js';

// Local copies stay pinned to the contract sources: the assessment kinds to @ap/contract-schemas (core-server's runtime contract package).
describe('declaration vocabulary drift', () => {
  it('pins assessment kinds against @ap/contract-schemas', () => {
    expect([...ASSESSMENT_KINDS]).toEqual([...assessmentKindSchema.options]);
  });
  it('pins binding wire fields against the request projection', () => {
    expect(Object.entries(CONTEXT_WIRE_FIELDS).flatMap(([_key, fields]) => [...fields]))
      .toEqual(appliedContextFields(testEndpoint({ context: { time: 'apply', roomNames: 'apply', line: 'apply', prcGroup: 'apply', condition: 'apply', selection: 'apply', lot: 'apply', ppid: 'apply', recipe: 'apply', metric: 'apply' } }).declaration).filter((key) => key !== 'membershipBasis'));
  });
});
