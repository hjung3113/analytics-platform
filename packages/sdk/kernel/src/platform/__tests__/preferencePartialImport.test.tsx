import { act, cleanup, render, waitFor } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, expect, it, vi } from 'vitest';
import { groupId, spaceId, type JsonValue } from '@ap/contracts';
import { I18nProvider, PlatformProvider, createRegistry } from '../../index';
import { useToastList } from '../../host';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '../../testing';
import { usePreferenceController } from '../preferenceContext';

const registry = createRegistry({ spaces: [testSpace()], groups: [{ id: groupId('g'), label: { ko: '그룹', en: 'Group' }, icon: House, space: spaceId('mars') }], menus: [{ id: 'home', primary: true, group: groupId('g'), path: '/', label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'overview', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [] }] });
let messages: string[];
let preferences: ReturnType<typeof usePreferenceController>;
function Probe() { messages = useToastList().map(t => t.text); preferences = usePreferenceController(); return null; }
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('KER-15 notifies once after reduced acknowledgement and still saves edits', async () => {
  const store = memoryStorage(); vi.stubGlobal('localStorage', store);
  store.setItem('platform:favorites:u1', JSON.stringify(['old']));
  store.setItem('platform:lastScope:u1', JSON.stringify('old-scope'));
  let values: Record<string, JsonValue> = Object.fromEntries(Array.from({ length: 199 }, (_, i) => [`columns:${i}`, 1]));
  let importedAt: string | null = null;
  const ok = () => ({ outcome: 'ok' as const, data: { values, importedAt }, assessments: [], trust: null, correlationId: 'c' });
  const session = testSession(['platform:view']);
  const patch = vi.fn(async ({ set }: { set?: Readonly<Record<string, JsonValue>> }) => { values = { ...values, ...set }; return ok(); });
  const adapter = testAdapter({ session: () => session, readPreferences: async () => ok(), importPreferences: async () => { importedAt = '2026-11-01T00:00:00Z'; return ok(); }, patchPreferences: patch });
  render(<I18nProvider><PlatformProvider registry={registry} adapter={adapter} serverPreferences><Probe /></PlatformProvider></I18nProvider>);
  await waitFor(() => expect(messages).toEqual(['일부 설정은 옮기지 못했습니다. 원본은 이 브라우저에 남아 있습니다.']));
  act(() => preferences!.set('lang', 'en'));
  await waitFor(() => expect(patch).toHaveBeenCalled());
  expect(messages).toHaveLength(1);
  expect(store.getItem('platform:favorites:u1')).toBe(JSON.stringify(['old']));
});
