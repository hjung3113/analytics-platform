import { describe, expect, it } from 'vitest';
import { bootstrapHttpAdapter } from '../index.js';
import { bootstrapBody, json, server } from './test-support.js';

describe('optional requestableScopes snapshot', () => {
  it.each([{ requestableScopes: undefined }, { requestableScopes: [{ id: 'SITE-C', label: 'C', totalRooms: 2, future: true }] }])('parses the additive field $requestableScopes', async ({ requestableScopes }) => {
    const body = bootstrapBody();
    const source = server(() => json({ ...body, session: { ...body.session, ...(requestableScopes ? { requestableScopes } : {}) } }));
    const result = await bootstrapHttpAdapter({ fetch: source.fetch });
    expect(result.kind).toBe('ready');
    if (result.kind === 'ready') expect(result.adapter.session().requestableScopes).toEqual(requestableScopes);
  });
  it.each([{ requestableScopes: null }, { requestableScopes: {} }, { requestableScopes: [{ id: 'SITE-C', label: 'C', totalRooms: '2' }] }])('refuses a malformed requestableScopes $requestableScopes', async ({ requestableScopes }) => {
    const body = bootstrapBody();
    const source = server(() => json({ ...body, session: { ...body.session, requestableScopes } }));
    expect((await bootstrapHttpAdapter({ fetch: source.fetch })).kind).toBe('unavailable');
  });
});
