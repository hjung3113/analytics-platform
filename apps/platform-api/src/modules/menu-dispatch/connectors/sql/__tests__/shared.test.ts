import { describe, expect, it } from 'vitest';

import { createConcurrencyGate } from '../shared.js';

const never = () => new Promise<never>(() => {});
const settled = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('createConcurrencyGate', () => {
  it('admits up to the cap and queues the rest in arrival order', async () => {
    const gate = createConcurrencyGate(2);
    const order: string[] = [];
    const a = await gate.acquire(never());
    const b = await gate.acquire(never());
    const c = gate.acquire(never()).then((release) => { order.push('c'); return release; });
    const d = gate.acquire(never()).then((release) => { order.push('d'); return release; });
    await settled();
    expect(order).toEqual([]);
    a();
    await settled();
    expect(order).toEqual(['c']);
    b();
    await settled();
    expect(order).toEqual(['c', 'd']);
    (await c)();
    (await d)();
  });

  it('counts a double release once', async () => {
    const gate = createConcurrencyGate(1);
    const first = await gate.acquire(never());
    first();
    first();
    const second = await gate.acquire(never());
    let third = false;
    void gate.acquire(never()).then(() => { third = true; });
    await settled();
    expect(third).toBe(false);
    second();
  });

  it('does not leak capacity when a waiter is stopped', async () => {
    const gate = createConcurrencyGate(1);
    const held = await gate.acquire(never());
    let stop: (error: Error) => void = () => {};
    const stopped = new Promise<never>((_resolve, reject) => { stop = reject; });
    const waiting = gate.acquire(stopped);
    stop(new Error('stopped'));
    await expect(waiting).rejects.toThrow('stopped');
    held();
    const next = await gate.acquire(never());
    let blocked = true;
    void gate.acquire(never()).then(() => { blocked = false; });
    await settled();
    expect(blocked).toBe(true);
    next();
  });

  it('rejects at once when already stopped and the gate is full', async () => {
    const gate = createConcurrencyGate(1);
    const held = await gate.acquire(never());
    const stopped = Promise.reject<never>(new Error('late'));
    stopped.catch(() => {});
    await expect(gate.acquire(stopped)).rejects.toThrow('late');
    held();
    (await gate.acquire(never()))();
  });
});
