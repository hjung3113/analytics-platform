import { describe, expect, it } from 'vitest';
import { parseDiagnosticItemParams, parseDiagnosticListParams } from '../domain/diagnostic-params.js';
const attemptId = '00000000-0000-4000-8000-000000000001';
const item = { attemptId, producer: 'synthetic', itemKey: 'synthetic:item' };
describe('diagnostic read params', () => {
  it('accepts paged list and explicit table continuation', () => {
    expect(parseDiagnosticListParams({ attemptId, page: 1, pageSize: 100 })).toEqual({ ok: true, value: { attemptId, page: 1, pageSize: 100 } });
    expect(parseDiagnosticItemParams({ ...item, tableKey: 'data', rowOffset: 100 }).ok).toBe(true);
  });
  it.each([{ attemptId, pageSize: 101 }, { attemptId, page: -1 }, { attemptId, title: 'untrusted' }, { attemptId: 'not-an-id' }])('rejects invalid list params %s', (params) => expect(parseDiagnosticListParams(params).ok).toBe(false));
  it.each([{ ...item, rowOffset: 100 }, { ...item, tableKey: 'data', rowOffset: -1 }, { ...item, producer: '../file' }, { ...item, file: 'attachment' }])('rejects invalid item params %s', (params) => expect(parseDiagnosticItemParams(params).ok).toBe(false));
});
