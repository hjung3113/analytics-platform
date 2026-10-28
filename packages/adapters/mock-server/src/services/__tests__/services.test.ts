import { afterEach, describe, expect, it } from 'vitest';
import { PREFERENCE_KEYS_MAX, PREFERENCE_VALUE_MAX_BYTES } from '@ap/contracts';
import { deleteNotice, importPreferences, listNotices, lookupPeople, patchPreferences, readPreferences, resetNotices, resetPreferences, saveNotice } from '../services';
import { getRole, setRole, setScenario } from '../../server';
import { createMockAdapter } from '../../adapter';
import type { RoleId } from '../../world';

const fast = { latency: 0 };
const as = (role: RoleId) => ({ ...fast, role });
const previousRole: RoleId = getRole();
afterEach(() => { resetPreferences(); resetNotices(); setScenario('normal'); setRole(previousRole); });

const text = { ko: '제목', en: 'Title' };
const draft = { title: text, content: text, scopeId: null, until: '2026-10-30T00:00:00' };

describe('preferences', () => {
  it('survive calls, merge patches and distinguish null from removed', async () => {
    expect((await readPreferences(undefined, as('engineer'))).data).toEqual({ values: {}, importedAt: null });
    await patchPreferences({ set: { lang: 'ko', favorites: ['a'] } }, undefined, as('engineer'));
    await patchPreferences({ set: { lastScope: null }, remove: ['favorites'] }, undefined, as('engineer'));
    expect((await readPreferences(undefined, as('engineer'))).data?.values).toEqual({ lang: 'ko', lastScope: null });
  });

  it('are isolated per session user: another role neither reads nor overwrites them', async () => {
    await patchPreferences({ set: { lang: 'ko' } }, undefined, as('engineer'));
    expect((await readPreferences(undefined, as('admin'))).data?.values).toEqual({});
    await patchPreferences({ set: { lang: 'en' } }, undefined, as('admin'));
    expect((await readPreferences(undefined, as('engineer'))).data?.values).toEqual({ lang: 'ko' });
  });

  it('a request sent before a role switch still writes into the user it was sent as', async () => {
    setRole('engineer');
    const pending = patchPreferences({ set: { lang: 'ko' } }, undefined, { latency: 5 });
    setRole('admin');
    await pending;
    expect((await readPreferences(undefined, as('engineer'))).data?.values).toEqual({ lang: 'ko' });
    expect((await readPreferences(undefined, as('admin'))).data?.values).toEqual({});
  });

  it.each([
    ['overlapping set/remove', { set: { lang: 'ko' }, remove: ['lang'] }, 'error'],
    ['key outside the grammar', { set: { 'favorites:u2': 1 } }, 'error'],
    ['a forged identity', { set: {}, userId: 'admin' }, 'error'],
    ['duplicate remove', { remove: ['lang', 'lang'] }, 'error'],
    ['an oversized value', { set: { favorites: 'x'.repeat(PREFERENCE_VALUE_MAX_BYTES) } }, 'too_large'],
  ])('rejects %s and writes nothing', async (_name, patch, outcome) => {
    const result = await patchPreferences({ ...(patch as object) } as never, undefined, as('engineer'));
    expect(result.outcome).toBe(outcome);
    expect((await readPreferences(undefined, as('engineer'))).data?.values).toEqual({});
  });

  it('import saves only missing keys atomically, stamps importedAt, and is a permanent no-op afterwards', async () => {
    await patchPreferences({ set: { lang: 'ko' } }, undefined, as('engineer'));
    const done = await importPreferences({ values: { lang: 'en', favorites: ['a'] } }, undefined, as('engineer'));
    expect(done.data?.values).toEqual({ lang: 'ko', favorites: ['a'] });
    expect(done.data?.importedAt).toEqual(expect.any(String));
    await patchPreferences({ remove: ['favorites'] }, undefined, as('engineer'));
    const again = await importPreferences({ values: { favorites: ['resurrected'], recents: [] } }, undefined, as('engineer'));
    expect(again.data?.values).toEqual({ lang: 'ko' });
    expect(again.data?.importedAt).toBe(done.data?.importedAt);
  });

  it('an invalid import changes nothing and does not complete the import', async () => {
    const bad = await importPreferences({ values: { lang: 'en', 'columns:': 1 } }, undefined, as('engineer'));
    expect(bad.outcome).toBe('error');
    const read = (await readPreferences(undefined, as('engineer'))).data;
    expect(read).toEqual({ values: {}, importedAt: null });
    expect((await importPreferences({ values: { lang: 'en' }, userId: 'x' } as never, undefined, as('engineer'))).outcome).toBe('error');
    const many = Object.fromEntries(Array.from({ length: PREFERENCE_KEYS_MAX + 1 }, (_, i) => [`columns:k${i}`, 1]));
    expect((await importPreferences({ values: many }, undefined, as('engineer'))).outcome).toBe('too_large');
  });

  it('answers the scenario outcomes with null trust and no assessments', async () => {
    setScenario('error');
    const result = await readPreferences(undefined, as('engineer'));
    expect(result).toMatchObject({ outcome: 'error', data: null, trust: null, assessments: [] });
  });

  it('is reachable through the adapter', async () => {
    const adapter = createMockAdapter({ endpoints: [], registry: { menus: [] } });
    setRole('viewer');
    expect((await adapter.readPreferences()).outcome).toBe('ok');
  });
});

