// #1159 UX-1 — the reporter replies on their own VOC from the 내 VOC detail (09-permission-access: Add Reporter Reply, every role).
import type { VocDetailEnvelope } from '@ap/feature-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// TipTap does not run in jsdom: a click on the stub types "hello".
vi.mock('@ap/ui', async (importActual) => {
  const actual = await importActual<typeof import('@ap/ui')>();
  return {
    ...actual,
    RichEditor: ({ onChange }: { onChange?: (doc: import('@ap/ui').TipTapDoc) => void }) =>
      React.createElement('div', {
        role: 'textbox',
        onClick: () =>
          onChange?.({
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }],
          }),
      }),
  };
});

import { ReporterVocDetail } from '../ReporterVocDetail';

const VOC_ID = '11111111-1111-4111-8111-111111111111';
const ME = '44444444-4444-4444-8444-444444444444';
const OTHER = '55555555-5555-4555-8555-555555555555';
const MS = '33333333-3333-4333-8333-333333333333';

const doc = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});
const NEW_REPLY = {
  id: 'a2222222-2222-4222-8222-222222222222',
  kind: 'reporter_reply',
  actor_id: ME,
  body_rich_content: doc('방금 보낸 답장'),
  created_at: '2026-07-23T00:00:00.000Z',
  visibility: 'reporter',
  attachments: [],
};
const ENVELOPE = {
  id: VOC_ID,
  display_id: 'VOC-0042',
  title: '로그인이 안 됩니다',
  primary_managed_system_id: MS,
  analytics_area_id: null,
  reporter_id: ME,
  owner_user_id: null,
  owner_team_id: null,
  severity: 'medium',
  reporter_facing_status: 'reviewing',
  triage_state: 'triaged',
  source_context: 'direct_use',
  created_at: '2026-07-20T00:00:00.000Z',
  updated_at: '2026-07-22T00:00:00.000Z',
  similar_count: 0,
  description_rich_content: doc('본문'),
  next_actions: [],
  next_reporter_states: { allowed: [], forbidden: {} },
  linked_execution: { findingRef: null, taskRef: null, trails: [] },
  conversation_timeline: [],
  conversation_page: { has_more: false },
  permission_decisions: {},
  attachments: [],
  attachment_count: 0,
} as unknown as VocDetailEnvelope;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// `second` shapes the second /me call (the full-session read); the first (the ownership guard) always succeeds.
function stubFetch(meId: string, second: 'ok' | 'pending' | 'error' = 'ok') {
  let meCalls = 0;
  const calls: { method: string; path: string }[] = [];
  let posted = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      const method = init?.method ?? 'GET';
      calls.push({ method, path });
      if (path === '/me' && ++meCalls === 2 && second === 'pending') return new Promise<Response>(() => {});
      if (path === '/me' && meCalls === 2 && second === 'error')
        return json({ code: 'internal.unexpected', message: 'boom' }, 500);
      if (path === '/me')
        return json({
          actor: {
            id: meId,
            external_id: 'x',
            email: 'me@x.test',
            display_name: '김제출',
            role_level: 'user',
          },
          workspace_id: MS,
        });
      if (path === `/vocs/${VOC_ID}`)
        return json({ ...ENVELOPE, conversation_timeline: posted ? [NEW_REPLY] : [] });
      if (path === `/vocs/${VOC_ID}/reporter-replies` && method === 'POST') {
        posted = true;
        return json({ reporter_reply: NEW_REPLY, voc: ENVELOPE }, 201);
      }
      if (path === '/actors?workspace=current') return json({ actors: [] });
      return json({ code: 'internal.unexpected', message: 'not mocked' }, 500);
    }),
  );
  return calls;
}

function mount() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ReporterVocDetail vocId={VOC_ID} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('<ReporterVocDetail> reporter reply', () => {
  it('lets the reporter post a reply to /vocs/:id/reporter-replies and then shows it in the timeline', async () => {
    const calls = stubFetch(ME);
    mount();
    fireEvent.click(await screen.findByRole('textbox'));
    fireEvent.click(await screen.findByRole('button', { name: '답변 보내기' }));

    await waitFor(() =>
      expect(calls).toContainEqual({ method: 'POST', path: `/vocs/${VOC_ID}/reporter-replies` }),
    );
    expect(await screen.findByText('방금 보낸 답장')).toBeTruthy();
    expect(screen.queryByTestId('public-update-composer')).toBeNull();
    expect(screen.queryByTestId('internal-comment-composer')).toBeNull();
  });

  it('draws no reply composer for an actor who is not the reporter', async () => {
    stubFetch(OTHER);
    mount();
    expect(await screen.findByText('VOC를 찾을 수 없습니다')).toBeTruthy();
    expect(screen.queryByTestId('reporter-reply-composer')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('mounts no reply composer while the full session read is pending', async () => {
    stubFetch(ME, 'pending');
    mount();
    expect(await screen.findByText('로그인이 안 됩니다')).toBeTruthy();
    expect(screen.queryByTestId('reporter-voc-reply')).toBeNull();
    expect(screen.queryByTestId('reporter-reply-composer')).toBeNull();
  });

  it('mounts no reply composer when the full session read fails, and still shows the VOC', async () => {
    stubFetch(ME, 'error');
    mount();
    expect(await screen.findByText('로그인이 안 됩니다')).toBeTruthy();
    await waitFor(() => expect(screen.queryByTestId('reporter-voc-reply')).toBeNull());
    expect(screen.queryByTestId('reporter-reply-composer')).toBeNull();
  });

  it('mounts the reply composer once the session read resolves to the reporter', async () => {
    stubFetch(ME);
    mount();
    expect(await screen.findByTestId('reporter-voc-reply')).toBeTruthy();
  });
});
