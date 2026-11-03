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
