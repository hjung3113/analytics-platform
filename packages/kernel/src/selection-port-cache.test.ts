import { expect, it } from 'vitest';
import { createPortCache } from './selection-port-cache';

it('bounds inactive query/context churn to 50 recent entries per owner, retaining subscribed entries and isolating panes', () => {
  const cache = createPortCache();
  const send = async () => ({ items: [], nextCursor: null });
  const ensure = (owner: string, key: string) => cache.ensure(owner, key, send, String);
  const active = ensure('main', 'active');
  const unsubscribe = active.subscribe(() => {});
  const pane = ensure('pane:A', 'saved');
  for (let n = 0; n < 50; n++) ensure('main', JSON.stringify({ query: n, context: { roomNames: [`R${n}`] } }));
  const recentKey = JSON.stringify({ query: 0, context: { roomNames: ['R0'] } });
  const recent = ensure('main', recentKey);
  for (let n = 50; n < 99; n++) ensure('main', JSON.stringify({ query: n, context: { roomNames: [`R${n}`] } }));
  expect(cache.read('main', recentKey)).toBe(recent);
  expect(cache.read('main', JSON.stringify({ query: 1, context: { roomNames: ['R1'] } }))).toBeUndefined();
  expect(cache.read('main', 'active')).toBe(active);
  expect(cache.read('pane:A', 'saved')).toBe(pane);
  expect(cache.read('pane:B', 'saved')).toBeUndefined();
  expect(Array.from({ length: 99 }, (_, n) => cache.read('main', JSON.stringify({ query: n, context: { roomNames: [`R${n}`] } }))).filter(Boolean)).toHaveLength(50);
  unsubscribe();
  expect(cache.read('main', 'active')).toBe(active);
  expect(cache.read('main', recentKey)).toBeUndefined();
});

it('does not evict subscribed entries even when there are more than 50, and prunes on final unsubscribe', () => {
  const cache = createPortCache();
  const cleanups = Array.from({ length: 60 }, (_, n) => cache.ensure('main', String(n), async () => ({ items: [], nextCursor: null }), String).subscribe(() => {}));
  expect(Array.from({ length: 60 }, (_, n) => cache.read('main', String(n))).filter(Boolean)).toHaveLength(60);
  cleanups.forEach(cleanup => cleanup());
  expect(Array.from({ length: 60 }, (_, n) => cache.read('main', String(n))).filter(Boolean)).toHaveLength(50);
});
