import { expect, it } from 'vitest';
import { parseSuitesParams } from '../domain/suite-params.js';

it('accepts and normalises the screen dataset filter without weakening list validation', () => {
  const datasetId = 'ABCDEF00-0000-4000-8000-000000000001';
  expect(parseSuitesParams({ datasetId })).toMatchObject({ ok: true, value: { datasetId: datasetId.toLowerCase() } });
  expect(parseSuitesParams({ datasetId: 'not-an-id' }).ok).toBe(false);
  expect(parseSuitesParams({ datasetId, page: -1 }).ok).toBe(false);
});
