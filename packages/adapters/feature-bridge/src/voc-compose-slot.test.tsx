import { useSyncExternalStore } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry, type VocComposeContext } from '@ap/kernel';
import { memoryStorage, testAdapter, testSession } from '@ap/kernel/testing';
import { groupId, spaceId } from '@ap/contracts';
import { UserRound } from 'lucide-react';
import { setFeatureApi } from './feature-api';
import { featureQueryClient } from './feature/session';
import { LAZY_MOUNT_WAIT } from './testing';
import type { DefaultStatus } from './default-status';
import { vocComposeSlot } from './voc-compose-slot';

// ProseMirror refuses text in jsdom, so the editor is a textarea (the feature screens' own compose tests do the same).
vi.mock('@ap/ui', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  RichEditor: ({ onChange }: { onChange: (doc: unknown) => void }) => (
    <textarea aria-label="상세 설명" onChange={e => onChange({ type: 'doc', content: e.target.value ? [{ type: 'paragraph', content: [{ type: 'text', text: e.target.value }] }] : [] })} />
  ),
}));

const PLATFORM = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab';
const row = (id: string, slug: string, name: string) => ({ id, workspace_id: 'w', slug, name, external_key: null, default_owner_actor_id: null, default_owner_team_id: null, default_reviewer_actor_id: null, default_reviewer_team_id: null, archived_at: null, archived_by_actor_id: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const registry = createRegistry({
  spaces: [{ id: spaceId('mars'), label: { ko: '분석', en: 'Analytics' }, description: { ko: '목적', en: 'Purpose' }, homeMenuId: 'filler' }],
  groups: [{ id: groupId('filler'), label: { ko: '채움', en: 'Filler' }, icon: UserRound, space: spaceId('mars') }],
  menus: [{ id: 'filler', primary: true, group: groupId('filler'), label: { ko: '채움', en: 'Filler' }, description: { ko: '채움', en: 'Filler' }, path: '/mars/filler', icon: UserRound, permission: 'platform:view', requiresScope: false, pageType: 'management', context: { global: [], page: [] } as never, features: {} as never, pageKeys: [] }],
});

/** The app's lookup, as a tiny observable store the test settles by hand. */
let status: DefaultStatus = 'pending';
let defaultSystem: string | null = null;
const listeners = new Set<() => void>();
const settle = (next: DefaultStatus, system: string | null) => { status = next; defaultSystem = system; for (const listener of [...listeners]) listener(); };
const useStatus = (): DefaultStatus => useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => status);

const CONTEXT: VocComposeContext = { items: [], href: null, spaceId: null, menuId: 'home', carried: {} };
const { Compose } = vocComposeSlot(() => defaultSystem, useStatus);

const session = testSession(['platform:view']);
const adapter = testAdapter({ session: () => session });

function mount() {
  return render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}>
    <Compose context={CONTEXT} onSubmitted={vi.fn()} onCancel={vi.fn()} onDirtyChange={vi.fn()} />
  </PlatformProvider></I18nProvider>);
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input);
    if (path.startsWith('/api/features/managed-systems')) return json({ items: [row(PLATFORM, 'platform', '플랫폼'), row(OTHER, 'other', 'Other MS')], total: 2 });
    if (path.startsWith('/api/features/analytics-areas')) return json({ items: [], total: 0 });
    return json({ code: 'internal.unexpected', message: 'not mocked' }, 500);
  }));
  setFeatureApi({ basePath: '/api/features', onSessionLost: vi.fn() });
  settle('pending', null);
});
afterEach(() => { cleanup(); featureQueryClient.clear(); setFeatureApi(null); vi.unstubAllGlobals(); });

const checked = (name: string) => screen.getByRole('radio', { name }).getAttribute('aria-checked');

describe('VOC 등록 slot with an app lookup that answers late (#1289 node j)', () => {
  it('opens while the lookup is pending: the form is usable, the submit is blocked with a short message, and the default appears once the lookup is ready', async () => {
    mount();
    await screen.findByRole('radio', { name: '플랫폼' }, LAZY_MOUNT_WAIT);
    expect(checked('플랫폼')).toBe('false');
    fireEvent.change(screen.getByRole('textbox', { name: /제목/ }), { target: { value: '제목' } });
    fireEvent.change(screen.getByRole('textbox', { name: '상세 설명' }), { target: { value: '내용' } });
    expect(screen.getByTestId('voc-default-blocked').textContent).toMatch(/확인하는 중/);
    expect((screen.getByRole('button', { name: 'VOC 제출' }) as HTMLButtonElement).disabled).toBe(true);
    settle('ready', PLATFORM);
    await waitFor(() => expect(checked('플랫폼')).toBe('true'));
    expect(screen.queryByTestId('voc-default-blocked')).toBeNull();
    await waitFor(() => expect((screen.getByRole('button', { name: 'VOC 제출' }) as HTMLButtonElement).disabled).toBe(false));
    expect((screen.getByRole('textbox', { name: /제목/ }) as HTMLInputElement).value).toBe('제목');
  });

  it('keeps a system the user chose while the lookup was pending', async () => {
    mount();
    fireEvent.click(await screen.findByRole('radio', { name: 'Other MS' }, LAZY_MOUNT_WAIT));
    settle('ready', PLATFORM);
    await waitFor(() => expect(screen.queryByTestId('voc-default-blocked')).toBeNull());
    expect(checked('Other MS')).toBe('true');
    expect(checked('플랫폼')).toBe('false');
  });

  it('a failed lookup blocks the submit with a retry-on-reopen message', async () => {
    mount();
    await screen.findByRole('radio', { name: '플랫폼' }, LAZY_MOUNT_WAIT);
    settle('failed', null);
    await waitFor(() => expect(screen.getByTestId('voc-default-blocked').textContent).toMatch(/다시 열면/));
    expect((screen.getByRole('button', { name: 'VOC 제출' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
