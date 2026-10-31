import type { ConversationEntry, VocDetailEnvelope } from '@ap/feature-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReporterVocDetail } from '../ReporterVocDetail';

const VOC_ID = '11111111-1111-4111-8111-111111111111';
const ME = '44444444-4444-4444-8444-444444444444';
const OPERATOR = '55555555-5555-4555-8555-555555555555';
const OWNER = '99999999-9999-4999-8999-999999999999';
const MS = '33333333-3333-4333-8333-333333333333';

const doc = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});
const entry = (
  id: string,
  kind: ConversationEntry['kind'],
  actor: string,
  text: string,
): ConversationEntry => ({
  id,
  kind,
  actor_id: actor,
  body_rich_content: doc(text),
  created_at: '2026-07-22T00:00:00.000Z',
  visibility:
    kind === 'internal_comment' ? 'internal' : kind === 'reporter_reply' ? 'reporter' : 'public',
  attachments: [],
});

const PUBLIC = entry(
  'a1111111-1111-4111-8111-111111111111',
  'public_update',
  OPERATOR,
  '재현했습니다. 곧 고치겠습니다.',
);
const REPLY = entry(
  'a2222222-2222-4222-8222-222222222222',
  'reporter_reply',
  ME,
  '확인 감사합니다.',
);
const INTERNAL = entry(
  'a3333333-3333-4333-8333-333333333333',
  'internal_comment',
  OPERATOR,
  '내부 메모: 담당 팀 책임 문제',
);

// What the backend sends a reporter who also holds an operator capability.
const OPERATOR_ENVELOPE = {
  id: VOC_ID,
  display_id: 'VOC-0042',
  title: '로그인이 안 됩니다',
  primary_managed_system_id: MS,
  analytics_area_id: '66666666-6666-4666-8666-666666666666',
  reporter_id: ME,
  owner_user_id: OWNER,
  owner_team_id: null,
  severity: 'critical',
  reporter_facing_status: 'reviewing',
  triage_state: 'triaged',
  source_context: 'direct_use',
  created_at: '2026-07-20T00:00:00.000Z',
  updated_at: '2026-07-22T00:00:00.000Z',
  similar_count: 2,
  similar: {
    items: [
      {
        id: '77777777-7777-4777-8777-777777777777',
        display_id: 'VOC-0007',
        title: '비슷한 다른 VOC',
        reporter_facing_status: 'received',
        severity: 'high',
      },
    ],
  },
  follow_up: { decision: null, can_record: true, can_withdraw: false },
  description_rich_content: doc('아침마다 로그인이 실패합니다.'),
  next_actions: [{ kind: 'request_finding', label: 'Finding 요청' }],
  next_reporter_states: { allowed: ['closed'], forbidden: {} },
  linked_execution: { findingRef: null, taskRef: null },
  conversation_timeline: [PUBLIC, REPLY, INTERNAL],
  conversation_page: { has_more: true },
  permission_decisions: {},
  attachments: [
    {
      id: 'bbbb2222-0000-4000-8000-000000000001',
      name: 'log.txt',
      size_bytes: 512,
      mime_type: 'text/plain',
      uploaded_by_actor_id: ME,
      created_at: '2026-07-20T00:00:00.000Z',
      linked_at: '2026-07-20T00:00:00.000Z',
    },
  ],
  attachment_count: 1,
} as unknown as VocDetailEnvelope;

const FORBIDDEN = [
  /Critical|critical|심각/,
  /Triage|triage/,
  /박운영/,
  /비슷한 다른 VOC/,
  /같은 Managed System/,
  /내부 메모/,
  /Finding 요청/,
  /후속 조치/,
  /Analytics Area/,
];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function stubFetch(detail: () => Response, meId = ME) {
  const paths: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      paths.push(path);
      if (path === '/me')
        return json({
          actor: {
            id: meId,
            external_id: 'x',
            email: 'me@x.test',
            display_name: '김제출',
            role_level: 'admin',
          },
          workspace_id: MS,
        });
      if (path === `/vocs/${VOC_ID}`) return detail();
      if (path.startsWith(`/vocs/${VOC_ID}/conversation`))
        return json({ items: [PUBLIC, REPLY, INTERNAL], has_more: false });
      if (path === '/actors?workspace=current') {
        return json({
          actors: [
            {
              id: ME,
              display_name: '김제출',
              email: 'me@x.test',
              role_level: 'admin',
              actor_type: 'user',
            },
            {
              id: OPERATOR,
              display_name: '이운영',
              email: 'op@x.test',
              role_level: 'developer',
              actor_type: 'user',
            },
            {
              id: OWNER,
              display_name: '박운영',
              email: 'ow@x.test',
              role_level: 'developer',
              actor_type: 'user',
            },
          ],
        });
      }
      return json({ code: 'internal.unexpected', message: 'not mocked' }, 500);
    }),
  );
  return paths;
}

