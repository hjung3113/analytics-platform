import type { JsonValue, PreferencesSnapshot } from '@ap/contracts';
import { webcrypto } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { createPreferenceController, webCryptoSha256 } from '../preferenceController';
import { memoryStorage, testAdapter } from '../../testing';

afterEach(() => vi.unstubAllGlobals());
it.each(['', 'abc', 'platform:table:열 😀', 'x'.repeat(130), '\ud800'])('KER-14 fallback matches WebCrypto UTF-8 for %j', async text => {
  const digest = await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  const expected = Buffer.from(digest).toString('hex');
  vi.stubGlobal('crypto', {});
  expect(await webCryptoSha256(text)).toBe(expected);
  const c = createPreferenceController({ adapter: testAdapter(), userId: 'u1', storage: () => memoryStorage() });
  expect(await c.tableKey(text)).toBe(`columns:h1_${expected}`);
});
it('KER-14 imports an old table and saves later settings without WebCrypto', async () => {
  vi.stubGlobal('crypto', {});
  const storage = memoryStorage();
  storage.setItem('platform:table:old', JSON.stringify({ sizing: {}, visibility: {}, pinning: { left: [], right: [] } }));
  const read = { values: {}, importedAt: null };
  const ok = (data: PreferencesSnapshot) => ({ outcome: 'ok' as const, data, assessments: [], trust: null, correlationId: 'c' });
  const imported = vi.fn(async ({ values }: { values: Record<string, JsonValue> }) => ok({ values, importedAt: '2026-11-01T00:00:00Z' }));
  const patched = vi.fn(async ({ set }: { set?: Readonly<Record<string, JsonValue>> }) => ok({ values: { ...set }, importedAt: '2026-11-01T00:00:00Z' }));
  const adapter = testAdapter({ readPreferences: async () => ok(read), importPreferences: imported, patchPreferences: patched });
  const c = createPreferenceController({ adapter, userId: 'u1', storage: () => storage });
  c.start();
  await new Promise(r => setTimeout(r, 0));
  expect(c.state().status).toBe('ready');
  expect(Object.keys(imported.mock.calls[0]![0].values)[0]).toMatch(/^columns:h1_[0-9a-f]{64}$/);
  c.set('lang', 'en');
  await new Promise(r => setTimeout(r, 0));
  expect(patched).toHaveBeenCalledWith({ set: { lang: 'en' } });
  c.stop();
});
