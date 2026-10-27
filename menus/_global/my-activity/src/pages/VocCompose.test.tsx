import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, type VocComposeContext } from '@ap/kernel';
import { memoryStorage, ToastProbe } from '@ap/kernel/testing';
import { setFoApi } from '@ap/fo-bridge/fo-api';
import { foQueryClient } from '@ap/fo-bridge';
import { json, registry, stubFetch, switchableAdapter, type Call } from '../fo/test-support';
import VocCompose from '@ap/fo-bridge/voc-compose-page';

// ProseMirror refuses text in jsdom, so the editor is a textarea (FeedbackOps' own compose tests do the same). FeedbackOps' compose screen takes `RichEditor` from `@ap/ui`.
vi.mock('@ap/ui', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  RichEditor: ({ onChange }: { onChange: (doc: unknown) => void }) => (
    <textarea aria-label="상세 설명" onChange={e => onChange({ type: 'doc', content: e.target.value ? [{ type: 'paragraph', content: [{ type: 'text', text: e.target.value }] }] : [] })} />
  ),
}));

const MS = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const VOC = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const MS_ROW = { id: MS, workspace_id: 'w', slug: 'analytics', name: 'Analytics MS', external_key: null, default_owner_actor_id: null, default_owner_team_id: null, default_reviewer_actor_id: null, default_reviewer_team_id: null, archived_at: null, archived_by_actor_id: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' };

const CONTEXT: VocComposeContext = {
  items: [{ id: 'menu', label: '메뉴', value: '생산성 분석' }, { id: 'period', label: '기간', value: '2026-10-01 ~ 2026-10-07' }],
  href: 'https://platform.example/analytics/productivity?period=7d', spaceId: 'mars' as VocComposeContext['spaceId'], menuId: 'productivity', carried: {},
};
const managedSystemFor = (spaceId: string | null) => (spaceId === 'mars' ? MS : null);

function handle(over: { managedSystems?: () => Response; post?: () => Response } = {}) {
  return (path: string, method: string) => {
    if (path.startsWith('/api/fo/managed-systems')) return over.managedSystems?.() ?? json({ items: [MS_ROW], total: 1 });
    if (path.startsWith('/api/fo/analytics-areas')) return json({ items: [], total: 0 });
    if (path === '/api/fo/vocs' && method === 'POST') return over.post?.() ?? json({ id: VOC, display_id: 'VOC-7' }, 201);
    return json({ code: 'internal.unexpected', message: 'not mocked' }, 500);
  };
}

const onSubmitted = vi.fn();
const onCancel = vi.fn();
const onDirtyChange = vi.fn();
function tree(context: VocComposeContext, adapter = switchableAdapter().adapter) {
  return <I18nProvider><PlatformProvider adapter={adapter} registry={registry}><ToastProbe />
    <VocCompose context={context} onSubmitted={onSubmitted} onCancel={onCancel} onDirtyChange={onDirtyChange} managedSystemFor={managedSystemFor} /></PlatformProvider></I18nProvider>;
}
const posted = (calls: Call[]) => calls.find(call => call.method === 'POST');
const postedBody = (calls: Call[]) => JSON.parse(String((fetch as unknown as { mock: { calls: [unknown, RequestInit][] } }).mock.calls.find(([, init]) => init?.method === 'POST')?.[1].body)) as { title: string; description_rich_content: { content: { type: string; content?: { content?: { text: string }[] }[] }[] } };
const toasts = () => [...screen.getByLabelText('toasts').querySelectorAll('li')].map(li => [li.getAttribute('data-tone'), li.textContent]);

async function fill(title = '차트가 비어 있습니다') {
  fireEvent.change(await screen.findByRole('textbox', { name: /제목/ }), { target: { value: title } });
  fireEvent.blur(screen.getByRole('textbox', { name: /제목/ }));
  fireEvent.change(screen.getByRole('textbox', { name: '상세 설명' }), { target: { value: '재현 절차' } });
}
const submit = async () => {
  await waitFor(() => expect((screen.getByRole('button', { name: 'VOC 제출' }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: 'VOC 제출' }));
};

const onSessionLost = vi.fn();
beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  // The pickers measure themselves; jsdom has no ResizeObserver.
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  for (const fn of [onSubmitted, onCancel, onDirtyChange, onSessionLost]) fn.mockReset();
});
afterEach(() => { cleanup(); foQueryClient.clear(); setFoApi(null); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('VOC 등록 drawer content', () => {
  it('V1: without a FeedbackOps API shows 실서버 필요 and requests nothing', () => {
    setFoApi(null);
    const calls = stubFetch(handle());
    render(tree(CONTEXT));
    expect(screen.getByRole('status').textContent).toContain('실서버 필요');
    expect(calls).toEqual([]);
  });

  describe('with a FeedbackOps API', () => {
    beforeEach(() => { setFoApi({ basePath: '/api/fo', onSessionLost }); });

    it('V2: preselects the Managed System the factory maps, then a submit toasts 접수 완료 (default tone), refreshes 내 VOC and calls onSubmitted', async () => {
      const calls = stubFetch(handle());
      const invalidate = vi.spyOn(foQueryClient, 'invalidateQueries');
      render(tree(CONTEXT));
      const radio = await screen.findByRole('radio', { name: 'Analytics MS' });
      await waitFor(() => expect(radio.getAttribute('aria-checked')).toBe('true'));
      await fill();
      await submit();

      await waitFor(() => expect(onSubmitted).toHaveBeenCalledTimes(1));
      expect(onSubmitted).toHaveBeenCalledWith({ vocId: VOC, displayId: 'VOC-7' });
      expect(toasts()).toEqual([['info', '접수 완료: VOC-7']]);
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['vocs', 'my'] });
      expect(posted(calls)).toMatchObject({ path: '/api/fo/vocs', credentials: 'include' });
    });

    it('V2: a FeedbackOps 401 asks the host to sign in again and shows no toast', async () => {
      stubFetch(handle({ managedSystems: () => json({ code: 'auth.unauthenticated', message: 'x' }, 401) }));
      render(tree(CONTEXT));
      await waitFor(() => expect(onSessionLost).toHaveBeenCalledTimes(1));
      expect(toasts()).toEqual([]);
      expect(onSubmitted).not.toHaveBeenCalled();
    });

    it('V2: a 401 on the submit follows the same session-lost path: once, the expiry state, no toast and no onSubmitted', async () => {
      stubFetch(handle({ post: () => json({ code: 'auth.unauthenticated', message: 'x' }, 401) }));
      render(tree(CONTEXT));
      await screen.findByRole('radio', { name: 'Analytics MS' });
      await fill();
      await submit();

      await waitFor(() => expect(onSessionLost).toHaveBeenCalledTimes(1));
      expect(await screen.findByText('세션이 만료되었습니다')).toBeTruthy();
      expect(toasts()).toEqual([]);
      expect(onSubmitted).not.toHaveBeenCalled();
    });

    it('V3: removing an item after typing keeps the typed title and leaves the item out of the submitted body', async () => {
      const calls = stubFetch(handle());
      const adapter = switchableAdapter().adapter;
      const view = render(tree(CONTEXT, adapter));
      await fill('입력 중인 제목');
      view.rerender(tree({ ...CONTEXT, items: CONTEXT.items.filter(item => item.id !== 'period'), href: 'https://platform.example/analytics/productivity' }, adapter));
      expect((screen.getByRole('textbox', { name: /제목/ }) as HTMLInputElement).value).toBe('입력 중인 제목');
      await screen.findByRole('radio', { name: 'Analytics MS' });
      await submit();

      await waitFor(() => expect(posted(calls)).toBeDefined());
      const body = postedBody(calls);
      const text = JSON.stringify(body.description_rich_content);
      expect(body.title).toBe('입력 중인 제목');
      expect(text).toContain('메뉴: 생산성 분석');
      expect(text).not.toContain('기간');
      expect(text).toContain('https://platform.example/analytics/productivity"');
      expect(text).not.toContain('period=7d');
    });
  });
});