function mount(variant?: 'page' | 'embedded') {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ReporterVocDetail vocId={VOC_ID} {...(variant ? { variant } : {})} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('<ReporterVocDetail> fed an operator envelope', () => {
  it('draws only the reporter allowlist, no operator field and no control but timeline paging', async () => {
    const paths = stubFetch(() => json(OPERATOR_ENVELOPE));
    mount();

    expect(await screen.findByRole('heading', { name: '로그인이 안 됩니다' })).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(1);
    expect(screen.getByText('VOC-0042')).toBeTruthy();
    expect(screen.getByText('검토 중')).toBeTruthy();
    expect(screen.getByText('아침마다 로그인이 실패합니다.')).toBeTruthy();
    expect(screen.getByRole('link', { name: /log\.txt/ })).toBeTruthy();
    // The public update and the reporter's own reply stay; names come from the actors list.
    expect(await screen.findByText('재현했습니다. 곧 고치겠습니다.')).toBeTruthy();
    expect(screen.getByText('확인 감사합니다.')).toBeTruthy();
    expect(screen.getByText('이운영')).toBeTruthy();

    const text = document.body.textContent ?? '';
    for (const pattern of FORBIDDEN) expect(text).not.toMatch(pattern);
    expect(screen.queryByRole('tab', { name: '내부' })).toBeNull();
    // The only writes are timeline paging and the reporter's own reply (ReporterVocDetail.reply.test.tsx):
    // no public update or internal composer, triage or Finding control.
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(
      expect.arrayContaining(['이전 항목 더보기', '답변 보내기']),
    );
    expect(screen.queryByTestId('reporter-reply-composer')).not.toBeNull();
    expect(screen.queryByTestId('public-update-composer')).toBeNull();
    expect(screen.queryByTestId('internal-comment-composer')).toBeNull();
    expect(screen.queryByRole('button', { name: /상태 변경|트리아지|Finding/ })).toBeNull();

    await waitFor(() => expect(paths).toContain('/actors?workspace=current'));
    for (const path of paths)
      expect(path).toMatch(
        new RegExp(`^(/vocs/${VOC_ID}(/conversation.*)?|/actors\\?workspace=current|/me)$`),
      );
  });

  it('keeps a link in the description, opening in a new tab, while a public update with a link mark stays link-free', async () => {
    const linked = (text: string, href: string) => ({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text, marks: [{ type: 'link', attrs: { href } }] }],
        },
      ],
    });
    const update = {
      ...PUBLIC,
      body_rich_content: linked('업데이트 링크', 'https://example.com/update'),
    };
    stubFetch(() =>
      json({
        ...OPERATOR_ENVELOPE,
        description_rich_content: linked('화면 열기', 'https://example.com/admin/audit?v=1'),
        conversation_timeline: [update],
      }),
    );
    mount();
    const anchor = await screen.findByRole('link', { name: '화면 열기' });
    expect(anchor.getAttribute('href')).toBe('https://example.com/admin/audit?v=1');
    expect(anchor.getAttribute('target')).toBe('_blank');
    expect(await screen.findByText('업데이트 링크')).toBeTruthy();
    expect(screen.queryByRole('link', { name: '업데이트 링크' })).toBeNull();
  });

  it("shows not-found, with nothing of the VOC in the DOM, when the signed-in actor is not its reporter (an operator reading another actor's VOC)", async () => {
    stubFetch(() => json(OPERATOR_ENVELOPE), OPERATOR);
    mount();
    expect(await screen.findByText('VOC를 찾을 수 없습니다')).toBeTruthy();
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(
      /로그인이 안 됩니다|VOC-0042|아침마다 로그인이 실패합니다|log\.txt|재현했습니다/,
    );
    expect(screen.queryByTestId('reporter-voc-detail')).toBeNull();
    expect(screen.queryByTestId('reporter-reply-composer')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('draws no outer padding when embedded in the host detail slot, and the page frame otherwise', async () => {
    stubFetch(() => json(OPERATOR_ENVELOPE));
    mount('embedded');
    const embedded = await screen.findByTestId('reporter-voc-detail');
    expect(embedded.className).not.toMatch(/\bp[xtb]-/);
    cleanup();
    mount();
    expect((await screen.findByTestId('reporter-voc-detail')).className).toMatch(/px-6/);
  });

  it('shows the not-found state for a 404', async () => {
    stubFetch(() => json({ code: 'not_found.record', message: 'not found' }, 404));
    mount();
    // The detail query retries once (1 s) before it reports the error.
    expect(await screen.findByText('VOC를 찾을 수 없습니다', {}, { timeout: 4000 })).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows not-found for a summary envelope, never the permission view', async () => {
    stubFetch(() =>
      json({
        id: VOC_ID,
        display_id: 'VOC-0042',
        primary_managed_system_id: MS,
        reporter_facing_status: 'received',
        created_at: '2026-07-20T00:00:00.000Z',
        permission_decisions: {
          _self: {
            state: 'request_access',
            requestable_permission: {
              permission: 'voc.read',
              managed_system_id: MS,
              reason_required: false,
            },
          },
        },
      }),
    );
    mount();
    expect(await screen.findByText('VOC를 찾을 수 없습니다')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
    expect(document.body.textContent).not.toMatch(/권한 요청|request/i);
  });

  it('shows the generic error for any other failure', async () => {
    stubFetch(() => json({ code: 'internal.unexpected', message: 'boom' }, 500));
    mount();
    expect(
      await screen.findByText('데이터를 불러오지 못했습니다.', {}, { timeout: 4000 }),
    ).toBeTruthy();
  });
});
