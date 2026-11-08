import { describe, expect, it } from 'vitest';

import { parseModelOptionParams, parseSoftwareOptionParams } from '../domain/coverage-params.js';

const UUID = '3f2b8c1e-5a4d-4e6f-9a1b-2c3d4e5f6a7b';

describe('picker option params (#1496)', () => {
  it('model options default to page 0, size 20, no search', () => {
    expect(parseModelOptionParams({})).toEqual({ ok: true, value: { q: null, page: 0, pageSize: 20 } });
  });
  it.each([{ q: 5 }, { q: 'x'.repeat(201) }, { page: -1 }, { page: 1.5 }, { pageSize: 0 }, { pageSize: 201 }])('refuses %j', (p) => {
    expect(parseModelOptionParams(p).ok).toBe(false);
  });
  it('software options need a model uuid, lower-cased', () => {
    expect(parseSoftwareOptionParams({ modelId: UUID.toUpperCase() })).toEqual({ ok: true, value: UUID });
    expect(parseSoftwareOptionParams({}).ok).toBe(false);
    expect(parseSoftwareOptionParams({ modelId: 'nope' }).ok).toBe(false);
  });
});
