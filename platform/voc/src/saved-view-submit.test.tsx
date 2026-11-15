import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { memoryStorage } from '@ap/kernel/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, mountAuthedVocs, savedView } from './retained-voc/test-support';

afterEach(() => { vi.unstubAllGlobals(); });

describe('saved view submission (FEA-10)', () => {
  it.each(['ko', 'en'])('blocks repeated submission, keeps failed input and permits retry (%s)', async lang => {
    const storage = memoryStorage();
    storage.setItem('platform:lang', lang);
    vi.stubGlobal('localStorage', storage);
    vi.stubGlobal('sessionStorage', memoryStorage());
    let finish!: (response: Response) => void;
    const mounted = mountAuthedVocs({ initialPath: '/vocs?view=inbox', handle: request => {
      if (request.method === 'GET' && request.url.startsWith('/saved-views')) return jsonResponse(200, { items: [] });
      if (request.method === 'POST' && request.url === '/saved-views') return new Promise<Response>(resolve => { finish = resolve; });
      return undefined;
    } });
    const label = lang === 'ko' ? '저장된 보기 이름' : 'Saved view name';
    const input = await screen.findByRole('textbox', { name: label }, { timeout: 30_000 });
    fireEvent.change(input, { target: { value: 'Synthetic view' } });
    const form = input.closest('form')!;
    act(() => { fireEvent.submit(form); fireEvent.submit(form); });
    await waitFor(() => expect(mounted.requests.filter(r => r.method === 'POST')).toHaveLength(1));
    expect((form.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { finish(jsonResponse(500, { detail: { code: 'test.failure' } })); });
    await waitFor(() => expect((form.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(false));
    expect((input as HTMLInputElement).value).toBe('Synthetic view');
    fireEvent.submit(form);
    await waitFor(() => expect(mounted.requests.filter(r => r.method === 'POST')).toHaveLength(2));
    await act(async () => { finish(jsonResponse(200, savedView('20140000-0000-4000-8000-000000000001', 'Synthetic view', { view: 'inbox' }))); });
    await waitFor(() => expect((input as HTMLInputElement).value).toBe(''));
    expect(mounted.unhandled).toEqual([]);
  });
  it.each(['ko', 'en'])('localizes deletion and restores focus to the name input (%s)', async lang => {
    const storage = memoryStorage();
    storage.setItem('platform:lang', lang);
    vi.stubGlobal('localStorage', storage);
    vi.stubGlobal('sessionStorage', memoryStorage());
    const view = savedView('20140000-0000-4000-8000-000000000001', 'Synthetic view', { view: 'inbox' });
    let items = [view];
    mountAuthedVocs({ initialPath: '/vocs?view=inbox', handle: request => {
      if (request.method === 'GET' && request.url.startsWith('/saved-views')) return jsonResponse(200, { items });
      if (request.method === 'DELETE' && request.url === '/saved-views/20140000-0000-4000-8000-000000000001') { items = []; return new Response(null, { status: 204 }); }
      return undefined;
    } });
    const remove = await screen.findByRole('button', { name: lang === 'ko' ? '저장된 보기 Synthetic view 삭제' : 'Delete saved view Synthetic view' }, { timeout: 30_000 });
    remove.focus();
    fireEvent.click(remove);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('textbox', { name: lang === 'ko' ? '저장된 보기 이름' : 'Saved view name' })));
  });
});
