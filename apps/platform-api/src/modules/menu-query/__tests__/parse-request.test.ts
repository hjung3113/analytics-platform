import { describe, expect, it } from 'vitest';

import { judgeMenuQuery } from '../parse-request.js';

const ok = { endpoint: 'home.notices', context: {}, params: { targetScopeId: null } };

describe('judgeMenuQuery', () => {
  it('accepts the exact home.notices request, global and site-targeted', () => {
    expect(judgeMenuQuery(ok)).toEqual({ ok: true, endpoint: 'home.notices', targetScopeId: null });
    expect(judgeMenuQuery({ ...ok, params: { targetScopeId: 'MEM' } })).toMatchObject({
      ok: true,
      targetScopeId: 'MEM',
    });
  });

  it.each([
    ['null body', null],
    ['array body', []],
    ['extra top-level key', { ...ok, extra: 1 }],
    ['missing context', { endpoint: ok.endpoint, params: ok.params }],
    ['missing params', { endpoint: ok.endpoint, context: {} }],
    ['unknown endpoint', { ...ok, endpoint: 'productivity.summary' }],
    ['analytical endpoint is not proxied', { ...ok, endpoint: 'mem.hwtime' }],
    ['context key outside the declaration', { ...ok, context: { scopeId: null } }],
    ['context from/to', { ...ok, context: { from: '2026-01-01T00:00:00' } }],
    ['context not an object', { ...ok, context: [] }],
    ['unknown param key', { ...ok, params: { targetScopeId: null, other: 1 } }],
    ['missing param key', { ...ok, params: {} }],
    ['params not an object', { ...ok, params: null }],
    ['targetScopeId number', { ...ok, params: { targetScopeId: 1 } }],
    ['targetScopeId undefined value', { ...ok, params: { targetScopeId: undefined } }],
    ['targetScopeId with NUL', { ...ok, params: { targetScopeId: 'A\u0000B' } }],
    ['targetScopeId lone surrogate', { ...ok, params: { targetScopeId: '\ud800' } }],
  ])('rejects %s as an error', (_name, body) => {
    expect(judgeMenuQuery(body)).toMatchObject({ ok: false });
  });
});
