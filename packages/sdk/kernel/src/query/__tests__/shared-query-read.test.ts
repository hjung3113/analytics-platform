import { expect, it, vi } from 'vitest';
import { createQueryClient, removeOtherGenerations, startQueryEngine } from '../query-engine';
import { readSharedQuery } from '../shared-query-read';

it.each(['cancel', 'generation'] as const)('still cancels a leased request on %s', async action => {
  const client = createQueryClient();
  const stop = startQueryEngine(client);
  const queryKey = ['request', 'old', 'shared', 'fixture'] as const;
  let signal: AbortSignal | undefined;
  const queryFn = vi.fn(({ signal: next }: { signal: AbortSignal }) => {
    signal = next;
    return new Promise<number>(() => {});
  });
  try {
    const pending = readSharedQuery(client, { queryKey, queryFn });
    const rejected = expect(pending).rejects.toMatchObject({ name: 'Error', message: 'CancelledError' });
    expect(queryFn).toHaveBeenCalledTimes(1);
    if (action === 'cancel') await client.cancelQueries({ queryKey, exact: true });
    else removeOtherGenerations(client, 'new');
    await rejected;
    expect(signal?.aborted).toBe(true);
  } finally { stop(); client.clear(); }
});

it('releases an aborted caller lease while another waiter keeps the shared fetch alive', async () => {
  const client = createQueryClient();
  const stop = startQueryEngine(client);
  let release!: (value: number) => void;
  let signal: AbortSignal | undefined;
  const queryFn = vi.fn(({ signal: next }: { signal: AbortSignal }) => {
    signal = next;
    return new Promise<number>(resolve => { release = resolve; });
  });
  const options = { queryKey: ['request', 'gen', 'shared', 'fixture'], queryFn };
  const controller = new AbortController();
  try {
    const first = readSharedQuery(client, options, controller.signal);
    const second = readSharedQuery(client, options);
    const rejected = expect(first).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await rejected;
    expect(client.getQueryCache().find({ queryKey: options.queryKey })?.getObserversCount()).toBe(1);
    expect(signal?.aborted).toBe(false);
    release(42);
    await expect(second).resolves.toBe(42);
    expect(queryFn).toHaveBeenCalledTimes(1);
    expect(client.getQueryCache().find({ queryKey: options.queryKey })?.getObserversCount()).toBe(0);
  } finally { stop(); client.clear(); }
});
