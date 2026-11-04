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

const CONTEXT: VocComposeContext = { items: [], href: null, spaceId: null, menuId: 'home', carried: {}, traceId: null, errorMenuId: null };
const { Compose } = vocComposeSlot(() => defaultSystem, useStatus);

const session = testSession(['platform:view']);
const adapter = testAdapter({ session: () => session });

function mount(context: VocComposeContext = CONTEXT) {
  return render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}>
    <Compose context={context} onSubmitted={vi.fn()} onCancel={vi.fn()} onDirtyChange={vi.fn()} />
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

describe('VOC 등록 slot opened from a screen error view (#606)', () => {
  const ERROR_CONTEXT: VocComposeContext = { ...CONTEXT, items: [{ id: 'trace', label: '추적 번호', value: 'client-abc-1' }, { id: 'error-menu', label: '메뉴', value: '생산성' }], traceId: 'client-abc-1', errorMenuId: 'prod' };
  const posted: unknown[] = [];
  const answerCreate = () => {
    const base = vi.mocked(fetch).getMockImplementation()!;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).startsWith('/api/features/vocs') && init?.method === 'POST') {
        posted.push(JSON.parse(String(init.body)));
        return json({ id: 'v1', display_id: 'VOC-1' }, 201);
      }
      return base(input, init);
    }));
  };
  beforeEach(() => { posted.length = 0; answerCreate(); settle('ready', PLATFORM); });
  const submit = async () => {
    await waitFor(() => expect((screen.getByRole('button', { name: 'VOC 제출' }) as HTMLButtonElement).disabled).toBe(false), LAZY_MOUNT_WAIT);
    fireEvent.click(screen.getByRole('button', { name: 'VOC 제출' }));
    await waitFor(() => expect(posted).toHaveLength(1));
    return posted[0] as Record<string, unknown>;
  };

  it('prefills the title with the menu name and the body, shows the hint, and starts the draft clean', async () => {
    const onDirtyChange = vi.fn();
    render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><Compose context={ERROR_CONTEXT} onSubmitted={vi.fn()} onCancel={vi.fn()} onDirtyChange={onDirtyChange} /></PlatformProvider></I18nProvider>);
    const title = await screen.findByRole('textbox', { name: /제목/ }, LAZY_MOUNT_WAIT) as HTMLInputElement;
    expect(title.value).toBe('생산성 오류 신고');
    expect(screen.getByTestId('voc-error-report-hint').textContent).toBe('오류 직전에 한 작업을 덧붙여 주세요. 화면 정보는 위에 첨부되어 있습니다.');
    await waitFor(() => expect((screen.getByRole('button', { name: 'VOC 제출' }) as HTMLButtonElement).disabled).toBe(false));
    expect(onDirtyChange).not.toHaveBeenCalledWith(true);
  });

  it('sends trace_id and the kept chips in the description block', async () => {
    mount(ERROR_CONTEXT);
    const body = await submit();
    expect(body.trace_id).toBe('client-abc-1');
    expect(body.title).toBe('생산성 오류 신고');
    expect(JSON.stringify(body.description_rich_content)).toContain('화면을 사용하는 중 오류가 발생했습니다.');
    expect(JSON.stringify(body.description_rich_content)).toContain('추적 번호: client-abc-1');
  });

  it('drops trace_id when the user removed the trace chip, and keeps the other chip in the block', async () => {
    const { rerender } = mount(ERROR_CONTEXT);
    await screen.findByRole('textbox', { name: /제목/ }, LAZY_MOUNT_WAIT);
    rerender(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}>
      <Compose context={{ ...ERROR_CONTEXT, items: [ERROR_CONTEXT.items[1]!], traceId: null }} onSubmitted={vi.fn()} onCancel={vi.fn()} onDirtyChange={vi.fn()} />
    </PlatformProvider></I18nProvider>);
    const body = await submit();
    expect('trace_id' in body).toBe(false);
    expect(JSON.stringify(body.description_rich_content)).toContain('메뉴: 생산성');
    expect(JSON.stringify(body.description_rich_content)).not.toContain('추적 번호');
  });

  it('sends no trace_id and no prefill for the rail path', async () => {
    mount();
    const title = await screen.findByRole('textbox', { name: /제목/ }, LAZY_MOUNT_WAIT) as HTMLInputElement;
    expect(title.value).toBe('');
    expect(screen.queryByTestId('voc-error-report-hint')).toBeNull();
  });

  it('submits from the rail path without trace_id, prefill or hint', async () => {
    mount();
    const title = await screen.findByRole('textbox', { name: /제목/ }, LAZY_MOUNT_WAIT) as HTMLInputElement;
    expect(screen.queryByTestId('voc-error-report-hint')).toBeNull();
    fireEvent.change(title, { target: { value: '제목' } });
    fireEvent.change(screen.getByRole('textbox', { name: '상세 설명' }), { target: { value: '내용' } });
    const body = await submit();
    expect('trace_id' in body).toBe(false);
    expect(body.title).toBe('제목');
    expect(JSON.stringify(body.description_rich_content)).not.toContain('화면을 사용하는 중 오류가 발생했습니다.');
  });

  it('prefills the title, body and hint in English when the draft opens in English', async () => {
    const storage = memoryStorage();
    storage.setItem('platform:lang', 'en');
    vi.stubGlobal('localStorage', storage);
    mount({ ...ERROR_CONTEXT, items: [{ id: 'trace', label: 'Trace ID', value: 'client-abc-1' }, { id: 'error-menu', label: 'Menu', value: 'Productivity' }] });
    const title = await screen.findByRole('textbox', { name: /제목/ }, LAZY_MOUNT_WAIT) as HTMLInputElement;
    expect(title.value).toBe('Productivity error report');
    expect(screen.getByTestId('voc-error-report-hint').textContent).toBe('Add what you did just before the error. The screen details are attached above.');
    const body = await submit();
    expect(JSON.stringify(body.description_rich_content)).toContain('An error occurred while using this screen.');
  });

  it('gates on the feature API: off without one, available with one', () => {
    expect(vocComposeSlot(() => null).availability?.({ spaceId: null, menuId: null })).toBe('available');
    setFeatureApi(null);
    expect(vocComposeSlot(() => null).availability?.({ spaceId: null, menuId: null })).toBe('off');
  });
});
