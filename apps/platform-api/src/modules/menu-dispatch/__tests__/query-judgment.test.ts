import { describe, expect, it } from 'vitest';

import { homeNoticesContribution } from '../../menu-query/home-notices.js';
import type { Db } from '../../../db/client.js';
import type { CheckService } from '../../permissions/check-service.js';
import { createMenuDispatchRegistry } from '../registry.js';
import { judgeQueryShape, runQuery } from '../query.js';
import { registryOf, testEndpoint } from './test-declarations.js';

const actor = { actor_id: 'a', workspace_id: 'w', role_level: 'user' };
const run = (declarationRegistry: ReturnType<typeof registryOf>, body: unknown) => {
  const shape = judgeQueryShape(body, declarationRegistry);
  return shape.ok ? runQuery(shape, actor, 'cid') : Promise.resolve(shape);
};

// ── home.notices through the registry: the table of the former `judgeMenuQuery` (shape + params, steps 1–2).
const homeRegistry = createMenuDispatchRegistry([
  homeNoticesContribution({ db: {} as Db, checkService: {} as CheckService }),
]);
const ok = { endpoint: 'home.notices', context: {}, params: { targetScopeId: null } };

describe('judgeQueryShape (home.notices)', () => {
  it('accepts the exact home.notices request, global and site-targeted', () => {
    expect(judgeQueryShape(ok, homeRegistry)).toMatchObject({ ok: true, params: { targetScopeId: null } });
    expect(judgeQueryShape({ ...ok, params: { targetScopeId: 'MEM' } }, homeRegistry)).toMatchObject({
      ok: true,
      params: { targetScopeId: 'MEM' },
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
    expect(judgeQueryShape(body, homeRegistry)).toMatchObject({ ok: false });
  });
});

// ── generic judgment, DB-free.
const timeSpec = { context: { time: 'apply', line: 'apply' } as const };
const withLine = (lineNames: unknown, extra: Record<string, unknown> = {}) => ({
  endpoint: 'test.rows',
  context: { from: '2026-10-01T00:00:00', to: '2026-10-02T00:00:00', lineNames, ...extra },
  params: { q: 'x' },
});

describe('judgeQueryShape (applied Context)', () => {
  const registry = registryOf([testEndpoint(timeSpec).declaration]);
  it('accepts exactly the applied keys', () => {
    expect(judgeQueryShape(withLine(null), registry)).toMatchObject({ ok: true });
  });

  it.each([
    ['an unapplied key', withLine(null, { roomNames: null })],
    ['a missing applied key', { endpoint: 'test.rows', context: { from: '2026-10-01T00:00:00', to: '2026-10-02T00:00:00' }, params: { q: 'x' } }],
    ['a null time bound', withLine(null, { to: null })],
    ['a non-wall-clock time', withLine(null, { from: '2026-10-01' })],
    ['a non-array set', withLine('LINE1')],
    ['a blank id in a set', withLine([' '])],
    ['a duplicate id in a set', withLine(['A', 'A'])],
  ])('rejects %s', (_name, body) => {
    expect(judgeQueryShape(body, registry)).toMatchObject({ ok: false });
  });

  it('rejects a metricVersion without metricId and asOf without a base', () => {
    const metric = registryOf([testEndpoint({ context: { metric: 'apply' } }).declaration]);
    expect(
      judgeQueryShape({ endpoint: 'test.rows', context: { metricId: null, metricVersion: 'v1' }, params: { q: 1 } }, metric),
    ).toMatchObject({ ok: false });
    const basis = registryOf([testEndpoint({ context: { condition: 'apply' } }).declaration]);
    expect(
      judgeQueryShape({ endpoint: 'test.rows', context: { condition: null, membershipBasis: 'asOf' }, params: { q: 1 } }, basis),
    ).toMatchObject({ ok: false });
  });

  it('rejects a null required Context key', () => {
    const required = registryOf([testEndpoint({ ...timeSpec, requiredContext: ['line'] }).declaration]);
    expect(judgeQueryShape(withLine(null), required)).toMatchObject({ ok: false });
    expect(judgeQueryShape(withLine([]), required)).toMatchObject({ ok: true });
  });

  it('lets the endpoint refuse a param value as an error', () => {
    const picky = registryOf([
      testEndpoint({}, { validate: () => ({ ok: false, message: 'q is not in the family' }) }).declaration,
    ]);
    expect(judgeQueryShape({ endpoint: 'test.rows', context: {}, params: { q: 'x' } }, picky)).toEqual({
      ok: false,
      message: 'q is not in the family',
    });
  });
});

describe('runQuery order (steps 3–10)', () => {
  const body = { endpoint: 'test.rows', context: {}, params: { q: 'x' } };

  it('judges permission before the handler: forbidden, handler never reached', async () => {
    const { declaration, calls } = testEndpoint({}, { allow: false });
    expect(await run(registryOf([declaration]), body)).toMatchObject({ outcome: 'forbidden', data: null });
    expect(calls.handled).toBe(0);
  });

  it('answers ok with the handler data and the default assessments/trust', async () => {
    const { declaration } = testEndpoint();
    expect(await run(registryOf([declaration]), body)).toEqual({
      outcome: 'ok',
      data: [{ id: 1 }],
      assessments: [],
      trust: null,
    });
  });

  it('passes the handler-owned assessments, trust and message through', async () => {
    const { declaration } = testEndpoint(
      {},
      { result: { outcome: 'ok', data: [], assessments: [{ kind: 'x' }], trust: { y: 1 }, message: 'm' } },
    );
    expect(await run(registryOf([declaration]), body)).toMatchObject({
      assessments: [{ kind: 'x' }],
      trust: { y: 1 },
      message: 'm',
    });
  });

  it('answers an explicit empty set as empty without reading the source', async () => {
    const { declaration, calls } = testEndpoint(timeSpec);
    expect(await run(registryOf([declaration]), withLine([]))).toMatchObject({ outcome: 'empty', data: null });
    expect(calls.handled).toBe(0);
  });

  it('judges maxHours before the empty set, and a narrowing Selection lifts it', async () => {
    const spec = { context: { time: 'apply', selection: 'apply' } as const, limits: { maxHours: 24 } };
    const { declaration, calls } = testEndpoint(spec);
    const registry = registryOf([declaration]);
    const wide = (selection: string[] | null) => ({
      endpoint: 'test.rows',
      context: { from: '2026-10-01T00:00:00', to: '2026-10-03T00:00:00', selection },
      params: { q: 'x' },
    });
    expect(await run(registry, wide(null))).toMatchObject({ outcome: 'too_large', data: null });
    expect(await run(registry, wide([]))).toMatchObject({ outcome: 'too_large' });
    expect(calls.handled).toBe(0);
    expect(await run(registry, wide(['E1']))).toMatchObject({ outcome: 'ok' });
  });

  it.each([
    ['at the cap', 2, 'ok'],
    ['over the cap', 3, 'too_large'],
  ])('judges maxRows on the whole result, %s', async (_name, rows, outcome) => {
    const { declaration } = testEndpoint(
      { limits: { maxRows: 2 } },
      { result: { outcome: 'ok', data: Array.from({ length: rows }, (_, i) => ({ i })) } },
    );
    const answer = await run(registryOf([declaration]), body);
    expect(answer).toMatchObject({ outcome });
    if (outcome === 'too_large') expect(answer).toMatchObject({ data: null });
  });

  it('turns a declared maxRows with a non-array result into an error', async () => {
    const { declaration } = testEndpoint({ limits: { maxRows: 2 } }, { result: { outcome: 'ok', data: { x: 1 } } });
    expect(await run(registryOf([declaration]), body)).toMatchObject({ outcome: 'error', data: null });
  });
});
