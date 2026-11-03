import type { PublicVocView } from '@ap/feature-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PublicVocDetail } from '../PublicVocDetail';
import { PublicVocListScreen } from '../PublicVocListScreen';

const ID_1 = '11111111-1111-4111-8111-111111111111';
const ID_2 = '22222222-2222-4222-8222-222222222222';
const MS = '33333333-3333-4333-8333-333333333333';
const doc = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });

const item = (id: string, title: string, mine = false) => ({
  id, display_id: `VOC-${id.slice(0, 2)}`, title, reporter_facing_status: 'progress', managed_system: { id: MS, name: '플랫폼' },
  created_at: '2026-07-20T00:00:00.000Z', updated_at: '2026-07-21T00:00:00.000Z', mine,
});

function stubFetch(items: unknown[]) {
  const paths: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input);
    paths.push(path);
    const body = path.startsWith('/managed-systems') ? { items: [], total: 0 } : { items, page: { has_more: false } };
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  }));
  return paths;
}

afterEach(() => vi.unstubAllGlobals());

describe('PublicVocListScreen', () => {
  it('draws each public row with its system chip and marks only the own VOC; selecting reports the id', async () => {
    stubFetch([item(ID_1, '로그인이 안 됩니다', true), item(ID_2, '차트가 안 열립니다')]);
    const onSelect = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <PublicVocListScreen query={{ q: '', mine: false, systemId: null }} onQueryChange={vi.fn()} selectedId={ID_2} onSelect={onSelect} />
      </QueryClientProvider>,
    );
    const [own, other, ...rest] = await screen.findAllByRole('listitem');
    if (own === undefined || other === undefined) throw new Error('two rows expected');
    expect(rest).toHaveLength(0);
    expect(within(own).getByText('내가 등록')).toBeTruthy();
    expect(within(other).queryByText('내가 등록')).toBeNull();
    expect(within(other).getByRole('button').getAttribute('aria-current')).toBe('true');
    await userEvent.setup().click(within(own).getByRole('button'));
    expect(onSelect).toHaveBeenCalledWith(ID_1);
  });

  it('sends only the filters the query holds', async () => {
    const paths = stubFetch([]);
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <PublicVocListScreen query={{ q: '툴팁', mine: true, systemId: MS }} onQueryChange={vi.fn()} selectedId={null} onSelect={vi.fn()} />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(paths.some((path) => path.startsWith('/vocs/public?'))).toBe(true));
    const request = paths.find((path) => path.startsWith('/vocs/public?')) ?? '';
    expect(Object.fromEntries(new URL(request, 'http://x').searchParams)).toEqual({ mine: 'true', managed_system_id: MS, q: '툴팁', limit: '50' });
  });
});

describe('PublicVocListScreen — failures', () => {
  const wrap = (query = { q: '', mine: false, systemId: null as string | null }) => (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <PublicVocListScreen query={query} onQueryChange={vi.fn()} selectedId={null} onSelect={vi.fn()} />
    </QueryClientProvider>
  );

  it('F2: a failed system list says so, retry reloads it, and the selected system stays selected', async () => {
    let systemCalls = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
      if (path.startsWith('/managed-systems')) {
        systemCalls += 1;
        if (systemCalls === 1) return new Response(JSON.stringify({ code: 'internal.unexpected', message: 'boom' }), { status: 500, headers: { 'content-type': 'application/json' } });
        return ok({ items: [{ id: MS, workspace_id: MS, slug: 'p', name: '플랫폼', external_key: null, default_owner_actor_id: null, default_owner_team_id: null, default_reviewer_actor_id: null, default_reviewer_team_id: null, archived_at: null, archived_by_actor_id: null, created_at: '2026-07-01T00:00:00.000Z', updated_at: '2026-07-01T00:00:00.000Z' }], total: 1 });
      }
      return ok({ items: [item(ID_1, '로그인이 안 됩니다')], page: { has_more: false } });
    }));
    render(wrap({ q: '', mine: false, systemId: MS }));
    expect(await screen.findByText('시스템 목록을 불러오지 못했습니다')).toBeTruthy();
    expect(screen.getByRole('combobox', { name: '시스템' }).textContent).toContain('선택한 시스템');
    await userEvent.setup().click(screen.getByRole('button', { name: '다시 시도' }));
    await waitFor(() => expect(screen.queryByText('시스템 목록을 불러오지 못했습니다')).toBeNull());
    await waitFor(() => expect(screen.getByRole('combobox', { name: '시스템' }).textContent).toContain('플랫폼'));
  });

  it('U3: a search that cannot complete is an error state, not 「검색 결과가 없습니다」', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).startsWith('/managed-systems')) return new Response(JSON.stringify({ items: [], total: 0 }), { status: 200, headers: { 'content-type': 'application/json' } });
      return new Response(JSON.stringify({ code: 'internal.unexpected', message: 'boom' }), { status: 500, headers: { 'content-type': 'application/json' } });
    }));
    render(wrap({ q: '툴팁', mine: false, systemId: null }));
    expect(await screen.findByText('불러오기 실패', {}, { timeout: 4000 })).toBeTruthy();
    expect(screen.queryByText('검색 결과가 없습니다.')).toBeNull();
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeTruthy();
  });
});

describe('PublicVocDetail', () => {
  const view: PublicVocView = {
    ...item(ID_2, '차트가 안 열립니다'), description_rich_content: doc('공개 본문'),
    entries: [{ id: 'b1111111-1111-4111-8111-111111111111', kind: 'public_update', body_rich_content: doc('확인했습니다'), created_at: '2026-07-22T00:00:00.000Z', attachments: [] }],
    attachments: [],
  } as PublicVocView;

  it('shows the status stage line, the description and the public updates, and no reply input', () => {
    render(<PublicVocDetail voc={view} />);
    expect(screen.getByRole('heading', { name: '차트가 안 열립니다' })).toBeTruthy();
    expect(screen.getByRole('listitem', { current: 'step' }).textContent).toBe('처리 중');
    expect(screen.getByText('공개 본문')).toBeTruthy();
    expect(screen.getByText('확인했습니다')).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('puts a reopened VOC on the reviewing stage and says so when there is no reply yet', () => {
    render(<PublicVocDetail voc={{ ...view, reporter_facing_status: 'reopened', entries: [] }} />);
    expect(screen.getByRole('listitem', { current: 'step' }).textContent).toBe('검토 중');
    expect(screen.getByText('아직 답변이 없습니다.')).toBeTruthy();
  });
});
