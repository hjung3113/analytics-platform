import { afterEach, describe, expect, it } from 'vitest';
import type { AnnotationInput } from '@ap/contracts';
import { listAnnotations, resetAnnotations, saveAnnotation, storedAnnotations } from './annotations';
import { getRole, setRole, setScenario } from './server';
import type { RoleId } from './world';

const input = (over: Partial<AnnotationInput> = {}): AnnotationInput => ({
  chartId: 'cycle-time', scopeId: 'ICH', from: '2026-09-25T09:00:00', to: '2026-09-25T12:00:00', text: 'PM 작업', ...over,
});
const fast = { latency: 0 };

const previousRole: RoleId = getRole();
afterEach(() => { resetAnnotations(); setScenario('normal'); setRole(previousRole); });

describe('chart annotations (issue #103)', () => {
  it('saves a note with a server-stamped id and time and reads it back at the same site', async () => {
    setRole('engineer');
    const saved = await saveAnnotation(input(), undefined, fast);
    expect(saved.outcome).toBe('ok');
    expect(saved.data).toEqual({ id: 'ann-1', chartId: 'cycle-time', scopeId: 'ICH', from: '2026-09-25T09:00:00', to: '2026-09-25T12:00:00', text: 'PM 작업', at: expect.any(String) });
    expect(storedAnnotations()[0].authorId).toBe('engineer');
    const read = await listAnnotations({ chartId: 'cycle-time', scopeId: 'ICH' }, undefined, fast);
    expect(read.outcome).toBe('ok');
    expect(read.data?.items).toEqual([saved.data]);
    expect(JSON.stringify(read.data)).not.toContain('authorId');
  });

  it('a note written at one site never appears at another site, even for the same chart and a role granted at both', async () => {
    setRole('admin');
    await saveAnnotation(input({ scopeId: 'ICH' }), undefined, fast);
    const other = await listAnnotations({ chartId: 'cycle-time', scopeId: 'CJU' }, undefined, fast);
    expect(other.outcome).toBe('empty');
    expect(other.data).toBeNull();
    const own = await listAnnotations({ chartId: 'cycle-time', scopeId: 'ICH' }, undefined, fast);
    expect(own.data?.items).toHaveLength(1);
  });

  it('a note is shared with other users of the same site and does not leak across charts', async () => {
    setRole('admin');
    await saveAnnotation(input(), undefined, fast);
    setRole('engineer');
    expect((await listAnnotations({ chartId: 'cycle-time', scopeId: 'ICH' }, undefined, fast)).data?.items).toHaveLength(1);
    expect((await listAnnotations({ chartId: 'productivity', scopeId: 'ICH' }, undefined, fast)).outcome).toBe('empty');
  });

  it('refuses a site the role holds no grant in, for both read and write, without touching the store', async () => {
    setRole('viewer');
    // viewer has no analytics:view at all; the site gate is proven separately below with engineer.
    expect((await saveAnnotation(input(), undefined, fast)).outcome).toBe('forbidden');
    setRole('engineer');
    const denied = await saveAnnotation(input({ scopeId: 'XIA' }), undefined, fast);
    expect(denied).toMatchObject({ outcome: 'forbidden', message: 'No grant for scope XIA' });
    expect((await listAnnotations({ chartId: 'cycle-time', scopeId: 'XIA' }, undefined, fast)).outcome).toBe('forbidden');
    expect(storedAnnotations()).toHaveLength(0);
  });

  it('answers forbidden without the chart permission, before anything else', async () => {
    setRole('viewer');
    expect(await listAnnotations({ chartId: 'cycle-time', scopeId: 'ICH' }, undefined, fast)).toMatchObject({ outcome: 'forbidden', message: 'No permission analytics:view' });
  });

  it('a null or unknown scope is never "all sites"', async () => {
    setRole('admin');
    await saveAnnotation(input(), undefined, fast);
    expect((await listAnnotations({ chartId: 'cycle-time', scopeId: null }, undefined, fast)).outcome).toBe('forbidden');
    expect((await saveAnnotation(input({ scopeId: null }), undefined, fast)).outcome).toBe('forbidden');
    expect((await listAnnotations({ chartId: 'cycle-time', scopeId: 'NOPE' }, undefined, fast)).outcome).toBe('forbidden');
    expect(storedAnnotations()).toHaveLength(1);
  });

  it('rejects the whole call on an unknown key, so the client cannot stamp author, time or id', async () => {
    setRole('admin');
    for (const extra of [{ userId: 'admin' }, { at: '2020-01-01T00:00' }, { id: 'ann-99' }, { authorId: 'x' }]) {
      const res = await saveAnnotation({ ...input(), ...extra } as unknown as AnnotationInput, undefined, fast);
      expect(res).toMatchObject({ outcome: 'error', message: 'Invalid annotation request' });
    }
    expect((await listAnnotations({ chartId: 'cycle-time', scopeId: 'ICH', extra: 1 } as never, undefined, fast)).outcome).toBe('error');
    expect(storedAnnotations()).toHaveLength(0);
  });

  it.each([
    ['blank text', { text: '   ' }],
    ['over-long text', { text: 'x'.repeat(201) }],
    ['empty from', { from: '' }],
    ['control character in to', { to: 'a\u0000b' }],
    ['chart id with a query string', { chartId: 'a?b=1' }],
  ])('rejects %s', async (_label, over) => {
    setRole('admin');
    expect((await saveAnnotation(input(over), undefined, fast)).outcome).toBe('error');
    expect(storedAnnotations()).toHaveLength(0);
  });

  it('pins the identity at send time: a role switch while a request is in flight does not re-evaluate it', async () => {
    setRole('admin');
    const pending = saveAnnotation(input(), undefined, { latency: 20 });
    setRole('viewer');
    expect((await pending).outcome).toBe('ok');
  });

  it('honors the dev scenarios: timeout, error and forbidden apply to reads and writes, empty only to reads', async () => {
    setRole('admin');
    await saveAnnotation(input(), undefined, fast);
    for (const scenario of ['timeout', 'error', 'forbidden'] as const) {
      setScenario(scenario);
      expect((await listAnnotations({ chartId: 'cycle-time', scopeId: 'ICH' }, undefined, fast)).outcome).toBe(scenario);
      expect((await saveAnnotation(input(), undefined, fast)).outcome).toBe(scenario);
    }
    setScenario('empty');
    expect((await listAnnotations({ chartId: 'cycle-time', scopeId: 'ICH' }, undefined, fast)).outcome).toBe('empty');
    expect((await saveAnnotation(input(), undefined, fast)).outcome).toBe('ok');
  });
});
