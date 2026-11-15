import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchEntityLinksBySource } from '../entity-links';

const SOURCE = '11111111-1111-4111-8111-111111111111';
const link = (id: string) => ({
  id,
  source_type: 'finding',
  source_id: SOURCE,
  target_type: 'task',
  target_id: '22222222-2222-4222-8222-222222222222',
  relation_type: 'related_to',
  visibility: 'internal_only',
  status: 'active',
  managed_system_id: '33333333-3333-4333-8333-333333333333',
  created_by: '44444444-4444-4444-8444-444444444444',
  created_at: '2026-07-10T00:00:00.000Z',
  updated_at: null,
  visibility_state: 'allowed',
});

afterEach(() => vi.unstubAllGlobals());

describe('fetchEntityLinksBySource', () => {
  it('follows the cursor so links past the first page are returned', async () => {
    const urls: URL[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), 'http://localhost');
        urls.push(url);
        const body =
          url.searchParams.get('cursor') === null
            ? { items: [link('a1111111-1111-4111-8111-111111111111')], page: { has_more: true, cursor: 'next' } }
            : { items: [link('b2222222-2222-4222-8222-222222222222')], page: { has_more: false } };
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }),
    );
    const result = await fetchEntityLinksBySource('finding', SOURCE);
    expect(result.items.map((item) => item.id)).toEqual([
      'a1111111-1111-4111-8111-111111111111',
      'b2222222-2222-4222-8222-222222222222',
    ]);
    expect(urls.map((url) => [url.searchParams.get('limit'), url.searchParams.get('cursor')])).toEqual([
      ['100', null],
      ['100', 'next'],
    ]);
  });
});
