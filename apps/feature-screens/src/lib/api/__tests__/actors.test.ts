// #763 node r — resolveActors goes through client.ts (bridge-safe) and keeps the standalone error classes.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveActors } from '../actors';
import { configureApiClient } from '../client';
import { UnauthenticatedError } from '../unauthenticated';

const originalFetch = global.fetch;
const onUnauthorized = vi.fn();
beforeEach(() => configureApiClient({ basePath: '/api/features', onUnauthorized }));
afterEach(() => {
  global.fetch = originalFetch;
  configureApiClient({ basePath: '' });
  onUnauthorized.mockReset();
});

function stub(res: Response) {
  const fetchMock = vi.fn(async () => res);
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe('resolveActors with a base path', () => {
  it('requests the prefixed URL with both params, credentials included and the signal', async () => {
    const body = { actors: [{ id: 'a1', display_name: 'A', email: 'a@x' }], teams: [] };
    const fetchMock = stub(new Response(JSON.stringify(body), { status: 200 }));
    const controller = new AbortController();
    await expect(
      resolveActors({ actorIds: ['a1', 'a2'], teamIds: ['t1'] }, controller.signal),
    ).resolves.toEqual(body);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/features/actors/resolve?actor_ids=a1%2Ca2&team_ids=t1');
    expect(init.credentials).toBe('include');
    expect(init.signal).toBeDefined();
  });

  it('omits the query when both id lists are empty', async () => {
    const fetchMock = stub(
      new Response(JSON.stringify({ actors: [], teams: [] }), { status: 200 }),
    );
    await resolveActors({ actorIds: [], teamIds: [] });
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toBe('/api/features/actors/resolve');
  });

  it('calls onUnauthorized on 401 and rejects with UnauthenticatedError', async () => {
    stub(
      new Response(JSON.stringify({ code: 'auth.unauthenticated', message: 'no' }), {
        status: 401,
      }),
    );
    await expect(resolveActors({ actorIds: ['a1'] })).rejects.toBeInstanceOf(UnauthenticatedError);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('rejects other failures with the legacy Error message', async () => {
    stub(new Response(JSON.stringify({ code: 'internal', message: 'x' }), { status: 500 }));
    const error = await resolveActors({ actorIds: ['a1'] }).catch((e: unknown) => e);
    expect(error).not.toBeInstanceOf(UnauthenticatedError);
    expect((error as Error).message).toBe('/actors/resolve failed: 500');
  });

  it('rejects a malformed body', async () => {
    stub(new Response(JSON.stringify({ actors: [] }), { status: 200 }));
    await expect(resolveActors({ actorIds: ['a1'] })).rejects.toThrow();
  });
});

describe('bridge-safe import graph of the Tasks shared reads', () => {
  const src = resolve(__dirname, '../../..');
  const files = [
    'lib/api/actors.ts',
    'features/tasks/adapters/taskDisplayAdapters.ts',
    'features/findings/hooks/useFindingDetail.ts',
    'features/tasks/routes/task-requests/useTaskRequestPanelController.ts',
  ];
  const banned = ['@/lib/api', '@/lib/api/managed-systems', '@/features/findings/public'];

  it.each(files)('%s imports no barrel, managed-systems or findings public seam', (file) => {
    const text = readFileSync(resolve(src, file), 'utf8');
    const specifiers = [...text.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
    for (const spec of specifiers) expect(banned).not.toContain(spec);
  });

  it('actors.ts calls no fetch directly', () => {
    expect(readFileSync(resolve(src, 'lib/api/actors.ts'), 'utf8')).not.toContain('fetch(');
  });
});
