import { afterEach, expect, it, vi } from 'vitest';
import { sleep } from '../server';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
it('rejects an already aborted signal without scheduling a timer (FEA-14)', async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  controller.abort();
  const answer = expect(sleep(100, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  await vi.runAllTimersAsync();
  await answer;
  expect(vi.getTimerCount()).toBe(0);
});
it.each(['finish', 'abort'] as const)('removes the abort listener after %s (FEA-14)', async ending => {
  vi.useFakeTimers();
  const controller = new AbortController();
  const add = vi.spyOn(controller.signal, 'addEventListener');
  const remove = vi.spyOn(controller.signal, 'removeEventListener');
  const pending = sleep(100, controller.signal);
  const answer = pending.then(() => 'finished', error => error.name);
  if (ending === 'abort') controller.abort();
  await vi.runAllTimersAsync();
  expect(await answer).toBe(ending === 'abort' ? 'AbortError' : 'finished');
  expect(add).toHaveBeenCalledWith('abort', expect.any(Function), { once: true });
  expect(remove).toHaveBeenCalledWith('abort', add.mock.calls[0]![1]);
  expect(vi.getTimerCount()).toBe(0);
});