describe('people lookup', () => {
  it('returns exactly the requested ids with only GroupMember fields; unknown ids are absent', async () => {
    const found = await lookupPeople(['admin', 'nobody', 'admin'], undefined, as('viewer'));
    expect(found).toEqual([{ userId: 'admin', displayName: expect.any(String), affiliation: expect.any(String) }]);
    expect(Object.keys(found[0]!).sort()).toEqual(['affiliation', 'displayName', 'userId']);
    expect(await lookupPeople([], undefined, fast)).toEqual([]);
  });

  it('rejects a malformed or over-cap id list instead of searching', async () => {
    await expect(lookupPeople([''], undefined, fast)).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(lookupPeople(Array.from({ length: 201 }, (_, i) => `u${i}`), undefined, fast)).rejects.toMatchObject({ code: 'invalid_input' });
  });
});

describe('notices', () => {
  it('lists for notice:view including expired rows, hides other sites from users without a grant, forbids without the permission', async () => {
    const admin = await listNotices(undefined, as('admin'));
    expect(admin.data?.items.map(n => n.id)).toEqual(['N-mock-1', 'N-mock-2']);
    const viewer = await listNotices(undefined, as('viewer'));
    expect(viewer.data?.items.map(n => n.id)).toEqual(['N-mock-1', 'N-mock-2']); // viewer is granted MEM
    const engineer = await listNotices(undefined, as('engineer'));
    expect(engineer.outcome).toBe('ok');
    expect(engineer.trust).toBeNull();
  });

  it('writes need console:access; the engineer and viewer are forbidden and nothing changes', async () => {
    for (const role of ['engineer', 'viewer'] as const) {
      expect((await saveNotice({ ...draft, idempotencyKey: `k-${role}` }, undefined, as(role))).outcome).toBe('forbidden');
      expect((await deleteNotice({ id: 'N-mock-1', expectedVersion: 'v1', idempotencyKey: `d-${role}` }, undefined, as(role))).outcome).toBe('forbidden');
    }
    expect((await listNotices(undefined, as('admin'))).data?.items).toHaveLength(2);
  });

  it('creates with a server id and version, updates under the expected version, conflicts on a stale one', async () => {
    const created = await saveNotice({ ...draft, idempotencyKey: 'k1' }, undefined, as('admin'));
    expect(created).toMatchObject({ outcome: 'ok', version: 'v1', replayed: false, data: { id: 'N-mock-3', version: 'v1' } });
    const updated = await saveNotice({ ...draft, title: { ko: '수정', en: 'Edited' }, id: 'N-mock-3', expectedVersion: 'v1', idempotencyKey: 'k2' }, undefined, as('admin'));
    expect(updated).toMatchObject({ outcome: 'ok', version: 'v2', data: { title: { en: 'Edited' } } });
    const stale = await saveNotice({ ...draft, id: 'N-mock-3', expectedVersion: 'v1', idempotencyKey: 'k3' }, undefined, as('admin'));
    expect(stale).toMatchObject({ outcome: 'conflict', data: null, version: 'v2' });
    expect((await saveNotice({ ...draft, id: 'nope', expectedVersion: 'v1', idempotencyKey: 'k4' }, undefined, as('admin'))).outcome).toBe('not_found');
  });

  it.each([
    ['author', { author: 'u1' }],
    ['version', { version: 'v9' }],
    ['createdAt', { createdAt: '2026-10-28T00:00:00Z' }],
  ])('create rejects a supplied %s', async (key, extra) => {
    const result = await saveNotice({ ...draft, idempotencyKey: 'kx', ...extra } as never, undefined, as('admin'));
    expect(result.outcome).toBe('invalid');
    expect(result.fieldErrors).toEqual([{ path: [key], code: 'unknown_key' }]);
  });

  it('an update with an id but no expectedVersion is invalid', async () => {
    const result = await saveNotice({ ...draft, id: 'N-mock-1', idempotencyKey: 'ky' } as never, undefined, as('admin'));
    expect(result).toMatchObject({ outcome: 'invalid', fieldErrors: [{ path: ['expectedVersion'], code: 'required' }] });
  });

  it('a retry with the same idempotency key replays the stored answer without a second write; reuse with other input is invalid', async () => {
    const first = await saveNotice({ ...draft, idempotencyKey: 'same' }, undefined, as('admin'));
    const retry = await saveNotice({ ...draft, idempotencyKey: 'same' }, undefined, as('admin'));
    expect(retry).toMatchObject({ outcome: 'ok', replayed: true, data: first.data });
    expect((await listNotices(undefined, as('admin'))).data?.items).toHaveLength(3);
    const reused = await saveNotice({ ...draft, until: '2027-01-01T00:00:00', idempotencyKey: 'same' }, undefined, as('admin'));
    expect(reused.outcome).toBe('invalid');
  });

  it('delete enforces the version and replays safely', async () => {
    expect((await deleteNotice({ id: 'N-mock-1', expectedVersion: 'v0', idempotencyKey: 'd1' }, undefined, as('admin'))).outcome).toBe('conflict');
    const done = await deleteNotice({ id: 'N-mock-1', expectedVersion: 'v1', idempotencyKey: 'd2' }, undefined, as('admin'));
    expect(done).toMatchObject({ outcome: 'ok', data: { id: 'N-mock-1' } });
    expect(await deleteNotice({ id: 'N-mock-1', expectedVersion: 'v1', idempotencyKey: 'd2' }, undefined, as('admin'))).toMatchObject({ outcome: 'ok', replayed: true });
    expect((await deleteNotice({ id: 'N-mock-1', expectedVersion: 'v1', idempotencyKey: 'd3' }, undefined, as('admin'))).outcome).toBe('not_found');
    expect((await deleteNotice({ id: 'N-mock-2', expectedVersion: 'v1', idempotencyKey: 'd4', author: 'x' } as never, undefined, as('admin'))).outcome).toBe('invalid');
  });
});
